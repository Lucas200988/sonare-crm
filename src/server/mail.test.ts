import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

type MensagemTeste = {
  para: string;
  assunto: string;
  texto: string;
  responderPara?: string | null;
};

/**
 * O corpo enviado ao Resend é o contrato com o provedor: se o reply_to sumir
 * daqui, a resposta do cliente vai para um endereço que ninguém lê.
 */
describe('enviarEmail — resposta do destinatário', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'chave-de-teste';
    process.env.MAIL_DRIVER = 'resend';
    process.env.MAIL_FROM = 'SONARE <nao-responda@sonare.com.br>';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
  });

  async function capturarEnvio(msg: MensagemTeste) {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchFalso);
    const { enviarEmail } = await import('./mail');
    const r = await enviarEmail(msg);
    expect(r).toEqual({ ok: true });
    return JSON.parse(fetchFalso.mock.calls[0][1].body as string);
  }

  it('manda a resposta para quem enviou', async () => {
    const corpo = await capturarEnvio({
      para: 'cliente@empresa.com.br',
      assunto: 'Proposta PROP-2026-013',
      texto: 'Segue a proposta.',
      responderPara: 'lucas@sonareengenharia.com.br',
    });
    expect(corpo.reply_to).toBe('lucas@sonareengenharia.com.br');
    // o remetente continua sendo o endereço de sistema, com domínio verificado
    expect(corpo.from).toContain('nao-responda@sonare.com.br');
  });

  it('omite o campo quando não há para onde responder', async () => {
    const corpo = await capturarEnvio({
      para: 'cliente@empresa.com.br',
      assunto: 'Aviso',
      texto: 'Mensagem automática.',
    });
    expect(corpo).not.toHaveProperty('reply_to');
  });
});
