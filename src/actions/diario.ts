'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as diario from '@/server/services/diario';

export type ActionState = { error?: string; info?: string };

/**
 * Número opcional vindo de formulário.
 *
 * Campo vazio chega como string vazia, não como null — e coordenada
 * digitada à brasileira vem com vírgula ("-15,5989").
 */
const numeroOuNulo = z.preprocess(
  (v) => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '') return null;
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) ? n : t; // deixa o schema apontar o inválido
    }
    return v;
  },
  z.number({ message: 'Informe um número válido (ex.: -15.5989).' }).finite().nullable(),
);

const aberturaSchema = z.object({
  lat: numeroOuNulo,
  lng: numeroOuNulo,
  accuracy: numeroOuNulo,
});

export async function abrirDiarioAction(
  projectId: string,
  loc: { lat: number | null; lng: number | null; accuracy: number | null },
): Promise<ActionState & { diaryId?: string }> {
  const user = await requirePermission('diary:write');
  const parsed = aberturaSchema.safeParse(loc);
  if (!parsed.success) return { error: 'Localização inválida.' };

  const result = await diario.abrirDiario(user, projectId, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/obra');
  revalidatePath(`/obra/${projectId}`);
  return {
    diaryId: result.diaryId,
    info: result.jaExistia ? 'Diário de hoje reaberto.' : 'Diário iniciado.',
  };
}

const KINDS = [
  'ATIVIDADE', 'OCORRENCIA', 'IMPEDIMENTO', 'ORIENTACAO',
  'VISITANTE', 'MATERIAL', 'OBSERVACAO',
] as const;

const registroSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(2, 'Descreva o registro.').max(300),
  description: z.string().trim().max(4000).optional(),
  responsible: z.string().trim().max(120).optional(),
  // específicos por tipo — validados soltos porque variam
  quantidade: z.string().trim().max(30).optional(),
  unidade: z.string().trim().max(20).optional(),
  gravidade: z.enum(['BAIXA', 'MEDIA', 'ALTA']).optional(),
  local: z.string().trim().max(200).optional(),
  empresa: z.string().trim().max(120).optional(),
});

export async function registrarNoDiarioAction(
  diaryId: string, projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const parsed = registroSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;

  // o que não é campo comum vai para o payload do tipo
  const payload: Record<string, unknown> = {};
  if (d.quantidade) payload.quantidade = d.quantidade;
  if (d.unidade) payload.unidade = d.unidade;
  if (d.gravidade) payload.gravidade = d.gravidade;
  if (d.local) payload.local = d.local;
  if (d.empresa) payload.empresa = d.empresa;

  const result = await diario.registrarNoDiario(user, diaryId, {
    kind: d.kind,
    title: d.title,
    description: d.description || null,
    responsible: d.responsible || null,
    payload: Object.keys(payload).length ? payload : null,
  });
  if ('error' in result) return { error: result.error };

  revalidatePath(`/obra/${projectId}`);
  return { info: 'Registrado.' };
}

export async function removerRegistroAction(
  diaryId: string, projectId: string, entryId: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const result = await diario.removerRegistro(user, diaryId, entryId);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/obra/${projectId}`);
  return { info: 'Registro removido.' };
}

const equipeSchema = z.object({
  role: z.string().trim().min(2, 'Informe a função.').max(80),
  company: z.string().trim().max(120).optional(),
  quantity: z.coerce.number().int().min(1, 'Quantidade mínima: 1.').max(999),
});

export async function adicionarEquipeAction(
  diaryId: string, projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const parsed = equipeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await diario.adicionarEquipe(user, diaryId, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/obra/${projectId}`);
  return { info: 'Equipe registrada.' };
}

const equipamentoSchema = z.object({
  name: z.string().trim().min(2, 'Informe o equipamento.').max(120),
  identification: z.string().trim().max(80).optional(),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
});

export async function adicionarEquipamentoAction(
  diaryId: string, projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const parsed = equipamentoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await diario.adicionarEquipamento(user, diaryId, parsed.data);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/obra/${projectId}`);
  return { info: 'Equipamento registrado.' };
}

export async function removerEquipeAction(
  diaryId: string, projectId: string, id: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const result = await diario.removerEquipe(user, diaryId, id);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/obra/${projectId}`);
  return {};
}

export async function removerEquipamentoAction(
  diaryId: string, projectId: string, id: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const result = await diario.removerEquipamento(user, diaryId, id);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/obra/${projectId}`);
  return {};
}

export async function repetirDiaAnteriorAction(
  diaryId: string, projectId: string,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const result = await diario.repetirDiaAnterior(user, diaryId);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/obra/${projectId}`);
  return { info: `${result.copiados} item(ns) copiado(s) do dia anterior.` };
}

const fechamentoSchema = z.object({
  narrativa: z.string().trim().max(20_000).optional(),
  // avisos que a pessoa viu e decidiu ignorar — ficam gravados no diário
  avisos: z.string().optional(),
});

export async function finalizarDiarioAction(
  diaryId: string, projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('diary:write');
  const parsed = fechamentoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: 'Dados inválidos.' };

  let avisos: string[] = [];
  try {
    avisos = parsed.data.avisos ? JSON.parse(parsed.data.avisos) : [];
  } catch { avisos = []; }

  const result = await diario.finalizarDiario(user, diaryId, {
    narrativa: parsed.data.narrativa,
    avisosIgnorados: avisos,
  });
  if ('error' in result) return { error: result.error };

  revalidatePath('/obra');
  revalidatePath(`/obra/${projectId}`);
  return { info: 'Diário finalizado.' };
}

// ---------- Configuração da obra no projeto ----------

const obraSchema = z.object({
  enabled: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
  siteAddress: z.string().trim().max(300).optional(),
  siteLat: numeroOuNulo,
  siteLng: numeroOuNulo,
  siteRadiusM: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : null),
    z.number().int().min(50).max(50_000).nullable(),
  ),
});

export async function configurarObraAction(
  projectId: string, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('project:write');
  const parsed = obraSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;

  const { prisma } = await import('@/server/db');
  const { escopoDeProjetos } = await import('@/server/auth/project-scope');
  const projeto = await prisma.project.findFirst({
    where: {
      id: projectId, companyId: user.companyId, deletedAt: null,
      ...escopoDeProjetos(user),
    },
    select: { id: true, code: true, diaryEnabled: true },
  });
  if (!projeto) return { error: 'Projeto não encontrado.' };

  await prisma.project.update({
    where: { id: projectId },
    data: {
      diaryEnabled: d.enabled,
      siteAddress: d.siteAddress || null,
      siteLat: d.siteLat,
      siteLng: d.siteLng,
      siteRadiusM: d.siteRadiusM,
      updatedById: user.id,
    },
  });

  const { auditLog } = await import('@/server/audit/audit');
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'update',
    entityType: 'project_diary_config', entityId: projectId,
    before: { diario: projeto.diaryEnabled },
    after: { diario: d.enabled, geofence: d.siteLat !== null },
  });

  revalidatePath(`/projetos/${projectId}`);
  revalidatePath('/obra');
  return { info: d.enabled ? 'Diário de obras habilitado.' : 'Diário de obras desabilitado.' };
}
