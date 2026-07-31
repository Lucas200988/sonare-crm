import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

type MensagemTeste = {
  para: string;
  assunto: string;
  texto: string;
  responderPara?: string | null;
  remetente?: string | null;
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
    // o Resend devolve o id da mensagem, que o webhook de entrega usa depois
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ id: 'msg_resend_123' }),
    });
    vi.stubGlobal('fetch', fetchFalso);
    const { enviarEmail } = await import('./mail');
    const r = await enviarEmail(msg);
    expect(r).toEqual({ ok: true, providerId: 'msg_resend_123' });
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

  it('usa o remetente da mensagem no lugar do MAIL_FROM', async () => {
    const corpo = await capturarEnvio({
      para: 'cliente@empresa.com.br',
      assunto: 'Proposta',
      texto: 'Segue.',
      remetente: 'SONARE Engenharia <orcamentos@sonare.com.br>',
    });
    expect(corpo.from).toBe('SONARE Engenharia <orcamentos@sonare.com.br>');
  });
});

describe('remetenteComCaixa', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; vi.resetModules(); });

  async function carregar() {
    vi.resetModules();
    return (await import('./mail')).remetenteComCaixa;
  }

  it('troca só a caixa, preservando nome e domínio verificado', async () => {
    process.env.MAIL_FROM = 'SONARE Engenharia <nao-responda@sonareengenharia.com.br>';
    const remetenteComCaixa = await carregar();
    expect(remetenteComCaixa('orcamentos'))
      .toBe('SONARE Engenharia <orcamentos@sonareengenharia.com.br>');
  });

  it('aceita um rótulo próprio', async () => {
    process.env.MAIL_FROM = 'SONARE Engenharia <nao-responda@sonare.com.br>';
    const remetenteComCaixa = await carregar();
    expect(remetenteComCaixa('financeiro', 'SONARE Financeiro'))
      .toBe('SONARE Financeiro <financeiro@sonare.com.br>');
  });

  it('devolve o MAIL_FROM intacto quando o formato é inesperado', async () => {
    // sem o "Nome <...>", não dá para trocar a caixa com segurança
    process.env.MAIL_FROM = 'orcamentos@sonare.com.br';
    const remetenteComCaixa = await carregar();
    expect(remetenteComCaixa('orcamentos')).toBe('orcamentos@sonare.com.br');
  });
});
