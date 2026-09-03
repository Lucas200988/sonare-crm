import { describe, expect, it } from 'vitest';
import {
  classificarLocal, codigoDiario, codigoFoto, diaDaObra, distanciaMetros,
  pendenciasDoFechamento, praticavelPeloCodigo, rotuloDoClima, textoDoLocal,
} from './diario-regras';

// Praça central de Cuiabá e pontos ao redor, para distâncias conhecidas
const OBRA = { lat: -15.5989, lng: -56.0949, raioM: 500 };

describe('distanciaMetros', () => {
  it('zero para o mesmo ponto', () => {
    expect(distanciaMetros(OBRA.lat, OBRA.lng, OBRA.lat, OBRA.lng)).toBe(0);
  });

  it('um grau de latitude são ~111 km', () => {
    const d = distanciaMetros(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('classificarLocal', () => {
  it('dentro do raio confirma a presença na obra', () => {
    // ~200 m do centro
    const r = classificarLocal({ lat: -15.6007, lng: -56.0949 }, OBRA);
    expect(r.classe).toBe('DENTRO');
    expect(r.distanciaM).toBeLessThan(500);
  });

  it('pouco além do raio é "próximo", não "fora"', () => {
    /*
     * GPS urbano erra por dezenas de metros e o estacionamento fica fora da
     * cerca — tratar como "fora" geraria alerta falso todo dia.
     */
    const r = classificarLocal({ lat: -15.6080, lng: -56.0949 }, OBRA);
    expect(r.classe).toBe('PROXIMO');
  });

  it('longe de verdade é "fora"', () => {
    // outro bairro, ~5 km
    const r = classificarLocal({ lat: -15.645, lng: -56.09 }, OBRA);
    expect(r.classe).toBe('FORA');
    expect(r.distanciaM).toBeGreaterThan(1500);
  });

  it('sem GPS do aparelho não inventa classificação', () => {
    expect(classificarLocal({ lat: null, lng: null }, OBRA).classe).toBe('INDISPONIVEL');
  });

  it('obra sem geofence cadastrada também fica indisponível', () => {
    const r = classificarLocal(
      { lat: -15.6, lng: -56.09 },
      { lat: null, lng: null, raioM: null },
    );
    expect(r.classe).toBe('INDISPONIVEL');
  });

  it('sem raio cadastrado assume 500 m', () => {
    const r = classificarLocal(
      { lat: -15.6007, lng: -56.0949 },
      { ...OBRA, raioM: null },
    );
    expect(r.classe).toBe('DENTRO');
  });
});

describe('textoDoLocal', () => {
  it('distância curta em metros, longa em quilômetros', () => {
    expect(textoDoLocal('FORA', 2300)).toContain('2,3 km');
    expect(textoDoLocal('PROXIMO', 650)).toContain('650 m');
  });

  it('nunca afirma presença sem confirmação', () => {
    expect(textoDoLocal('INDISPONIVEL', null)).toBe('Localização não disponível');
  });
});

describe('codigoDiario', () => {
  it('herda o número do projeto para o RDO ser encontrável a partir do papel', () => {
    expect(codigoDiario('PRJ-2026-004', 2026, 1)).toBe('RDO-2026-004-001');
    expect(codigoDiario('PRJ-2026-004', 2026, 18)).toBe('RDO-2026-004-018');
  });

  it('não quebra com código de projeto fora do padrão', () => {
    expect(codigoDiario('OBRA-X', 2026, 2)).toBe('RDO-2026-X-002');
  });

  it('numera as fotos dentro do diário', () => {
    expect(codigoFoto('RDO-2026-004-001', 23)).toBe('RDO-2026-004-001-F023');
  });
});

describe('pendenciasDoFechamento', () => {
  const completo = {
    atividades: 3, equipes: 2, equipamentos: 1, fotos: 10,
    fotosSemCategoria: 0, ocorrenciasSemResponsavel: 0, impedimentosAbertos: 0,
  };

  it('dia completo fecha sem avisos', () => {
    expect(pendenciasDoFechamento(completo)).toEqual([]);
  });

  it('aponta o que falta, sem impedir', () => {
    const avisos = pendenciasDoFechamento({
      ...completo, atividades: 0, equipes: 0, fotosSemCategoria: 14,
    });
    expect(avisos).toHaveLength(3);
    expect(avisos.join(' ')).toContain('14 foto(s)');
  });

  it('equipamento zerado não é pendência — nem toda obra usa', () => {
    expect(pendenciasDoFechamento({ ...completo, equipamentos: 0 })).toEqual([]);
  });
});

describe('diaDaObra', () => {
  it('22h em Cuiabá ainda é o mesmo dia, apesar de já ser amanhã em UTC', () => {
    // 2026-08-08 22:30 em Cuiabá (UTC-4) = 2026-08-09 02:30 UTC
    const noite = new Date('2026-08-09T02:30:00Z');
    expect(diaDaObra(noite)).toBe('2026-08-08');
  });

  it('meio-dia é o mesmo dia em qualquer leitura', () => {
    expect(diaDaObra(new Date('2026-08-08T16:00:00Z'))).toBe('2026-08-08');
  });
});

describe('rotuloDoClima', () => {
  it('traduz os códigos WMO mais comuns', () => {
    expect(rotuloDoClima(0)).toBe('Ensolarado');
    expect(rotuloDoClima(3)).toBe('Nublado');
    expect(rotuloDoClima(63)).toBe('Chuva');
    expect(rotuloDoClima(95)).toBe('Tempestade');
  });
});

describe('praticavelPeloCodigo', () => {
  it('céu limpo, garoa e chuva fraca não param a obra', () => {
    expect(praticavelPeloCodigo(0)).toBe(true);
    expect(praticavelPeloCodigo(51)).toBe(true);
    expect(praticavelPeloCodigo(61)).toBe(true);
  });
  it('chuva moderada, aguaceiro e tempestade param', () => {
    expect(praticavelPeloCodigo(63)).toBe(false);
    expect(praticavelPeloCodigo(81)).toBe(false);
    expect(praticavelPeloCodigo(95)).toBe(false);
  });
});
