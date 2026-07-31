import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { assinaturaValida } from './webhook-assinatura';

const SEGREDO = `whsec_${Buffer.from('segredo-de-teste-para-assinatura').toString('base64')}`;

function assinar(id: string, timestamp: string, corpo: string, segredo = SEGREDO): string {
  const chave = Buffer.from(segredo.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', chave).update(`${id}.${timestamp}.${corpo}`).digest('base64')}`;
}

const AGORA = () => String(Math.floor(Date.now() / 1000));

describe('assinaturaValida', () => {
  it('aceita a assinatura correta', () => {
    const ts = AGORA();
    const corpo = '{"type":"email.delivered"}';
    const ok = assinaturaValida(SEGREDO, {
      id: 'msg_1', timestamp: ts, signature: assinar('msg_1', ts, corpo),
    }, corpo);
    expect(ok).toBe(true);
  });

  it('recusa corpo adulterado', () => {
    const ts = AGORA();
    const assinatura = assinar('msg_1', ts, '{"type":"email.delivered"}');
    const ok = assinaturaValida(SEGREDO, {
      id: 'msg_1', timestamp: ts, signature: assinatura,
    }, '{"type":"email.bounced"}');
    expect(ok).toBe(false);
  });

  it('recusa assinatura feita com outro segredo', () => {
    const ts = AGORA();
    const corpo = '{"type":"email.delivered"}';
    const outro = `whsec_${Buffer.from('outro-segredo-qualquer-aqui-vai').toString('base64')}`;
    const ok = assinaturaValida(SEGREDO, {
      id: 'msg_1', timestamp: ts, signature: assinar('msg_1', ts, corpo, outro),
    }, corpo);
    expect(ok).toBe(false);
  });

  it('recusa requisição antiga (proteção contra reenvio)', () => {
    const antigo = String(Math.floor(Date.now() / 1000) - 600);
    const corpo = '{"type":"email.delivered"}';
    const ok = assinaturaValida(SEGREDO, {
      id: 'msg_1', timestamp: antigo, signature: assinar('msg_1', antigo, corpo),
    }, corpo);
    expect(ok).toBe(false);
  });

  it('recusa tudo quando o segredo não está configurado', () => {
    const ts = AGORA();
    const corpo = '{}';
    expect(assinaturaValida(undefined, {
      id: 'msg_1', timestamp: ts, signature: assinar('msg_1', ts, corpo),
    }, corpo)).toBe(false);
  });

  it('recusa quando faltam cabeçalhos', () => {
    expect(assinaturaValida(SEGREDO, { id: null, timestamp: AGORA(), signature: 'v1,x' }, '{}')).toBe(false);
    expect(assinaturaValida(SEGREDO, { id: 'm', timestamp: null, signature: 'v1,x' }, '{}')).toBe(false);
    expect(assinaturaValida(SEGREDO, { id: 'm', timestamp: AGORA(), signature: null }, '{}')).toBe(false);
  });

  it('aceita quando o cabeçalho traz várias assinaturas', () => {
    const ts = AGORA();
    const corpo = '{"type":"email.opened"}';
    const boa = assinar('msg_1', ts, corpo);
    const ok = assinaturaValida(SEGREDO, {
      id: 'msg_1', timestamp: ts, signature: `v1,YXNzaW5hdHVyYS1hbnRpZ2E= ${boa}`,
    }, corpo);
    expect(ok).toBe(true);
  });
});
