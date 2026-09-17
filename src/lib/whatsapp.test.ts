import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  assinaturaMetaValida, comandoDaMensagem, extrairMensagens,
  mesmosNumerosBr, numeroCanonicoBr,
} from './whatsapp';

describe('numeroCanonicoBr', () => {
  it('normaliza os formatos brasileiros para DDD + 8 dígitos', () => {
    expect(numeroCanonicoBr('5565984636872')).toBe('6584636872');
    expect(numeroCanonicoBr('(65) 98463-6872')).toBe('6584636872');
    expect(numeroCanonicoBr('65 8463-6872')).toBe('6584636872');
    expect(numeroCanonicoBr('+55 65 98463-6872')).toBe('6584636872');
  });

  it('compara formatos diferentes do mesmo número', () => {
    expect(mesmosNumerosBr('5565984636872', '(65) 98463-6872')).toBe(true);
    expect(mesmosNumerosBr('5565984636872', '(65) 98463-0000')).toBe(false);
    // curto demais nunca casa — evita colisão com cadastro vazio/lixo
    expect(mesmosNumerosBr('', '')).toBe(false);
  });
});

describe('extrairMensagens', () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: '5565984636872', profile: { name: 'Lucas' } }],
          messages: [
            { id: 'wamid.1', from: '5565984636872', type: 'text', text: { body: ' Como estamos hoje? ' } },
            { id: 'wamid.2', from: '5565984636872', type: 'image' },
          ],
        },
      }],
    }],
  };

  it('extrai só as mensagens de texto, com remetente e nome', () => {
    const m = extrairMensagens(payload);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      de: '5565984636872', nome: 'Lucas', texto: 'Como estamos hoje?', idMensagem: 'wamid.1',
    });
  });

  it('payload de status (sem messages) devolve lista vazia', () => {
    expect(extrairMensagens({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(extrairMensagens({})).toEqual([]);
  });
});

describe('assinaturaMetaValida', () => {
  const corpo = '{"entry":[]}';
  const segredo = 'app-secret-teste';
  const boa = `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;

  it('aceita a assinatura correta e recusa as demais', () => {
    expect(assinaturaMetaValida(corpo, boa, segredo)).toBe(true);
    expect(assinaturaMetaValida(corpo, boa, 'outro-segredo')).toBe(false);
    expect(assinaturaMetaValida(`${corpo} `, boa, segredo)).toBe(false);
    expect(assinaturaMetaValida(corpo, 'sha256=deadbeef', segredo)).toBe(false);
    expect(assinaturaMetaValida(corpo, null, segredo)).toBe(false);
  });
});

describe('comandoDaMensagem', () => {
  it('reconhece os comandos por palavra exata, com tolerância de caixa', () => {
    expect(comandoDaMensagem('confirmar')).toBe('CONFIRMAR');
    expect(comandoDaMensagem('SIM!')).toBe('SIM');
    expect(comandoDaMensagem('cancela')).toBe('CANCELAR');
    expect(comandoDaMensagem('não')).toBe('CANCELAR');
  });

  it('frase normal não é comando — "sim, pode ser amanhã" vai para a conversa', () => {
    expect(comandoDaMensagem('sim, pode ser amanhã')).toBeNull();
    expect(comandoDaMensagem('quero confirmar o prazo do projeto')).toBeNull();
  });
});
