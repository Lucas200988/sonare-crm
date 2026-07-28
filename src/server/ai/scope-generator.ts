import 'server-only';
import { prisma } from '@/server/db';
import { decryptSecret } from '@/server/crypto';

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
  description: string; // briefing livre do usuário
  discipline?: string | null;
  clientType?: string | null; // condomínio, indústria, residencial…
  area?: string | null; // ex.: "450 m²"
  extraContext?: string | null;
};

export type GeneratedScope = {
  scope: string;
  premises: string;
  exclusions: string;
  executionDeadline: string;
  items: Array<{ description: string; unit: string; quantity: string }>;
};

const SYSTEM_PROMPT = `Você é engenheiro sênior da SONARE Engenharia (Cuiabá/MT), especializada em projetos e laudos de engenharia elétrica, civil, telecomunicações, energia solar, SPDA e segurança contra incêndio.

Sua tarefa é redigir o conteúdo técnico de uma PROPOSTA COMERCIAL a partir de um briefing curto.

Regras obrigatórias:
- Escreva em português do Brasil, tom técnico-comercial, na terceira pessoa.
- Cite normas brasileiras aplicáveis (ABNT NBR) quando pertinente ao serviço.
- Cada linha do escopo, premissas e exclusões deve começar com "- " (hífen e espaço).
- Escopo: entre 5 e 12 linhas cobrindo as etapas de execução e os entregáveis.
- Premissas: 3 a 6 linhas — o que a CONTRATANTE deve fornecer ou garantir.
- Exclusões: 3 a 6 linhas — o que NÃO está incluso (execução de obra, materiais, taxas etc.).
- Itens: liste os itens faturáveis do serviço (sem preço). Use unidades como vb, un, m², h.
- NUNCA invente valores monetários, prazos legais ou dados do cliente que não estejam no briefing.
- Se o briefing for vago, produza um escopo padrão do tipo de serviço e mantenha-o genérico.

Responda SOMENTE com JSON válido no formato:
{"scope":"...","premises":"...","exclusions":"...","executionDeadline":"...","items":[{"description":"...","unit":"vb","quantity":"1"}]}`;

function buildUserPrompt(b: ScopeBriefing): string {
  const lines = [
    `Tipo de serviço: ${b.serviceType}`,
    b.discipline ? `Disciplina: ${b.discipline}` : null,
    b.clientType ? `Tipo de cliente/edificação: ${b.clientType}` : null,
    b.area ? `Área / porte: ${b.area}` : null,
    `Briefing: ${b.description}`,
    b.extraContext ? `Contexto adicional: ${b.extraContext}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function parseResponse(raw: string): GeneratedScope {
  // Modelos às vezes devolvem o JSON dentro de bloco markdown
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<GeneratedScope>;
  return {
    scope: String(parsed.scope ?? '').trim(),
    premises: String(parsed.premises ?? '').trim(),
    exclusions: String(parsed.exclusions ?? '').trim(),
    executionDeadline: String(parsed.executionDeadline ?? '').trim(),
    items: Array.isArray(parsed.items)
      ? parsed.items.slice(0, 30).map((i) => ({
          description: String(i.description ?? '').trim(),
          unit: String(i.unit ?? 'vb').trim(),
          quantity: String(i.quantity ?? '1').trim(),
        })).filter((i) => i.description !== '')
      : [],
  };
}

async function callOpenAI(config: AiConfig, briefing: ScopeBriefing): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(briefing) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
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
      max_tokens: 2000,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(briefing) }],
    }),
    signal: AbortSignal.timeout(60_000),
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
    return { scope: parseResponse(raw) };
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

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
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
    const raw = await callTextModel(config, prompt, text);
    const cleaned = raw.trim().replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
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
