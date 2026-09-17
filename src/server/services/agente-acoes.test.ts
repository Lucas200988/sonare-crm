import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SessionUser } from '@/server/auth/session';

/**
 * Fase 2 do Jarvis: propor NUNCA executa; confirmar executa uma única vez,
 * só pelo dono da proposta, dentro da validade — e sem o modelo no caminho.
 */

const USUARIO: SessionUser = {
  id: 'u1', companyId: 'c1', name: 'Teste', email: 't@t',
  roles: ['TESTE'], permissions: new Set(['task:write', 'project:read', 'proposal:write']),
};

const criarTarefaMock = vi.fn().mockResolvedValue({ task: { id: 't1' } });
const comentarMock = vi.fn().mockResolvedValue({ comment: { id: 'co1' } });
const enviarToqueMock = vi.fn().mockResolvedValue({ ok: true });

function prismaFalso(acao: Record<string, unknown> | null) {
  return {
    agentAction: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
        ({ id: 'acao-1', ...data })),
      findFirst: vi.fn().mockResolvedValue(acao),
      update: vi.fn().mockResolvedValue({}),
    },
    agentMessage: { create: vi.fn().mockResolvedValue({}) },
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'p1', code: 'PRJ-2026-011', name: 'Terracap' }),
    },
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'u2', name: 'Rodrigo' }) },
  };
}

async function carregar(acaoNoBanco: Record<string, unknown> | null = null) {
  const prisma = prismaFalso(acaoNoBanco);
  vi.doMock('@/server/db', () => ({ prisma }));
  vi.doMock('@/server/audit/audit', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock('@/server/auth/project-scope', () => ({ escopoDeProjetos: () => ({}) }));
  vi.doMock('@/server/services/projects', () => ({
    createTask: criarTarefaMock, addProjectComment: comentarMock,
  }));
  vi.doMock('@/server/services/followup', () => ({
    enviarToque: enviarToqueMock, getFila: vi.fn().mockResolvedValue([]),
  }));
  const mod = await import('./agente-acoes');
  return { mod, prisma };
}

// o primeiro import dinâmico paga o transform do grafo inteiro na suíte cheia
describe('ações do Jarvis com confirmação', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
    criarTarefaMock.mockClear();
    comentarMock.mockClear();
    enviarToqueMock.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('propor cria a proposta e NÃO executa nada', async () => {
    const { mod, prisma } = await carregar();
    const r = await mod.proporCriarTarefa(USUARIO, 'th1', {
      projetoTermo: 'Terracap', titulo: 'Atualizar memorial', responsavelNome: 'Rodrigo',
    });

    expect('ok' in r && r.ok).toBe(true);
    if (!('ok' in r)) return;
    expect(r.resumo).toContain('PRJ-2026-011');
    expect(r.resumo).toContain('Rodrigo');
    expect(prisma.agentAction.create).toHaveBeenCalledTimes(1);
    expect(criarTarefaMock).not.toHaveBeenCalled();
  });

  it('confirmar executa o serviço com os argumentos resolvidos da proposta', async () => {
    const { mod } = await carregar({
      id: 'acao-1', companyId: 'c1', userId: 'u1', threadId: 'th1',
      tool: 'criar_tarefa', status: 'PROPOSTA',
      expiresAt: new Date(Date.now() + 60_000),
      resumo: 'Criar tarefa…',
      args: { projectId: 'p1', projetoCodigo: 'PRJ-2026-011', titulo: 'Atualizar memorial', descricao: null, responsavelId: 'u2', prazo: null },
    });

    const r = await mod.confirmarAcao(USUARIO, 'acao-1');
    expect('ok' in r && r.ok).toBe(true);
    expect(criarTarefaMock).toHaveBeenCalledWith(USUARIO, 'p1', expect.objectContaining({
      title: 'Atualizar memorial', assigneeId: 'u2',
    }));
  });

  it('proposta já tratada ou expirada não executa de novo', async () => {
    const jaExecutada = await carregar({
      id: 'acao-1', companyId: 'c1', userId: 'u1', threadId: 'th1',
      tool: 'criar_tarefa', status: 'EXECUTADA',
      expiresAt: new Date(Date.now() + 60_000), args: {}, resumo: 'x',
    });
    const r1 = await jaExecutada.mod.confirmarAcao(USUARIO, 'acao-1');
    expect('error' in r1 && r1.error).toContain('já foi tratada');

    vi.resetModules();
    const expirada = await carregar({
      id: 'acao-1', companyId: 'c1', userId: 'u1', threadId: 'th1',
      tool: 'criar_tarefa', status: 'PROPOSTA',
      expiresAt: new Date(Date.now() - 1_000), args: {}, resumo: 'x',
    });
    const r2 = await expirada.mod.confirmarAcao(USUARIO, 'acao-1');
    expect('error' in r2 && r2.error).toContain('expirou');
    expect(criarTarefaMock).not.toHaveBeenCalled();
  });

  it('proposta de outro usuário não aparece para confirmar', async () => {
    // findFirst filtra por userId — outro usuário recebe null
    const { mod, prisma } = await carregar(null);
    const r = await mod.confirmarAcao(USUARIO, 'acao-de-outro');
    expect('error' in r && r.error).toContain('não encontrada');
    expect(prisma.agentAction.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'u1', companyId: 'c1' }),
    }));
    expect(criarTarefaMock).not.toHaveBeenCalled();
  });

  it('cancelar marca a proposta e não executa', async () => {
    const { mod, prisma } = await carregar({
      id: 'acao-1', companyId: 'c1', userId: 'u1', threadId: 'th1',
      tool: 'enviar_follow_up', status: 'PROPOSTA',
      expiresAt: new Date(Date.now() + 60_000), args: {}, resumo: 'x',
    });
    const r = await mod.cancelarAcao(USUARIO, 'acao-1');
    expect('ok' in r && r.ok).toBe(true);
    expect(prisma.agentAction.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'CANCELADA' },
    }));
    expect(enviarToqueMock).not.toHaveBeenCalled();
  });

  it('follow-up fora da fila é recusado na proposta', async () => {
    const { mod } = await carregar();
    const r = await mod.proporFollowUp(USUARIO, 'th1', { proposta: 'PROP-2026-999' });
    expect('error' in r && r.error).toContain('fila');
  });

  it('memória: registra declaração com fonte e validade', async () => {
    const criada: Record<string, unknown>[] = [];
    const { mod, prisma } = await carregar();
    (prisma as unknown as { agentMemory: unknown }).agentMemory = {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        criada.push(data);
        return { id: 'm1', ...data };
      }),
    };

    const r = await mod.registrarMemoria(USUARIO, 'th1', {
      tipo: 'USER_AVAILABILITY', sobreTipo: 'user', sobreNome: 'Rodrigo',
      conteudo: 'De férias.', validaAte: '2026-09-25',
    });
    expect('ok' in r && r.ok).toBe(true);
    expect(criada[0]).toMatchObject({
      type: 'USER_AVAILABILITY', subjectType: 'user', subjectId: 'u2',
      source: 'USER_DECLARATION', createdById: 'u1',
    });
    expect(criada[0].validUntil).toBeInstanceOf(Date);
  });

  it('memória: instrução de gestão exige user:manage e tipo inválido é recusado', async () => {
    const { mod } = await carregar();
    const semGestao = await mod.registrarMemoria(USUARIO, 'th1', {
      tipo: 'MANAGEMENT_INSTRUCTION', sobreTipo: 'project', sobreNome: 'Terracap',
      conteudo: 'Não cobrar até segunda.',
    });
    expect('error' in semGestao && semGestao.error).toContain('gestão');

    const tipoErrado = await mod.registrarMemoria(USUARIO, 'th1', {
      tipo: 'HACK', sobreTipo: 'user', sobreNome: 'Rodrigo', conteudo: 'x'.repeat(10),
    });
    expect('error' in tipoErrado && tipoErrado.error).toContain('inválido');
  });
});
