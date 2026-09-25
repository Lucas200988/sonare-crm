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
  vi.doMock('@/server/services/agente-panorama', () => ({ panoramaPessoal: vi.fn(), panoramaDaEquipe: vi.fn() }));
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

describe('frases já usadas nos briefings', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('extrai abertura e fechamento dos briefings recentes, ignorando itens, títulos e frases curtas', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { body: 'Bom dia, Lucas. A carteira acordou no mesmo humor que vocês.\n\nAtenção:\n- PRJ-2026-008 sem ART.\n\nA ART do PRJ-2026-008 já pode ser considerada figura lendária.' },
      { body: 'Bom dia.\nAtenção:\n- item\nPrioridade do dia:\n- ART.' },
      { body: null },
    ]);
    vi.doMock('@/server/db', () => ({ prisma: { notification: { findMany } } }));
    vi.doMock('@/server/audit/audit', () => ({ auditLog: vi.fn() }));
    vi.doMock('@/server/services/notify', () => ({ notificar: vi.fn() }));
    vi.doMock('@/server/services/agente-contexto', () => ({ visaoGeralDaEmpresa: vi.fn() }));
    vi.doMock('@/server/services/agente-panorama', () => ({ panoramaPessoal: vi.fn(), panoramaDaEquipe: vi.fn() }));
  vi.doMock('@/server/services/agente-panorama', () => ({ panoramaPessoal: vi.fn(), panoramaDaEquipe: vi.fn() }));
    vi.doMock('@/server/ai/client', () => ({ completarTexto: vi.fn(), getAiConfig: vi.fn() }));
    const { frasesRecentesDosBriefings } = await import('./agente-proativo');

    const frases = await frasesRecentesDosBriefings('c1');
    expect(frases).toEqual([
      'Bom dia, Lucas. A carteira acordou no mesmo humor que vocês.',
      'A ART do PRJ-2026-008 já pode ser considerada figura lendária.',
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'c1' }) }));
  });
});

describe('briefing determinístico com panorama pessoal', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('traz a conquista, as tarefas e os prazos DE QUEM LÊ', async () => {
    const { briefingDeterministico } = await carregar();
    const pessoal = {
      observacao: '', acesso: { ultimoEm: null, acessouNoPeriodo: false }, registrosNoPeriodo: 0, horasLancadasNoPeriodo: '0',
      tarefas: {
        abertas: 3, concluidasNoPeriodo: 1,
        vencidas: [{ titulo: 'Emitir ART', projeto: 'PRJ-2026-008', venceuEm: new Date() }],
        vencemEm3Dias: [{ titulo: 'Entregar memorial', projeto: null, venceEm: new Date() }],
      },
      projetosSobMinhaResponsabilidade: [
        { codigo: 'PRJ-2026-015', nome: 'SPDA', status: 'EM_DESENVOLVIMENTO', papel: 'responsável técnico', prazoContratual: new Date(), situacaoDoPrazo: 'VENCIDO' },
        { codigo: 'PRJ-2026-016', nome: 'X', status: 'EM_DESENVOLVIMENTO', papel: 'equipe', prazoContratual: null, situacaoDoPrazo: 'sem prazo' },
      ],
      conquistasPessoais: { negociosGanhos: [{ codigo: 'OPP-2026-009', titulo: 'SESI', cliente: 'SESI', valorEstimado: 'R$ 12.000,00' }] },
    } as never;
    const texto = briefingDeterministico('manha', DADOS, [], undefined, pessoal);
    expect(texto).toContain('Seu negócio ganho: OPP-2026-009 SESI (R$ 12.000,00)');
    expect(texto).toContain('Suas tarefas vencidas: Emitir ART (PRJ-2026-008)');
    expect(texto).toContain('Vencem em até 3 dias: Entregar memorial');
    expect(texto).toContain('Seu projeto PRJ-2026-015: prazo vencido');
    expect(texto).not.toContain('PRJ-2026-016');
  });
});
