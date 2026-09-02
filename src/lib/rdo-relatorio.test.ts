import { describe, expect, it } from 'vitest';
import {
  dataCalendario, diaDaSemana, percentualDaAtividade,
  prazosDaObra, rotuloDoPapel, totaisDaEquipe,
} from './rdo-relatorio';

describe('prazosDaObra', () => {
  // o caso de referência: obra 17/08/2026 → 17/01/2028, relatório nº 1
  it('conta inclusivo como o documento de referência', () => {
    const p = prazosDaObra('2026-08-17', '2028-01-17', '2026-08-17');
    expect(p).toEqual({ contratual: 519, decorrido: 1, aVencer: 518 });
  });

  it('meio da obra', () => {
    const p = prazosDaObra('2026-08-17', '2028-01-17', '2026-09-02');
    expect(p.decorrido).toBe(17);
    expect(p.aVencer).toBe(502);
  });

  it('relatório após o fim não passa do contratual', () => {
    const p = prazosDaObra('2026-01-01', '2026-01-10', '2026-02-01');
    expect(p).toEqual({ contratual: 10, decorrido: 10, aVencer: 0 });
  });

  it('sem datas do projeto, prazos ficam vazios', () => {
    expect(prazosDaObra(null, null, '2026-08-17'))
      .toEqual({ contratual: null, decorrido: null, aVencer: null });
  });

  it('só com início, decorrido existe e o resto não', () => {
    const p = prazosDaObra('2026-08-01', null, '2026-08-03');
    expect(p).toEqual({ contratual: null, decorrido: 3, aVencer: null });
  });

  it('relatório anterior ao início não conta decorrido', () => {
    expect(prazosDaObra('2026-08-17', '2028-01-17', '2026-08-10').decorrido).toBeNull();
  });
});

describe('diaDaSemana', () => {
  it('nomeia em pt-BR com maiúsculas', () => {
    expect(diaDaSemana('2026-08-17')).toBe('Segunda-Feira');
    expect(diaDaSemana('2026-08-22')).toBe('Sábado');
  });
});

describe('dataCalendario', () => {
  it('converte Date para YYYY-MM-DD e null passa reto', () => {
    expect(dataCalendario(new Date('2026-08-17T00:00:00Z'))).toBe('2026-08-17');
    expect(dataCalendario(null)).toBeNull();
  });
});

describe('percentualDaAtividade', () => {
  it('lê o percentual válido e arredonda', () => {
    expect(percentualDaAtividade({ percentual: 60 })).toBe(60);
    expect(percentualDaAtividade({ percentual: '59.6' })).toBe(60);
  });
  it('rejeita fora de faixa ou ausente', () => {
    expect(percentualDaAtividade({ percentual: 120 })).toBeNull();
    expect(percentualDaAtividade(null)).toBeNull();
    expect(percentualDaAtividade({})).toBeNull();
  });
});

describe('totaisDaEquipe', () => {
  it('soma própria e terceiros em separado', () => {
    expect(totaisDaEquipe([
      { kind: 'PROPRIA', quantity: 4 },
      { kind: 'TERCEIRO', quantity: 2 },
      { kind: 'PROPRIA', quantity: 1 },
    ])).toEqual({ propria: 5, terceiros: 2, total: 7 });
  });
  it('kind desconhecido conta como própria', () => {
    expect(totaisDaEquipe([{ kind: '', quantity: 3 }]).propria).toBe(3);
  });
});

describe('rotuloDoPapel', () => {
  it('traduz os três papéis', () => {
    expect(rotuloDoPapel('GERENCIA')).toBe('Gerência de Engenharia');
    expect(rotuloDoPapel('FISCALIZACAO')).toBe('Fiscalização');
    expect(rotuloDoPapel('OUTRO')).toBe('OUTRO');
  });
});
