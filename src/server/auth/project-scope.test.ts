import { describe, expect, it } from 'vitest';
import { escopoDeProjetos, podeVerProjeto, veTodosOsProjetos } from './project-scope';
import type { SessionUser } from '@/server/auth/session';

function usuario(permissoes: string[], id = 'u-1'): SessionUser {
  return {
    id, companyId: 'c-1', name: 'Teste', email: 't@e.com',
    roles: [], permissions: new Set(permissoes),
  };
}

const semNada = { technicalLeadId: null, coordinatorId: null, createdById: null, members: [] };

describe('veTodosOsProjetos', () => {
  it('só com a permissão explícita', () => {
    expect(veTodosOsProjetos(usuario(['project:read']))).toBe(false);
    expect(veTodosOsProjetos(usuario(['project:read', 'project:read_all']))).toBe(true);
  });

  it('escrever não implica ver tudo', () => {
    // quem edita os próprios projetos não passa a enxergar os dos outros
    expect(veTodosOsProjetos(usuario(['project:read', 'project:write']))).toBe(false);
  });
});

describe('escopoDeProjetos', () => {
  it('não recorta nada para quem vê tudo', () => {
    expect(escopoDeProjetos(usuario(['project:read_all']))).toEqual({});
  });

  it('recorta em AND, para não disputar com o OR da busca por texto', () => {
    const escopo = escopoDeProjetos(usuario(['project:read']));
    expect(escopo.AND).toBeDefined();
    expect(escopo.OR).toBeUndefined();
  });
});

describe('podeVerProjeto', () => {
  const restrito = usuario(['project:read']);

  it('nega o projeto em que a pessoa não está', () => {
    expect(podeVerProjeto(restrito, semNada)).toBe(false);
  });

  it('libera para quem está na equipe', () => {
    expect(podeVerProjeto(restrito, { ...semNada, members: [{ userId: 'u-1' }] })).toBe(true);
  });

  it('libera para o responsável técnico e para a coordenação', () => {
    expect(podeVerProjeto(restrito, { ...semNada, technicalLeadId: 'u-1' })).toBe(true);
    expect(podeVerProjeto(restrito, { ...semNada, coordinatorId: 'u-1' })).toBe(true);
  });

  it('libera para quem criou o cartão', () => {
    // senão a pessoa cria o projeto e o perde de vista antes de montar a equipe
    expect(podeVerProjeto(restrito, { ...semNada, createdById: 'u-1' })).toBe(true);
  });

  it('quem vê tudo entra em qualquer cartão', () => {
    expect(podeVerProjeto(usuario(['project:read_all']), semNada)).toBe(true);
  });

  it('equipe de outra pessoa não libera', () => {
    expect(podeVerProjeto(restrito, { ...semNada, members: [{ userId: 'u-2' }] })).toBe(false);
  });
});
