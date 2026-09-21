import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutorDeFerramentas } from './client';

/**
 * O loop de tool calling: o modelo pede ferramenta, o núcleo executa e
 * devolve, até a resposta final — com teto de ciclos e allowlist. Provider
 * sempre mockado: a suíte nunca depende da OpenAI real.
 */

const CONFIG = {
  enabled: true, provider: 'openai' as const, model: 'gpt-4o', apiKey: 'sk-teste',
};

function respostaComFerramenta(nome: string, argumentos = '{}') {
  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: `call-${nome}`, type: 'function', function: { name: nome, arguments: argumentos } }],
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
  };
}

const respostaFinal = {
  ok: true,
  json: async () => ({
    choices: [{ message: { content: 'Tudo em ordem na operação.' } }],
    usage: { prompt_tokens: 200, completion_tokens: 50 },
  }),
};

function executorFalso(resultado = '{"ok":true}') {
  const executar = vi.fn().mockResolvedValue(resultado);
  const executor: ExecutorDeFerramentas = {
    definicoes: [{
      type: 'function',
      function: { name: 'visao_geral', description: 'teste', parameters: { type: 'object', properties: {} } },
    }],
    executar,
  };
  return { executor, executar };
}

async function carregarNucleo() {
  vi.doMock('@/server/db', () => ({
    prisma: { aiCall: { create: vi.fn().mockResolvedValue({}) } },
  }));
  return import('./client');
}

describe('conversarComFerramentas', () => {
  beforeEach(() => {
    process.env.APP_SECRET = 'segredo-de-teste';
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('executa a ferramenta pedida e devolve a resposta final', async () => {
    const fetchFalso = vi.fn()
      .mockResolvedValueOnce(respostaComFerramenta('visao_geral', '{"a":1}'))
      .mockResolvedValueOnce(respostaFinal);
    vi.stubGlobal('fetch', fetchFalso);

    const { conversarComFerramentas } = await carregarNucleo();
    const { executor, executar } = executorFalso('{"projetos":7}');

    const r = await conversarComFerramentas(CONFIG, {
      mensagens: [{ role: 'user', content: 'como estamos?' }],
      ferramentas: executor,
      medicao: { companyId: 'c1', useCase: 'manager' },
    });

    expect(executar).toHaveBeenCalledWith('visao_geral', '{"a":1}');
    expect(r.resposta).toBe('Tudo em ordem na operação.');
    expect(r.passos).toHaveLength(1);
    expect(r.passos[0]).toMatchObject({ nome: 'visao_geral', resultado: '{"projetos":7}' });

    // o resultado da ferramenta volta ao modelo na segunda chamada
    const segunda = JSON.parse(fetchFalso.mock.calls[1][1].body as string);
    const mensagemTool = segunda.messages.find((m: { role: string }) => m.role === 'tool');
    expect(mensagemTool).toMatchObject({ tool_call_id: 'call-visao_geral', content: '{"projetos":7}' });
  });

  it('estoura o teto de ciclos e força a resposta final sem ferramentas', async () => {
    // o modelo insiste em pedir ferramenta para sempre
    const fetchFalso = vi.fn().mockImplementation(async (_url, init) => {
      const corpo = JSON.parse((init as { body: string }).body);
      return corpo.tools ? respostaComFerramenta('visao_geral') : respostaFinal;
    });
    vi.stubGlobal('fetch', fetchFalso);

    const { conversarComFerramentas } = await carregarNucleo();
    const { executor } = executorFalso();

    const r = await conversarComFerramentas(CONFIG, {
      mensagens: [{ role: 'user', content: 'oi' }],
      ferramentas: executor,
      medicao: { companyId: 'c1', useCase: 'manager' },
      maxCiclos: 3,
    });

    // 3 ciclos com ferramentas + 1 chamada final forçada sem ferramentas
    expect(fetchFalso).toHaveBeenCalledTimes(4);
    const ultima = JSON.parse(fetchFalso.mock.calls[3][1].body as string);
    expect(ultima).not.toHaveProperty('tools');
    expect(r.resposta).toBe('Tudo em ordem na operação.');
    expect(r.passos).toHaveLength(3);
  });

  it('resposta direta sem ferramenta encerra no primeiro ciclo', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respostaFinal);
    vi.stubGlobal('fetch', fetchFalso);

    const { conversarComFerramentas } = await carregarNucleo();
    const { executor, executar } = executorFalso();

    const r = await conversarComFerramentas(CONFIG, {
      mensagens: [{ role: 'user', content: 'bom dia' }],
      ferramentas: executor,
      medicao: { companyId: 'c1', useCase: 'manager' },
    });

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(executar).not.toHaveBeenCalled();
    expect(r.passos).toHaveLength(0);
    expect(r.resposta).toBe('Tudo em ordem na operação.');
  });

  it('registra a métrica de uso somando os tokens das chamadas', async () => {
    const criar = vi.fn().mockResolvedValue({});
    vi.doMock('@/server/db', () => ({ prisma: { aiCall: { create: criar } } }));
    const fetchFalso = vi.fn()
      .mockResolvedValueOnce(respostaComFerramenta('visao_geral'))
      .mockResolvedValueOnce(respostaFinal);
    vi.stubGlobal('fetch', fetchFalso);

    const { conversarComFerramentas } = await import('./client');
    const { executor } = executorFalso();

    await conversarComFerramentas(CONFIG, {
      mensagens: [{ role: 'user', content: 'como estamos?' }],
      ferramentas: executor,
      medicao: { companyId: 'c1', userId: 'u1', useCase: 'manager' },
    });

    expect(criar).toHaveBeenCalledTimes(1);
    const dados = criar.mock.calls[0][0].data;
    expect(dados).toMatchObject({
      companyId: 'c1', userId: 'u1', useCase: 'manager',
      provider: 'openai', model: 'gpt-4o', status: 'ok',
      tokensInput: 300, tokensOutput: 70, tokensTotal: 370,
    });
  });

  it('erro do provedor vira exceção e a métrica registra a falha', async () => {
    const criar = vi.fn().mockResolvedValue({});
    vi.doMock('@/server/db', () => ({ prisma: { aiCall: { create: criar } } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => 'erro interno',
    }));

    const { conversarComFerramentas } = await import('./client');
    const { executor } = executorFalso();

    await expect(conversarComFerramentas(CONFIG, {
      mensagens: [{ role: 'user', content: 'oi' }],
      ferramentas: executor,
      medicao: { companyId: 'c1', useCase: 'manager' },
    })).rejects.toThrow('OpenAI 500');

    expect(criar.mock.calls[0][0].data.status).toBe('error');
  });
});

describe('limite de ritmo da OpenAI (429)', () => {
  beforeEach(() => {
    process.env.APP_SECRET = 'segredo-de-teste';
    vi.resetModules();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const limite = (quando: string) => ({
    ok: false, status: 429,
    text: async () => JSON.stringify({ error: { message: `Rate limit reached for gpt-4o on tokens per min (TPM): Limit 30000. Please try again in ${quando}.`, type: 'tokens', code: 'rate_limit_exceeded' } }),
  });

  it('lê a espera pedida, com folga e teto; cota esgotada não espera', async () => {
    const { esperaDoLimite } = await carregarNucleo();
    expect(esperaDoLimite(429, 'Please try again in 1.574s.')).toBe(2_074);
    expect(esperaDoLimite(429, 'Please try again in 350ms.')).toBe(850);
    expect(esperaDoLimite(429, 'Please try again in 58s.')).toBe(15_000);
    expect(esperaDoLimite(429, 'sem dica')).toBe(2_500);
    expect(esperaDoLimite(429, '{"error":{"code":"insufficient_quota"}}')).toBeNull();
    expect(esperaDoLimite(500, 'try again in 1s')).toBeNull();
  });

  it('espera e tenta de novo em vez de desistir; insiste no máximo 3 vezes', async () => {
    vi.useFakeTimers();
    const { completarTexto } = await carregarNucleo();

    const fetchOk = vi.fn().mockResolvedValueOnce(limite('1.2s')).mockResolvedValueOnce(respostaFinal);
    vi.stubGlobal('fetch', fetchOk);
    const ok = completarTexto(CONFIG, { messages: [] }, 10_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await ok).toBe('Tudo em ordem na operação.');
    expect(fetchOk).toHaveBeenCalledTimes(2);

    const fetchSempre = vi.fn().mockResolvedValue(limite('100ms'));
    vi.stubGlobal('fetch', fetchSempre);
    const falha = completarTexto(CONFIG, { messages: [] }, 10_000).catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await falha).toContain('429');
    expect(fetchSempre).toHaveBeenCalledTimes(4); // 1 + 3 esperas
  });
});
