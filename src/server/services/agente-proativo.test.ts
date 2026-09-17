import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * O briefing determinístico — o texto que sai quando a IA falha ou está
 * desligada. O ciclo proativo nunca pode morrer por causa do provedor.
 */

const DADOS = {
  data: '2026-09-18',
  projetosAtivos: 9,
  projetos: [],
  projetosAtrasados: [{ codigo: 'PRJ-2026-008', nome: 'Bombeiros UFV', prazoContratual: new Date('2026-08-20') }],
  projetosSemMovimentacaoHa3Dias: [{ codigo: 'PRJ-2026-014', nome: 'Athenas', ultimaMovimentacao: new Date() }],
  tarefasVencidas: { total: 3, itens: [] },
  alertasDoPainel: [
    { gravidade: 'alta', titulo: 'PRJ-2026-008 exige ART e não tem', detalhe: 'sem responsabilidade técnica' },
  ],
  pipelineComercial: null,
  filaDeFollowUp: null,
  rdosFinalizadosAguardandoAssinatura: 0,
} as never;

async function carregar() {
  vi.doMock('@/server/db', () => ({ prisma: {} }));
  vi.doMock('@/server/audit/audit', () => ({ auditLog: vi.fn() }));
  vi.doMock('@/server/services/notify', () => ({ notificar: vi.fn() }));
  vi.doMock('@/server/services/agente-contexto', () => ({ visaoGeralDaEmpresa: vi.fn() }));
  vi.doMock('@/server/ai/client', () => ({ completarTexto: vi.fn(), getAiConfig: vi.fn() }));
  return import('./agente-proativo');
}

describe('briefing determinístico', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('resume projetos, tarefas, alertas e compromissos sem IA', async () => {
    const { briefingDeterministico } = await carregar();
    const texto = briefingDeterministico('manha', DADOS, [
      { tipo: 'COMMITMENT', sobre: 'Pedro', informacao: 'Atualizar o RDO pela manhã.' },
    ]);

    expect(texto).toContain('9 projeto(s) ativo(s)');
    expect(texto).toContain('1 atrasado(s)');
    expect(texto).toContain('3 tarefa(s) vencida(s)');
    expect(texto).toContain('PRJ-2026-008 exige ART');
    expect(texto).toContain('Compromisso: Pedro — Atualizar o RDO pela manhã.');
  });

  it('fechamento muda o cabeçalho', async () => {
    const { briefingDeterministico } = await carregar();
    expect(briefingDeterministico('fechamento', DADOS, [])).toContain('Resumo do fechamento:');
  });
});
