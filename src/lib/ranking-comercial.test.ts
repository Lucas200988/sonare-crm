import { describe, expect, it } from 'vitest';
import {
  extrairPorte, notaDeRecencia, notaEstrutural, proximidadeDePorte, ranquear,
  similaridadeDeTermos, type CandidataSemelhante,
} from './ranking-comercial';

const candidata = (extra: Partial<CandidataSemelhante>): CandidataSemelhante => ({
  id: 'x', serviceType: 'Projeto elétrico', disciplines: ['Elétrica'], segment: 'Indústria',
  city: 'Cuiabá', state: 'MT', area: 5000, clientId: 'c1', issuedAt: new Date(),
  aprovada: false, convertida: false, recusada: false, texto: 'projeto elétrico galpão industrial 5000 m²',
  ...extra,
});

describe('ranking híbrido de propostas semelhantes', () => {
  it('extrai porte de texto livre (m², kWp, kVA)', () => {
    expect(extrairPorte('galpão industrial de 4.500 m² em Rondonópolis').area).toBe(4500);
    expect(extrairPorte('usina de 1.2 MWp com 800 kWp inicial').potenciaKwp).toBe(800);
    expect(extrairPorte('posto de transformação 75 kVA').potenciaKva).toBe(75);
    expect(extrairPorte('indústria de 10 mil metros').area).toBe(10_000);
  });

  it('porte próximo pontua alto; porte distante, baixo', () => {
    expect(proximidadeDePorte(5000, 4800)).toBeCloseTo(0.96, 2);
    expect(proximidadeDePorte(5000, 500)).toBeCloseTo(0.1, 2);
    expect(proximidadeDePorte(null, 500)).toBeNull();
  });

  it('recência decai ao longo de 3 anos', () => {
    const hoje = new Date('2026-09-21');
    expect(notaDeRecencia(new Date('2026-09-01'), hoje)).toBeGreaterThan(0.95);
    expect(notaDeRecencia(new Date('2025-03-21'), hoje)).toBeCloseTo(0.5, 1);
    expect(notaDeRecencia(new Date('2022-01-01'), hoje)).toBe(0);
    expect(notaDeRecencia(null, hoje)).toBe(0);
  });

  it('estrutural: mesmo serviço, mesma cidade e mesmo cliente sobem a nota', () => {
    const q = { tipoDeServico: 'Projeto elétrico', cidade: 'Cuiabá', estado: 'MT', area: 5000, clienteId: 'c1' };
    expect(notaEstrutural(candidata({}), q)).toBeCloseTo(1, 5);
    expect(notaEstrutural(candidata({ serviceType: 'Laudo de SPDA', city: 'Sorriso', clientId: 'c9', area: 500 }), q)).toBeLessThan(0.3);
  });

  it('termos: substituto da semântica quando não há embedding', () => {
    expect(similaridadeDeTermos('projeto elétrico galpão industrial', 'projeto elétrico de galpão')).toBeGreaterThan(0.4);
    expect(similaridadeDeTermos('laudo SPDA', 'projeto elétrico')).toBe(0);
  });

  it('desfecho comercial: convertida > aceita > sem desfecho > recusada, com o resto igual', () => {
    const q = { tipoDeServico: 'Projeto elétrico', descricao: 'projeto elétrico galpão 5000 m²' };
    const r = ranquear([
      candidata({ id: 'recusada', recusada: true }),
      candidata({ id: 'convertida', convertida: true, aprovada: true }),
      candidata({ id: 'aceita', aprovada: true }),
      candidata({ id: 'neutra' }),
    ], q);
    expect(r.map((x) => x.id)).toEqual(['convertida', 'aceita', 'neutra', 'recusada']);
  });

  it('proposta velha e de outro segmento perde para a recente e parecida, mesmo com texto igual', () => {
    const q = { tipoDeServico: 'Projeto elétrico', segmento: 'Indústria', area: 5000, descricao: 'projeto elétrico galpão 5000 m²' };
    const r = ranquear([
      candidata({ id: 'velha', issuedAt: new Date(Date.now() - 3 * 365 * 86_400_000), segment: 'Residencial', area: 400 }),
      candidata({ id: 'recente' }),
    ], q);
    expect(r[0].id).toBe('recente');
    expect(r[0].nota).toBeGreaterThan(r[1].nota + 0.3);
  });

  it('com embedding, a semântica do banco pesa; sem, o peso vai ao estrutural', () => {
    const q = { tipoDeServico: 'Projeto elétrico', descricao: 'projeto elétrico' };
    const com = ranquear([candidata({ semantica: 0.9 })], q)[0];
    const sem = ranquear([candidata({ semantica: null })], q)[0];
    expect(com.componentes.semantica).toBe(0.9);
    expect(sem.componentes.semantica).toBeLessThan(0.9);
    expect(com.nota).toBeGreaterThan(0);
  });
});
