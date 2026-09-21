import 'server-only';
import { prisma } from '@/server/db';
import { decryptSecret } from '@/server/crypto';

/**
 * AI Core — o único ponto do sistema que fala com provedores de IA.
 *
 * Concentra configuração, compatibilidade com modelos de raciocínio, retry
 * de parâmetro recusado, timeout, loop de tool calling e a métrica de uso
 * (AiCall). Os casos de uso — assistente de escopo, revisão, Jarvis — usam
 * este núcleo e nunca chamam o provedor por conta própria.
 */

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

/**
 * Modelo de raciocínio (série o, família GPT-5)?
 *
 * Eles gastam tokens "pensando" antes de escrever e recusam `temperature`
 * diferente de 1 — o corpo da chamada precisa mudar de acordo.
 */
export function ehRaciocinio(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model.trim());
}

/** Ajustes que só valem para modelos de raciocínio. */
function ajustarParaModelo(model: string, corpo: Record<string, unknown>): Record<string, unknown> {
  if (!ehRaciocinio(model)) return corpo;
  const semTemperatura = Object.fromEntries(
    Object.entries(corpo).filter(([chave]) => chave !== 'temperature'),
  );
  return { ...semTemperatura, reasoning_effort: 'low' };
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

// ---------- Métrica de uso ----------

/** Quem está gastando e para quê — vai para a tabela AiCall. */
export type MedicaoIa = {
  companyId: string;
  userId?: string | null;
  useCase: string;
};

type UsoDaChamada = { tokensInput: number; tokensOutput: number };

/**
 * Registra a chamada sem nunca derrubar o caso de uso: a métrica que falhar
 * (banco fora, teste com prisma mockado) vira log e a resposta segue.
 */
async function registrarChamada(
  medicao: MedicaoIa, config: AiConfig,
  dados: { status: 'ok' | 'error' | 'timeout'; error?: string; latencyMs: number; uso: UsoDaChamada },
): Promise<void> {
  try {
    await prisma.aiCall.create({
      data: {
        companyId: medicao.companyId,
        userId: medicao.userId ?? null,
        useCase: medicao.useCase,
        provider: config.provider,
        model: config.model,
        tokensInput: dados.uso.tokensInput,
        tokensOutput: dados.uso.tokensOutput,
        tokensTotal: dados.uso.tokensInput + dados.uso.tokensOutput,
        latencyMs: dados.latencyMs,
        status: dados.status,
        error: dados.error?.slice(0, 500) ?? null,
      },
    });
  } catch (e) {
    console.error('[ai] métrica não registrada:', e instanceof Error ? e.message : e);
  }
}

// ---------- Chamada OpenAI (chat completions) ----------

type MensagemOpenAI = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCallDoModelo[];
};

export type ToolCallDoModelo = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type RespostaOpenAI = {
  content: string;
  toolCalls: ToolCallDoModelo[];
  uso: UsoDaChamada;
};

/**
 * Chamada ao OpenAI que se ajusta ao modelo.
 *
 * Os modelos de raciocínio recusam parâmetros e devolvem 400. Em vez de
 * manter uma lista de quais aceitam o quê — que envelhece a cada
 * lançamento —, a chamada tira o parâmetro recusado e tenta de novo.
 */
async function chamadaOpenAI(
  config: AiConfig,
  corpo: Record<string, unknown>,
  timeoutMs: number,
): Promise<RespostaOpenAI> {
  let payload: Record<string, unknown> = {
    ...ajustarParaModelo(config.model, corpo),
    model: config.model,
  };

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.ok) {
      const json = await res.json();
      const message = json.choices?.[0]?.message ?? {};
      return {
        content: message.content ?? '',
        toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
        uso: {
          tokensInput: json.usage?.prompt_tokens ?? 0,
          tokensOutput: json.usage?.completion_tokens ?? 0,
        },
      };
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

/**
 * Uma chamada, uma resposta em texto — o caminho do assistente de escopo e
 * da revisão. Mede o uso quando o caso de uso se identifica.
 */
export async function completarTexto(
  config: AiConfig,
  corpo: Record<string, unknown>,
  timeoutMs: number,
  medicao?: MedicaoIa,
): Promise<string> {
  const inicio = Date.now();
  try {
    const r = await chamadaOpenAI(config, corpo, timeoutMs);
    if (medicao) {
      await registrarChamada(medicao, config, {
        status: 'ok', latencyMs: Date.now() - inicio, uso: r.uso,
      });
    }
    return r.content;
  } catch (e) {
    if (medicao) {
      const msg = e instanceof Error ? e.message : String(e);
      await registrarChamada(medicao, config, {
        status: msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout') ? 'timeout' : 'error',
        error: msg, latencyMs: Date.now() - inicio, uso: { tokensInput: 0, tokensOutput: 0 },
      });
    }
    throw e;
  }
}

// ---------- Conversa com ferramentas (tool calling) ----------

export type MensagemDaConversa =
  | { role: 'system' | 'user' | 'assistant'; content: string };

export type DefinicaoDeFerramenta = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/**
 * Quem executa as ferramentas que o modelo pedir.
 *
 * O executor É a allowlist: nome fora do catálogo devolve erro em texto para
 * o modelo se corrigir — nunca executa função arbitrária. A validação de
 * argumentos e o RBAC acontecem dentro dele, nunca no modelo.
 */
export type ExecutorDeFerramentas = {
  definicoes: DefinicaoDeFerramenta[];
  executar(nome: string, argumentosJson: string): Promise<string>;
};

export type PassoDeFerramenta = {
  nome: string;
  argumentos: string;
  resultado: string;
};

/** Resultado de ferramenta com teto: contexto de LLM não é lugar de dump. */
const LIMITE_RESULTADO_FERRAMENTA = 8_000;

/**
 * O loop do agente: modelo pede ferramenta → executa → devolve → repete,
 * até a resposta final ou o teto de ciclos/tempo.
 *
 * Estourou o teto, a última chamada sai SEM ferramentas: o modelo é obrigado
 * a responder com o que já tem, em vez de a conversa morrer no meio.
 */
export async function conversarComFerramentas(
  config: AiConfig,
  opts: {
    mensagens: MensagemDaConversa[];
    ferramentas: ExecutorDeFerramentas;
    medicao: MedicaoIa;
    maxCiclos?: number;
    orcamentoMs?: number;
  },
): Promise<{ resposta: string; passos: PassoDeFerramenta[] }> {
  const maxCiclos = opts.maxCiclos ?? 6;
  const orcamentoMs = opts.orcamentoMs ?? 50_000;
  const inicio = Date.now();
  const passos: PassoDeFerramenta[] = [];
  const historico: MensagemOpenAI[] = opts.mensagens.map((m) => ({ ...m }));

  const uso: UsoDaChamada = { tokensInput: 0, tokensOutput: 0 };
  const restante = () => Math.max(3_000, orcamentoMs - (Date.now() - inicio));

  try {
    for (let ciclo = 0; ciclo <= maxCiclos; ciclo++) {
      // ciclos esgotados (ou tempo curto): força a resposta final sem ferramentas
      const ultimaVolta = ciclo === maxCiclos || restante() < 8_000;

      const r = await chamadaOpenAI(config, {
        temperature: 0.2,
        messages: historico,
        ...(ultimaVolta ? {} : { tools: opts.ferramentas.definicoes, tool_choice: 'auto' }),
      }, Math.min(restante(), 35_000));

      uso.tokensInput += r.uso.tokensInput;
      uso.tokensOutput += r.uso.tokensOutput;

      if (ultimaVolta || r.toolCalls.length === 0) {
        await registrarChamada(opts.medicao, config, {
          status: 'ok', latencyMs: Date.now() - inicio, uso,
        });
        return { resposta: r.content.trim(), passos };
      }

      historico.push({ role: 'assistant', content: r.content || null, tool_calls: r.toolCalls });

      for (const chamada of r.toolCalls) {
        const resultado = (await opts.ferramentas.executar(
          chamada.function.name, chamada.function.arguments,
        )).slice(0, LIMITE_RESULTADO_FERRAMENTA);

        passos.push({
          nome: chamada.function.name,
          argumentos: chamada.function.arguments,
          resultado,
        });
        historico.push({ role: 'tool', tool_call_id: chamada.id, content: resultado });
      }
    }

    // inalcançável — a última volta sempre retorna acima
    throw new Error('Conversa não convergiu.');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await registrarChamada(opts.medicao, config, {
      status: msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout') ? 'timeout' : 'error',
      error: msg, latencyMs: Date.now() - inicio, uso,
    });
    throw e;
  }
}

// ---------- Embeddings (base de conhecimento comercial) ----------

export const MODELO_DE_EMBEDDING = 'text-embedding-3-small'; // 1536 dimensões

/**
 * Vetor de um texto, para busca semântica. Só OpenAI nesta versão; com
 * outro provedor devolve null e a busca cai para termos + estrutura.
 * Métrica registrada como qualquer chamada.
 */
export async function gerarEmbedding(
  config: AiConfig, texto: string, medicao: MedicaoIa,
): Promise<number[] | null> {
  if (config.provider !== 'openai' || !config.apiKey) return null;
  const inicio = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: MODELO_DE_EMBEDDING, input: texto.slice(0, 20_000) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const vetor: number[] | undefined = json.data?.[0]?.embedding;
    await registrarChamada(medicao, { ...config, model: MODELO_DE_EMBEDDING }, {
      status: 'ok', latencyMs: Date.now() - inicio,
      uso: { tokensInput: json.usage?.prompt_tokens ?? 0, tokensOutput: 0 },
    });
    return Array.isArray(vetor) ? vetor : null;
  } catch (e) {
    await registrarChamada(medicao, { ...config, model: MODELO_DE_EMBEDDING }, {
      status: 'error', error: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - inicio, uso: { tokensInput: 0, tokensOutput: 0 },
    });
    return null;
  }
}
