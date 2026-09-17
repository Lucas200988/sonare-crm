import 'server-only';
import { z } from 'zod';
import {
  atividadeDoUsuario, contextoDoProjeto, rdosPendentes,
  tarefasVencidas, visaoGeralDaEmpresa,
} from '@/server/services/agente-contexto';
import { getPrazosVencidos } from '@/server/services/aprovacoes';
import type { PermissionCode } from '@/config/permissions';
import type { SessionUser } from '@/server/auth/session';
import type { DefinicaoDeFerramenta, ExecutorDeFerramentas } from './client';

/**
 * As ferramentas do SONARE AI Manager — Fase 1, todas de LEITURA.
 *
 * Cada ferramenta é um adaptador fino sobre um serviço existente: a regra de
 * negócio mora no serviço, o RBAC mora no `SessionUser`, e o modelo só
 * escolhe O QUE consultar. Allowlist explícita: nome fora deste catálogo não
 * executa nada; argumento fora do schema é recusado antes de tocar o banco.
 */

type Ferramenta = {
  nome: string;
  descricao: string;
  /** Permissão exigida para a ferramenta sequer ser oferecida ao modelo. */
  permissao: PermissionCode | null;
  schema: z.ZodType<Record<string, unknown>>;
  parametros: Record<string, unknown>; // JSON Schema para o provedor
  executar(user: SessionUser, args: Record<string, unknown>): Promise<unknown>;
};

const semArgumentos = {
  schema: z.object({}).strict() as z.ZodType<Record<string, unknown>>,
  parametros: { type: 'object', properties: {}, additionalProperties: false },
};

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: 'visao_geral_da_empresa',
    descricao:
      'Fotografia operacional do dia: projetos ativos, atrasados e parados, tarefas vencidas, '
      + 'alertas, resumo do pipeline comercial, fila de follow-up e RDOs aguardando assinatura. '
      + 'Comece por aqui para perguntas amplas como "como está a empresa hoje?".',
    permissao: null,
    ...semArgumentos,
    executar: (user) => visaoGeralDaEmpresa(user),
  },
  {
    nome: 'contexto_do_projeto',
    descricao:
      'Dossiê completo de UM projeto: status, equipe, prazos, etapas, tarefas (com as vencidas), '
      + 'ART, diário de obras, horas, movimentação recente e financeiro (se autorizado). '
      + 'Aceita código (PRJ-2026-011), parte do nome ou nome do cliente.',
    permissao: 'project:read',
    schema: z.object({ termo: z.string().min(2).max(120) }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Código do projeto, parte do nome ou nome do cliente' },
      },
      required: ['termo'],
      additionalProperties: false,
    },
    executar: (user, args) => contextoDoProjeto(user, String(args.termo)),
  },
  {
    nome: 'atividade_do_usuario',
    descricao:
      'Registros de uma pessoa no CRM em um dia (auditoria, tarefas concluídas, horas, RDOs, fotos) '
      + 'e a disponibilidade conhecida (férias, campo). Mede REGISTRO, não trabalho. '
      + 'Sem data, considera hoje.',
    permissao: null, // a regra fina (só a própria atividade, ou audit:read) mora no serviço
    schema: z.object({
      nome: z.string().min(2).max(120),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).strict() as z.ZodType<Record<string, unknown>>,
    parametros: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome ou e-mail da pessoa' },
        data: { type: 'string', description: 'Dia no formato YYYY-MM-DD (opcional; padrão hoje)' },
      },
      required: ['nome'],
      additionalProperties: false,
    },
    executar: (user, args) =>
      atividadeDoUsuario(user, String(args.nome), args.data ? String(args.data) : undefined),
  },
  {
    nome: 'tarefas_vencidas',
    descricao: 'Todas as tarefas vencidas visíveis, com projeto, responsável e dias de atraso.',
    permissao: 'task:read',
    ...semArgumentos,
    executar: (user) => tarefasVencidas(user),
  },
  {
    nome: 'rdos_pendentes',
    descricao:
      'Diários de obra (RDO) em preenchimento ou aguardando assinaturas, por obra.',
    permissao: 'diary:read',
    ...semArgumentos,
    executar: (user) => rdosPendentes(user),
  },
  {
    nome: 'prazos_concessionaria',
    descricao:
      'Processos de aprovação na concessionária (Energisa) com prazo estourado e a ação sugerida '
      + '(cobrar ou ouvidoria).',
    permissao: 'project:read',
    ...semArgumentos,
    executar: async (user) => {
      const vencidos = await getPrazosVencidos(user);
      return vencidos.length === 0
        ? { situacao: 'Nenhum prazo de concessionária estourado no momento.' }
        : vencidos;
    },
  },
];

/** Resultado sempre em JSON string — o formato que volta para o modelo. */
function serializar(valor: unknown): string {
  return JSON.stringify(valor, (_k, v) => (v instanceof Date ? v.toISOString() : v));
}

/**
 * O executor entregue ao AI Core, já recortado pelo RBAC do usuário: o
 * modelo nem fica sabendo das ferramentas que a pessoa não pode usar.
 */
export function ferramentasDoUsuario(user: SessionUser): ExecutorDeFerramentas {
  const permitidas = FERRAMENTAS.filter(
    (f) => f.permissao === null || user.permissions.has(f.permissao),
  );

  const definicoes: DefinicaoDeFerramenta[] = permitidas.map((f) => ({
    type: 'function',
    function: { name: f.nome, description: f.descricao, parameters: f.parametros },
  }));

  return {
    definicoes,
    async executar(nome, argumentosJson) {
      const ferramenta = permitidas.find((f) => f.nome === nome);
      if (!ferramenta) {
        return serializar({ error: `Ferramenta "${nome}" não existe ou não está disponível para este usuário.` });
      }

      let args: Record<string, unknown>;
      try {
        args = argumentosJson.trim() ? JSON.parse(argumentosJson) : {};
      } catch {
        return serializar({ error: 'Argumentos inválidos: não são JSON.' });
      }
      const parsed = ferramenta.schema.safeParse(args);
      if (!parsed.success) {
        return serializar({ error: `Argumentos rejeitados: ${parsed.error.issues[0]?.message ?? 'formato inválido'}.` });
      }

      try {
        return serializar(await ferramenta.executar(user, parsed.data));
      } catch (e) {
        // a falha vira dado para o modelo contornar — nunca stack trace
        console.error(`[jarvis] ferramenta ${nome} falhou:`, e instanceof Error ? e.message : e);
        return serializar({ error: `A consulta "${nome}" falhou. Responda com o que já tiver e avise o usuário.` });
      }
    },
  };
}
