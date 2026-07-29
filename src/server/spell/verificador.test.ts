import { describe, expect, it } from 'vitest';
import { FiltroBloom, dimensionar } from './bloom';
import { palavraExiste, sugerir, verificarLote } from './verificador';

describe('FiltroBloom', () => {
  it('reconhece o que foi adicionado e recusa o resto', () => {
    const filtro = new FiltroBloom(dimensionar(100, 1 / 500));
    filtro.adicionar('projeto');
    filtro.adicionar('elétrico');
    expect(filtro.contem('projeto')).toBe(true);
    expect(filtro.contem('elétrico')).toBe(true);
    expect(filtro.contem('tetasr')).toBe(false);
  });

  it('sobrevive à serialização', () => {
    const filtro = new FiltroBloom(dimensionar(10, 1 / 500));
    filtro.adicionar('subestação');
    const clone = FiltroBloom.desserializar(filtro.serializar());
    expect(clone.contem('subestação')).toBe(true);
    expect(clone.contem('fdasdcd')).toBe(false);
  });

  it('rejeita arquivo corrompido', () => {
    expect(() => FiltroBloom.desserializar(Buffer.from('lixo'))).toThrow();
  });
});

// Estes usam o dicionário real gerado em public/dicionario-pt-br.bloom
describe('verificador pt-BR', () => {
  it('aceita o vocabulário técnico do dia a dia', () => {
    for (const p of [
      'projeto', 'elétrico', 'subestação', 'aterramento', 'dimensionamento',
      'concessionária', 'instalações', 'Elaboração', 'memorial', 'engenharia',
    ]) {
      expect(palavraExiste(p), p).toBe(true);
    }
  });

  it('aceita siglas e termos próprios do setor', () => {
    for (const p of ['SPDA', 'sonare', 'Cuiabá', 'unifilares', 'layout']) {
      expect(palavraExiste(p), p).toBe(true);
    }
  });

  it('recusa erros de digitação', () => {
    for (const p of ['tetasr', 'fdasdcd', 'projeo', 'eletryco']) {
      expect(palavraExiste(p), p).toBe(false);
    }
  });

  it('sugere a palavra pretendida', () => {
    expect(sugerir('servico')).toContain('serviço');
    expect(sugerir('eletrico')).toContain('elétrico');
    expect(sugerir('tecnico')).toContain('técnico');
  });

  it('preserva a maiúscula da palavra original', () => {
    expect(sugerir('Servico')).toContain('Serviço');
  });

  it('devolve só as erradas no lote', () => {
    const erradas = verificarLote(['projeto', 'servico', 'memorial']);
    expect(Object.keys(erradas)).toEqual(['servico']);
    expect(erradas.servico).toContain('serviço');
  });
});
