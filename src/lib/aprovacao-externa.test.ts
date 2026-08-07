import { describe, expect, it } from 'vitest';
import {
  FLUXO_CONCESSIONARIA, diasAte, passoAtual, prazoDoPasso,
  processoConcluido, situacaoPasso, type PassoEmAndamento,
} from './aprovacao-externa';

const dia = (d: number) => new Date(`2026-08-${String(d).padStart(2, '0')}T09:00:00`);

/** Passo protocolado, sem resposta, com o prazo padrão de 30 dias. */
function protocolado(overrides: Partial<PassoEmAndamento> = {}): PassoEmAndamento {
  return {
    status: 'AGUARDANDO_CONCESSIONARIA',
    prazoDias: 30,
    protocoladoEm: dia(1),
    respondidoEm: null,
    cobradoEm: null,
    ...overrides,
  };
}

describe('FLUXO_CONCESSIONARIA', () => {
  it('começa pelo orçamento de conexão e termina no parecer', () => {
    expect(FLUXO_CONCESSIONARIA[0].codigo).toBe('SOLICITAR_ORCAMENTO');
    expect(FLUXO_CONCESSIONARIA.at(-1)?.codigo).toBe('PARECER_ACESSO');
  });

  it('só os passos que dependem da concessionária têm prazo', () => {
    // decisão nossa não tem prazo dela para correr
    const comPrazo = FLUXO_CONCESSIONARIA.filter((p) => p.prazoDias !== null);
    expect(comPrazo.map((p) => p.codigo)).toEqual(['SOLICITAR_ORCAMENTO', 'PROTOCOLAR_PROJETO']);
    expect(comPrazo.every((p) => p.prazoDias === 30)).toBe(true);
  });

  it('quem tem prazo guarda protocolo — é dele que o prazo conta', () => {
    for (const p of FLUXO_CONCESSIONARIA) {
      if (p.prazoDias !== null) expect(p.temProtocolo, p.codigo).toBe(true);
    }
  });
});

describe('prazoDoPasso e diasAte', () => {
  it('conta trinta dias corridos a partir do protocolo', () => {
    expect(prazoDoPasso(dia(1), 30).toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('ignora a hora do dia ao contar', () => {
    // protocolo às 9h e consulta às 23h no mesmo dia não muda a contagem
    const limite = new Date('2026-08-31T09:00:00');
    expect(diasAte(limite, new Date('2026-08-30T23:30:00'))).toBe(1);
  });
});

describe('situacaoPasso', () => {
  it('passo não iniciado não cobra nada', () => {
    const s = situacaoPasso({ ...protocolado(), status: 'PENDENTE' }, dia(10));
    expect(s.nivel).toBe('pendente');
    expect(s.acao).toBeNull();
  });

  it('dentro do prazo, informa quantos dias faltam', () => {
    const s = situacaoPasso(protocolado(), dia(20));
    expect(s.nivel).toBe('aguardando');
    expect(s.diasRestantes).toBe(11);
    expect(s.acao).toBe('aguardar');
  });

  it('no último dia ainda não é atraso', () => {
    const s = situacaoPasso(protocolado(), new Date('2026-08-31T18:00:00'));
    expect(s.nivel).toBe('aguardando');
    expect(s.diasRestantes).toBe(0);
    expect(s.resumo).toBe('Prazo vence hoje');
  });

  it('vencido há poucos dias sugere cobrar, não a ouvidoria', () => {
    /*
     * Subir direto para a ouvidoria queima uma relação que vai durar muitos
     * projetos — a escalada tem degraus.
     */
    const s = situacaoPasso(protocolado(), new Date('2026-09-03T09:00:00'));
    expect(s.nivel).toBe('atrasado');
    expect(s.diasRestantes).toBe(-3);
    expect(s.acao).toBe('cobrar');
    expect(s.resumo).toContain('3 dia(s)');
  });

  it('atraso longo sobe para a ouvidoria mesmo sem cobrança registrada', () => {
    const s = situacaoPasso(protocolado(), new Date('2026-09-15T09:00:00'));
    expect(s.acao).toBe('ouvidoria');
  });

  it('depois de cobrar, a próxima sugestão já é a ouvidoria', () => {
    const s = situacaoPasso(
      protocolado({ cobradoEm: new Date('2026-09-02T09:00:00') }),
      new Date('2026-09-03T09:00:00'),
    );
    expect(s.acao).toBe('ouvidoria');
  });

  it('passo sem prazo apenas acompanha', () => {
    const s = situacaoPasso(protocolado({ prazoDias: null }), dia(20));
    expect(s.nivel).toBe('aguardando');
    expect(s.diasRestantes).toBeNull();
    expect(s.acao).toBe('aguardar');
  });

  it('sem protocolo não há prazo correndo', () => {
    const s = situacaoPasso(protocolado({ protocoladoEm: null }), dia(20));
    expect(s.nivel).toBe('pendente');
  });

  it('concluído e dispensado saem do radar', () => {
    expect(situacaoPasso(protocolado({ status: 'CONCLUIDO' }), dia(99)).acao).toBeNull();
    expect(situacaoPasso(protocolado({ status: 'DISPENSADO' }), dia(99)).nivel).toBe('dispensado');
  });
});

describe('passoAtual', () => {
  const passos = [
    { status: 'CONCLUIDO' as const, sortOrder: 0 },
    { status: 'DISPENSADO' as const, sortOrder: 1 },
    { status: 'AGUARDANDO_CONCESSIONARIA' as const, sortOrder: 2 },
    { status: 'PENDENTE' as const, sortOrder: 3 },
  ];

  it('é o primeiro que ainda não terminou', () => {
    expect(passoAtual(passos)?.sortOrder).toBe(2);
  });

  it('respeita a ordem, não a posição na lista', () => {
    expect(passoAtual([...passos].reverse())?.sortOrder).toBe(2);
  });

  it('devolve nulo quando tudo terminou', () => {
    expect(passoAtual([{ status: 'CONCLUIDO', sortOrder: 0 }])).toBeNull();
  });
});

describe('processoConcluido', () => {
  it('dispensado conta como resolvido', () => {
    expect(processoConcluido([
      { status: 'CONCLUIDO' }, { status: 'DISPENSADO' },
    ])).toBe(true);
  });

  it('um passo aberto segura o processo', () => {
    expect(processoConcluido([
      { status: 'CONCLUIDO' }, { status: 'PENDENTE' },
    ])).toBe(false);
  });

  it('processo sem passos não está concluído', () => {
    expect(processoConcluido([])).toBe(false);
  });
});
