import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SessionUser } from '@/server/auth/session';

/**
 * A allowlist de ferramentas do Jarvis: nome fora do catálogo não executa,
 * argumento fora do schema não chega ao serviço, e ferramenta sem permissão
 * nem é oferecida ao modelo. Serviços mockados — aqui o assunto é o portão.
 */

function usuario(permissoes: string[]): SessionUser {
  return {
    id: 'u1', companyId: 'c1', name: 'Teste', email: 't@t',
    roles: ['TESTE'], permissions: new Set(permissoes),
  };
}

async function carregar() {
  vi.doMock('@/server/services/agente-contexto', () => ({
    visaoGeralDaEmpresa: vi.fn().mockResolvedValue({ projetosAtivos: 7 }),
    contextoDoProjeto: vi.fn().mockResolvedValue({ projeto: { codigo: 'PRJ-1' } }),
    atividadeDoUsuario: vi.fn().mockResolvedValue({ totalDeRegistros: 3 }),
    tarefasVencidas: vi.fn().mockResolvedValue({ total: 0 }),
    rdosPendentes: vi.fn().mockResolvedValue({ diarios: [] }),
  }));
  vi.doMock('@/server/services/aprovacoes', () => ({
    getPrazosVencidos: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock('@/server/services/agente-acoes', () => ({
    proporCriarTarefa: vi.fn().mockResolvedValue({ ok: true, acaoId: 'a1', resumo: 'x' }),
    proporObservacao: vi.fn().mockResolvedValue({ ok: true, acaoId: 'a1', resumo: 'x' }),
    proporFollowUp: vi.fn().mockResolvedValue({ ok: true, acaoId: 'a1', resumo: 'x' }),
  }));
  return import('./manager-tools');
}

describe('ferramentas do Jarvis', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('nomes são únicos e schemas fecham propriedades extras', async () => {
    const { FERRAMENTAS } = await carregar();
    const nomes = FERRAMENTAS.map((f) => f.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const f of FERRAMENTAS) {
      expect(f.parametros).toMatchObject({ additionalProperties: false });
    }
  });

  it('usuário sem a permissão não recebe a ferramenta na definição', async () => {
    const { ferramentasDoUsuario } = await carregar();
    const soDiario = ferramentasDoUsuario(usuario(['diary:read']));
    const nomes = soDiario.definicoes.map((d) => d.function.name);
    expect(nomes).toContain('rdos_pendentes');
    expect(nomes).not.toContain('contexto_do_projeto'); // exige project:read
    expect(nomes).not.toContain('tarefas_vencidas');    // exige task:read
  });

  it('ferramenta fora do catálogo devolve erro em texto, nunca executa', async () => {
    const { ferramentasDoUsuario } = await carregar();
    const executor = ferramentasDoUsuario(usuario(['project:read']));
    const r = JSON.parse(await executor.executar('apagar_tudo', '{}'));
    expect(r.error).toContain('não existe');
  });

  it('ferramenta sem permissão não executa mesmo se o modelo insistir', async () => {
    const { ferramentasDoUsuario } = await carregar();
    const contexto = await import('@/server/services/agente-contexto');
    const executor = ferramentasDoUsuario(usuario(['diary:read']));

    const r = JSON.parse(await executor.executar('contexto_do_projeto', '{"termo":"Terracap"}'));
    expect(r.error).toBeTruthy();
    expect(contexto.contextoDoProjeto).not.toHaveBeenCalled();
  });

  it('argumento fora do schema é recusado antes do serviço', async () => {
    const { ferramentasDoUsuario } = await carregar();
    const contexto = await import('@/server/services/agente-contexto');
    const executor = ferramentasDoUsuario(usuario(['project:read']));

    const semTermo = JSON.parse(await executor.executar('contexto_do_projeto', '{}'));
    expect(semTermo.error).toContain('rejeitados');
    const extra = JSON.parse(await executor.executar('contexto_do_projeto', '{"termo":"x2","sql":"drop"}'));
    expect(extra.error).toContain('rejeitados');
    const naoJson = JSON.parse(await executor.executar('contexto_do_projeto', 'termo=x'));
    expect(naoJson.error).toContain('JSON');
    expect(contexto.contextoDoProjeto).not.toHaveBeenCalled();
  });

  it('argumento válido chega ao serviço com o usuário da sessão', async () => {
    const { ferramentasDoUsuario } = await carregar();
    const contexto = await import('@/server/services/agente-contexto');
    const quem = usuario(['project:read']);
    const executor = ferramentasDoUsuario(quem);

    const r = JSON.parse(await executor.executar('contexto_do_projeto', '{"termo":"Terracap"}'));
    expect(r.projeto.codigo).toBe('PRJ-1');
    expect(contexto.contextoDoProjeto).toHaveBeenCalledWith(quem, 'Terracap');
  });

  it('falha do serviço vira erro amigável para o modelo, sem stack trace', async () => {
    vi.doMock('@/server/services/agente-contexto', () => ({
      visaoGeralDaEmpresa: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:5432')),
      contextoDoProjeto: vi.fn(),
      atividadeDoUsuario: vi.fn(),
      tarefasVencidas: vi.fn(),
      rdosPendentes: vi.fn(),
    }));
    vi.doMock('@/server/services/aprovacoes', () => ({ getPrazosVencidos: vi.fn() }));
    vi.doMock('@/server/services/agente-acoes', () => ({
      proporCriarTarefa: vi.fn(), proporObservacao: vi.fn(), proporFollowUp: vi.fn(),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ferramentasDoUsuario } = await import('./manager-tools');

    const executor = ferramentasDoUsuario(usuario([]));
    const r = JSON.parse(await executor.executar('visao_geral_da_empresa', '{}'));
    expect(r.error).toContain('falhou');
    expect(JSON.stringify(r)).not.toContain('ECONNREFUSED');
  });
});
