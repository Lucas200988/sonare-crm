import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Modelos de raciocínio recusam `temperature` diferente de 1 e devolvem 400.
 * A chamada precisa tirar o parâmetro recusado e tentar de novo, senão a
 * geração morre com um erro cru do provedor na cara do usuário.
 */
describe('chamada ao OpenAI — parâmetro recusado pelo modelo', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.APP_SECRET = 'segredo-de-teste';
    process.env.OPENAI_API_KEY = 'sk-teste';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const recusaTemperature = {
    ok: false,
    status: 400,
    text: async () => JSON.stringify({
      error: {
        message: "Unsupported value: 'temperature' does not support 0.4 with this model.",
        type: 'invalid_request_error',
        param: 'temperature',
        code: 'unsupported_value',
      },
    }),
  };

  const respostaBoa = {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ objeto_proposta: 'Projeto elétrico.' }) } }],
    }),
  };

  /** Carrega o gerador com a configuração de IA vinda do ambiente. */
  async function carregar() {
    vi.doMock('@/server/db', () => ({
      prisma: {
        systemSetting: {
          findMany: async () => [
            { key: 'ai.provider', value: 'openai' },
            { key: 'ai.model', value: 'gpt-5' },
            { key: 'ai.enabled', value: true },
          ],
        },
      },
    }));
    return import('./scope-generator');
  }

  it('tira o temperature e refaz a chamada', async () => {
    const fetchFalso = vi.fn()
      .mockResolvedValueOnce(recusaTemperature)
      .mockResolvedValueOnce(respostaBoa);
    vi.stubGlobal('fetch', fetchFalso);

    const { generateScope } = await carregar();
    const r = await generateScope('empresa-1', {
      serviceType: 'Projeto elétrico',
      description: 'Subestação de 300 kVA para unidade industrial.',
    });

    expect(fetchFalso).toHaveBeenCalledTimes(2);
    const primeira = JSON.parse(fetchFalso.mock.calls[0][1].body as string);
    const segunda = JSON.parse(fetchFalso.mock.calls[1][1].body as string);
    expect(primeira.temperature).toBe(0.4);
    expect(segunda).not.toHaveProperty('temperature');
    // o resto do pedido continua igual — só o parâmetro recusado sai
    expect(segunda.model).toBe('gpt-5');
    expect(segunda.messages).toHaveLength(2);

    expect('scope' in r && r.scope.scope).toContain('Projeto elétrico.');
  });

  it('não repete a chamada quando o erro é outro', async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Incorrect API key', code: 'invalid_api_key' } }),
    });
    vi.stubGlobal('fetch', fetchFalso);

    const { generateScope } = await carregar();
    const r = await generateScope('empresa-1', {
      serviceType: 'Projeto elétrico',
      description: 'Subestação de 300 kVA para unidade industrial.',
    });

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect('error' in r && r.error).toContain('Chave de API inválida');
  });

  it('desiste quando o modelo recusa o mesmo parâmetro de novo', async () => {
    // sem esta guarda, um provedor teimoso deixaria o laço rodando
    const fetchFalso = vi.fn().mockResolvedValue(recusaTemperature);
    vi.stubGlobal('fetch', fetchFalso);

    const { generateScope } = await carregar();
    const r = await generateScope('empresa-1', {
      serviceType: 'Projeto elétrico',
      description: 'Subestação de 300 kVA para unidade industrial.',
    });

    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect('error' in r).toBe(true);
  });
});
