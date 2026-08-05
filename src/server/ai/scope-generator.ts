import 'server-only';
import { prisma } from '@/server/db';
import { decryptSecret } from '@/server/crypto';
import { splitForReview } from '@/lib/split-review';
import { promptDoNivel, type NivelDetalhe } from './scope-prompt';
import { parseEscopo, paraOrcamento, type GeneratedScope } from './scope-schema';

// Geração assistida de escopo de proposta.
// Suporta OpenAI (padrão) e Anthropic; a chave fica criptografada em SystemSetting
// ou, alternativamente, em variável de ambiente.

export type AiProvider = 'openai' | 'anthropic';

export type AiConfig = {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string | null;
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
};

export async function getAiConfig(companyId: string): Promise<AiConfig> {
  const settings = await prisma.systemSetting.findMany({
    where: { companyId, key: { in: ['ai.provider', 'ai.model', 'ai.apiKey', 'ai.enabled'] } },
  });
  const get = (k: string) => settings.find((s) => s.key === k)?.value;

  const provider = (get('ai.provider') as AiProvider) ?? 'openai';
  const stored = get('ai.apiKey');
  const apiKey = typeof stored === 'string' && stored
    ? decryptSecret(stored)
    : (process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? null);

  return {
    enabled: get('ai.enabled') === true && Boolean(apiKey),
    provider,
    model: (get('ai.model') as string) || DEFAULT_MODELS[provider],
    apiKey,
  };
}

export type ScopeBriefing = {
  serviceType: string; // ex.: "Projeto elétrico"
  description: string; // descrição recebida do cliente
  cliente?: string | null;
  empreendimento?: string | null;
  local?: string | null;
  objetivo?: string | null;
  discipline?: string | null;
  clientType?: string | null; // condomínio, indústria, residencial…
  area?: string | null; // ex.: "450 m²"
  /** Termo de referência, edital, memorial — o texto que o cliente mandou. */
  documentos?: string | null;
  informacoesTecnicas?: string | null;
  quantidades?: string | null;
  visitas?: string | null;
  prazoSolicitado?: string | null;
  aprovacoes?: string | null;
  entregaveisCombinados?: string | null;
  exclusoesConhecidas?: string | null;
  observacoesComerciais?: string | null;
  extraContext?: string | null;
  nivel?: NivelDetalhe;
};

export type { GeneratedScope, AnaliseComercial } from './scope-schema';

/**
 * Briefing no formato que o prompt de sistema espera.
 *
 * Campo vazio é omitido em vez de virar "não informado": linha em branco não
 * ajuda o modelo e ainda gasta contexto — e o próprio prompt manda evitar a
 * repetição de "não informado".
 */
function buildUserPrompt(b: ScopeBriefing): string {
  const campos: Array<[string, string | null | undefined]> = [
    ['Cliente', b.cliente],
    ['Empreendimento', b.empreendimento],
    ['Local', b.local],
    ['Tipo de serviço informado', b.serviceType],
    ['Disciplina', b.discipline],
    ['Tipo de cliente/edificação', b.clientType],
    ['Área / porte', b.area],
    ['Descrição recebida do cliente', b.description],
    ['Objetivo informado', b.objetivo],
    ['Documentos disponibilizados', b.documentos],
    ['Informações técnicas conhecidas', b.informacoesTecnicas],
    ['Quantidade de unidades, sistemas ou áreas', b.quantidades],
    ['Visitas previstas', b.visitas],
    ['Prazo solicitado pelo cliente', b.prazoSolicitado],
    ['Aprovações ou protocolos envolvidos', b.aprovacoes],
    ['Entregáveis previamente combinados', b.entregaveisCombinados],
    ['Itens expressamente excluídos', b.exclusoesConhecidas],
    ['Observações comerciais', b.observacoesComerciais],
    ['Contexto adicional', b.extraContext],
  ];

  const dados = campos
    .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    .map(([rotulo, v]) => `${rotulo}:\n${(v as string).trim()}`)
    .join('\n\n');

  return `Elabore o escopo técnico e comercial com base nas informações abaixo.

DADOS DA SOLICITAÇÃO
${dados}

INSTRUÇÕES ESPECÍFICAS
1. Identifique eventuais lacunas ou contradições.
2. Não inclua atividades de execução, fornecimento, aprovação ou fiscalização que não tenham sido solicitadas.
3. Quando possível, gere o escopo utilizando premissas, sem interromper o processo.
4. Faça perguntas apenas quando a resposta alterar substancialmente preço, prazo, entregáveis ou responsabilidade.
5. Retorne exclusivamente no formato JSON estabelecido no prompt de sistema.`;
}

/** O modelo recusou algum parâmetro do corpo? Devolve o nome dele. */
function parametroRecusado(corpo: string): string | null {
  try {
    const j = JSON.parse(corpo) as { error?: { code?: string; param?: string } };
    if (j.error?.code !== 'unsupported_value' && j.error?.code !== 'unsupported_parameter') {
      return null;
    }
    return j.error?.param ?? null;
  } catch {
    return null;
  }
}

/**
 * Chamada ao OpenAI que se ajusta ao modelo.
 *
 * Os modelos de raciocínio recusam `temperature` diferente de 1 e devolvem
 * 400. Em vez de manter uma lista de quais aceitam o quê — que envelhece a
 * cada lançamento —, a chamada tira o parâmetro recusado e tenta de novo.
 */
async function postOpenAI(
  config: AiConfig,
  corpo: Record<string, unknown>,
  timeoutMs: number,
): Promise<string> {
  let payload: Record<string, unknown> = { ...corpo, model: config.model };

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.ok) {
      const json = await res.json();
      return json.choices?.[0]?.message?.content ?? '';
    }

    const body = await res.text();
    const recusado = res.status === 400 ? parametroRecusado(body) : null;
    // sem parâmetro para remover — ou já removido — o erro é real
    if (!recusado || !(recusado in payload)) {
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    }
    payload = Object.fromEntries(
      Object.entries(payload).filter(([chave]) => chave !== recusado),
    );
  }

  throw new Error('OpenAI: o modelo recusou parâmetros demais na requisição.');
}

async function callOpenAI(config: AiConfig, briefing: ScopeBriefing): Promise<string> {
  return postOpenAI(config, {
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: promptDoNivel(briefing.nivel) },
      { role: 'user', content: buildUserPrompt(briefing) },
    ],
  }, 180_000);
}

async function callAnthropic(config: AiConfig, briefing: ScopeBriefing): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8000, // o JSON da proposta é longo; 4000 truncava
      temperature: 0.4,
      system: promptDoNivel(briefing.nivel),
      messages: [{ role: 'user', content: buildUserPrompt(briefing) }],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.content?.[0]?.text ?? '';
}

export async function generateScope(
  companyId: string,
  briefing: ScopeBriefing,
): Promise<{ scope: GeneratedScope } | { error: string }> {
  const config = await getAiConfig(companyId);
  if (!config.apiKey) {
    return { error: 'Nenhuma chave de API configurada. Vá em Configurações → Inteligência artificial.' };
  }
  if (!config.enabled) {
    return { error: 'A geração por IA está desativada. Ative em Configurações → Inteligência artificial.' };
  }

  try {
    const raw = config.provider === 'anthropic'
      ? await callAnthropic(config, briefing)
      : await callOpenAI(config, briefing);
    if (!raw.trim()) return { error: 'A IA retornou uma resposta vazia. Tente novamente.' };
    return { scope: paraOrcamento(parseEscopo(raw)) };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido';
    if (message.includes('401')) return { error: 'Chave de API inválida ou expirada.' };
    if (message.includes('429')) return { error: 'Limite de uso da API atingido. Tente novamente em instantes.' };
    if (message.toLowerCase().includes('timeout') || message.includes('aborted')) {
      return { error: 'A IA demorou demais para responder. Tente novamente.' };
    }
    return { error: `Falha ao gerar escopo: ${message}` };
  }
}

// ---------- Revisão ortográfica e gramatical ----------

const REVIEW_PROMPT = `Você é revisor de textos técnicos de engenharia em português do Brasil.

Corrija APENAS ortografia, acentuação, pontuação, concordância e regência do texto recebido.

Regras invioláveis:
- NÃO reescreva o texto nem mude o estilo, o tom ou a ordem das informações.
- NÃO acrescente, remova ou resuma conteúdo.
- NÃO altere números, valores, unidades, prazos, códigos de normas (ABNT NBR, NR, IEC, IEEE) nem nomes próprios.
- Preserve exatamente a formatação: quebras de linha, hífens no início das linhas, maiúsculas de títulos.
- Preserve os marcadores de formatação **negrito**, _itálico_ e a numeração "1." exatamente onde estão.
- Mantenha os termos técnicos do setor elétrico/civil como estão, mesmo que pareçam incomuns.
- Se o texto já estiver correto, devolva-o idêntico.

Responda SOMENTE com o texto corrigido, sem comentários, sem aspas e sem marcações.`;

async function callTextModel(config: AiConfig, systemPrompt: string, userText: string): Promise<string> {
  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4000,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userText }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    return json.content?.[0]?.text ?? '';
  }

  return postOpenAI(config, {
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
  }, 60_000);
}

/**
 * Revisa ortografia e gramática preservando o conteúdo técnico.
 * O `context` ajuda o modelo a não "corrigir" jargão do setor.
 */
export async function reviewText(
  companyId: string,
  text: string,
  context?: string,
): Promise<{ text: string } | { error: string }> {
  const config = await getAiConfig(companyId);
  if (!config.apiKey) {
    return { error: 'Nenhuma chave de API configurada. Vá em Configurações → Inteligência artificial.' };
  }
  if (!config.enabled) {
    return { error: 'A revisão por IA está desativada. Ative em Configurações → Inteligência artificial.' };
  }

  const prompt = context
    ? `${REVIEW_PROMPT}\n\nContexto do documento (não incluir na resposta): ${context}`
    : REVIEW_PROMPT;

  try {
    const blocos = splitForReview(text);
    const revisados: string[] = [];
    for (const bloco of blocos) {
      const raw = await callTextModel(config, prompt, bloco);
      const limpo = raw.trim().replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
      // Bloco vazio significaria perder conteúdo — preserva o original
      revisados.push(limpo || bloco);
    }
    const cleaned = revisados.join('\n\n').trim();
    if (!cleaned) return { error: 'A revisão retornou vazia. Tente novamente.' };
    return { text: cleaned };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido';
    if (message.includes('401')) return { error: 'Chave de API inválida ou expirada.' };
    if (message.includes('429')) return { error: 'Limite de uso da API atingido. Tente novamente em instantes.' };
    if (message.toLowerCase().includes('timeout') || message.includes('aborted')) {
      return { error: 'A revisão demorou demais. Tente com um trecho menor.' };
    }
    return { error: `Falha ao revisar: ${message}` };
  }
}

/** Testa a chave configurada com uma chamada mínima. */
export async function testAiConnection(companyId: string): Promise<{ ok: true; model: string } | { error: string }> {
  const config = await getAiConfig(companyId);
  if (!config.apiKey) return { error: 'Nenhuma chave de API configurada.' };

  try {
    if (config.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'ok' }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return { error: `Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}` };
    } else {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          max_completion_tokens: 16,
          messages: [{ role: 'user', content: 'ok' }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return { error: `OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true, model: config.model };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha na conexão.' };
  }
}
