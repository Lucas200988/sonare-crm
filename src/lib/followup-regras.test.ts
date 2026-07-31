import { describe, expect, it } from 'vitest';
import {
  avaliarProposta, diasUteisEntre, emHorarioComercial,
  CONFIG_PADRAO, type ConfigFollowUp, type PropostaParaAvaliar,
} from './followup-regras';

const CFG: ConfigFollowUp = { ...CONFIG_PADRAO, ativo: true };

/** Quarta-feira, 10h — dia e horário úteis, para os casos não dependerem disso. */
const QUARTA = new Date(2026, 6, 29, 10, 0);

function proposta(over: Partial<PropostaParaAvaliar> = {}): PropostaParaAvaliar {
  return {
    proposalId: 'p1',
    status: 'ENVIADA',
    sentAt: new Date(2026, 6, 27), // segunda
    viewedAt: null,
    validUntil: new Date(2026, 8, 30),
    ultimoToqueEm: null,
    toquesJaDados: [],
    contatosClienteNaSemana: 0,
    ...over,
  };
}

describe('diasUteisEntre', () => {
  it('não conta fim de semana', () => {
    // sexta 24/07/2026 -> segunda 27/07/2026 = 1 dia útil
    expect(diasUteisEntre(new Date(2026, 6, 24), new Date(2026, 6, 27))).toBe(1);
  });

  it('conta a semana cheia', () => {
    expect(diasUteisEntre(new Date(2026, 6, 27), new Date(2026, 6, 31))).toBe(4);
  });

  it('é zero no mesmo dia', () => {
    expect(diasUteisEntre(QUARTA, QUARTA)).toBe(0);
  });
});

describe('emHorarioComercial', () => {
  it('aceita dia útil entre 8h e 18h', () => {
    expect(emHorarioComercial(new Date(2026, 6, 29, 9, 0))).toBe(true);
  });

  it('recusa madrugada, fim de tarde e fim de semana', () => {
    expect(emHorarioComercial(new Date(2026, 6, 29, 3, 0))).toBe(false);
    expect(emHorarioComercial(new Date(2026, 6, 29, 19, 0))).toBe(false);
    expect(emHorarioComercial(new Date(2026, 7, 1, 10, 0))).toBe(false); // sábado
  });
});

describe('avaliarProposta — travas', () => {
  it('não faz nada com a automação desligada', () => {
    const d = avaliarProposta(proposta(), { ...CFG, ativo: false }, QUARTA);
    expect(d).toEqual({ agir: false, motivo: 'automação desligada' });
  });

  it('para de cobrar assim que o cliente decide', () => {
    for (const status of ['ACEITA', 'RECUSADA']) {
      const d = avaliarProposta(proposta({ status }), CFG, QUARTA);
      expect(d.agir, status).toBe(false);
    }
  });

  it('ignora proposta que nunca foi enviada', () => {
    const d = avaliarProposta(proposta({ sentAt: null }), CFG, QUARTA);
    expect(d).toMatchObject({ agir: false, motivo: 'proposta ainda não enviada' });
  });

  it('respeita o teto de contatos com o cliente na semana', () => {
    const d = avaliarProposta(proposta({ contatosClienteNaSemana: 2 }), CFG, QUARTA);
    expect(d).toMatchObject({ agir: false, motivo: 'teto de contatos com este cliente na semana' });
  });

  it('respeita o silêncio mínimo entre toques da mesma proposta', () => {
    const ontem = new Date(2026, 6, 28);
    const d = avaliarProposta(proposta({ ultimoToqueEm: ontem }), CFG, QUARTA);
    expect(d).toMatchObject({ agir: false, motivo: 'toque recente demais sobre esta proposta' });
  });

  it('não repete o mesmo tipo de toque', () => {
    const d = avaliarProposta(proposta({ toquesJaDados: ['SEM_RETORNO'] }), CFG, QUARTA);
    expect(d.agir).toBe(false);
  });
});

describe('avaliarProposta — gatilhos', () => {
  it('cobra retorno depois de 2 dias úteis sem sinal', () => {
    // enviada segunda 27, avaliando quarta 29 = 2 dias úteis
    const d = avaliarProposta(proposta(), CFG, QUARTA);
    expect(d).toMatchObject({ agir: true, tipo: 'SEM_RETORNO', diasDesde: 2 });
  });

  it('não cobra antes do prazo', () => {
    const terca = new Date(2026, 6, 28, 10, 0);
    expect(avaliarProposta(proposta(), CFG, terca).agir).toBe(false);
  });

  it('não conta o fim de semana no prazo', () => {
    // enviada na sexta 24; na segunda 27 passou só 1 dia útil
    const segunda = new Date(2026, 6, 27, 10, 0);
    const d = avaliarProposta(proposta({ sentAt: new Date(2026, 6, 24) }), CFG, segunda);
    expect(d.agir).toBe(false);
  });

  it('dá o segundo toque quando o cliente abriu e não decidiu', () => {
    const d = avaliarProposta(
      proposta({ status: 'VISUALIZADA', viewedAt: new Date(2026, 6, 24), toquesJaDados: ['SEM_RETORNO'] }),
      CFG, QUARTA,
    );
    expect(d).toMatchObject({ agir: true, tipo: 'VISUALIZADA_SEM_DECISAO' });
  });

  it('avisa quando a validade está próxima', () => {
    const d = avaliarProposta(proposta({ validUntil: new Date(2026, 7, 2) }), CFG, QUARTA);
    expect(d).toMatchObject({ agir: true, tipo: 'VALIDADE_PROXIMA' });
  });

  it('a validade tem prioridade sobre o follow-up genérico', () => {
    // as duas condições valem; a que tem prazo real vem primeiro
    const d = avaliarProposta(proposta({ validUntil: new Date(2026, 7, 2) }), CFG, QUARTA);
    expect(d).toMatchObject({ tipo: 'VALIDADE_PROXIMA' });
  });

  it('sinaliza a proposta já vencida', () => {
    const d = avaliarProposta(proposta({ validUntil: new Date(2026, 6, 20) }), CFG, QUARTA);
    expect(d).toMatchObject({ agir: true, tipo: 'EXPIRADA' });
  });
});

describe('configuração padrão', () => {
  it('nasce desligada, para ninguém ser surpreendido por e-mail ao cliente', () => {
    expect(CONFIG_PADRAO.ativo).toBe(false);
  });

  it('nasce em "preparar": nada sai sem aprovação humana', () => {
    expect(CONFIG_PADRAO.nivel).toBe('preparar');
  });

  it('primeiro toque em 2 dias úteis, como combinado', () => {
    expect(CONFIG_PADRAO.diasSemRetorno).toBe(2);
  });
});
