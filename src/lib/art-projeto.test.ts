import { describe, expect, it } from 'vitest';
import { exigeAtencao, situacaoArt } from './art-projeto';

const emitida = { numero: 'ART-123456', status: 'EMITIDA' };
const cancelada = { numero: 'ART-000001', status: 'CANCELADA' };

describe('situacaoArt', () => {
  it('cobra quando o projeto exige ART e nenhuma foi registrada', () => {
    const s = situacaoArt('NECESSARIA', []);
    expect(s.nivel).toBe('pendente');
    expect(s.detalhe).toContain('nenhuma foi registrada');
  });

  it('fica em ordem quando a ART exigida está registrada', () => {
    const s = situacaoArt('NECESSARIA', [emitida]);
    expect(s.nivel).toBe('ok');
    expect(s.rotulo).toBe('ART ART-123456');
  });

  it('lista quando há mais de uma ART', () => {
    const s = situacaoArt('NECESSARIA', [emitida, { numero: 'ART-999', status: 'BAIXADA' }]);
    expect(s.nivel).toBe('ok');
    expect(s.rotulo).toBe('2 ARTs registradas');
    expect(s.detalhe).toContain('ART-999');
  });

  it('ART cancelada não cobre o projeto', () => {
    // o documento existiu, mas não vale mais — continua pendente
    const s = situacaoArt('NECESSARIA', [cancelada]);
    expect(s.nivel).toBe('pendente');
  });

  it('dispensa registrada não gera alerta', () => {
    expect(situacaoArt('DISPENSADA', []).nivel).toBe('ok');
  });

  it('sem informação e sem ART é o caso que mais preocupa', () => {
    const s = situacaoArt('NAO_INFORMADO', []);
    expect(s.nivel).toBe('indefinido');
    expect(s.detalhe).toContain('Ninguém informou');
  });

  it('sem informação, mas com ART emitida, não cobra nada', () => {
    /*
     * Alguém já emitiu: a necessidade está demonstrada na prática, e exigir
     * o registro formal da decisão seria burocracia.
     */
    const s = situacaoArt('NAO_INFORMADO', [emitida]);
    expect(s.nivel).toBe('ok');
  });

  it('sem informação e só com ART cancelada volta a preocupar', () => {
    expect(situacaoArt('NAO_INFORMADO', [cancelada]).nivel).toBe('indefinido');
  });
});

describe('exigeAtencao', () => {
  it('aponta os dois casos que pedem ação', () => {
    expect(exigeAtencao('NECESSARIA', [])).toBe(true);
    expect(exigeAtencao('NAO_INFORMADO', [])).toBe(true);
  });

  it('não aponta o que está resolvido', () => {
    expect(exigeAtencao('DISPENSADA', [])).toBe(false);
    expect(exigeAtencao('NECESSARIA', [emitida])).toBe(false);
  });
});
