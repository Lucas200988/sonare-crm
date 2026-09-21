import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { assinaturaTwilioValida, extrairMensagemTwilio, paraTwilio } from './twilio';

describe('canal Twilio', () => {
  const url = 'https://crm.sonare.com.br/api/webhooks/twilio-whatsapp';
  const token = 'auth-token-teste';
  const params = { From: 'whatsapp:+5565984636872', Body: 'como estamos?', MessageSid: 'SM1' };
  const assinar = (p: Record<string, string>, t = token) =>
    createHmac('sha1', t).update(url + Object.keys(p).sort().map((k) => k + p[k]).join('')).digest('base64');

  it('aceita a assinatura correta e recusa token, corpo ou URL diferentes', () => {
    expect(assinaturaTwilioValida(url, params, token, assinar(params))).toBe(true);
    expect(assinaturaTwilioValida(url, params, 'outro', assinar(params))).toBe(false);
    expect(assinaturaTwilioValida(url, { ...params, Body: 'x' }, token, assinar(params))).toBe(false);
    expect(assinaturaTwilioValida(`${url}?a=1`, params, token, assinar(params))).toBe(false);
    expect(assinaturaTwilioValida(url, params, token, null)).toBe(false);
  });

  it('extrai remetente em dígitos, texto e nome; ignora sem texto', () => {
    expect(extrairMensagemTwilio({ ...params, ProfileName: 'Lucas' })).toMatchObject({
      de: '5565984636872', texto: 'como estamos?', nome: 'Lucas', idMensagem: 'SM1',
    });
    expect(extrairMensagemTwilio({ From: 'whatsapp:+55659', Body: '   ' })).toBeNull();
    expect(extrairMensagemTwilio({ From: '+5565984636872', Body: 'oi' })).toBeNull();
  });

  it('formata o destinatário com o prefixo do WhatsApp e o DDI', () => {
    expect(paraTwilio('5565984636872')).toBe('whatsapp:+5565984636872');
    expect(paraTwilio('(65) 98463-6872')).toBe('whatsapp:+5565984636872');
  });
});
