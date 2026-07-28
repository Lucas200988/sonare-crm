'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { parseDecimalBR } from '@/lib/parse';

export type ActionState = { error?: string; info?: string };

const numero = (campo: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(parseDecimalBR(v)) : undefined),
    z.number({ message: `${campo} inválido.` }).min(0, `${campo} não pode ser negativo.`),
  );

const schema = z.object({
  maxDiscountPercent: numero('Desconto máximo'),
  minMarginPercent: numero('Margem mínima'),
  maxValueWithoutApproval: numero('Valor limite'),
  defaultValidityDays: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : undefined),
    z.number().int().positive('Validade deve ser maior que zero.'),
  ),
  infoGerais: z.string().trim(),
  diferenciais: z.string().trim(),
});

/**
 * Regras comerciais e textos padrão dos documentos.
 * Ficam no banco justamente para poderem mudar sem alteração de código.
 */
export async function saveCommercialSettingsAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;

  if (d.maxDiscountPercent > 100) return { error: 'O desconto máximo não pode passar de 100%.' };
  if (d.minMarginPercent > 100) return { error: 'A margem mínima não pode passar de 100%.' };

  const valores: Array<[string, unknown]> = [
    ['approval.maxDiscountPercent', d.maxDiscountPercent],
    ['approval.minMarginPercent', d.minMarginPercent],
    ['approval.maxValueWithoutApproval', d.maxValueWithoutApproval],
    ['proposal.defaultValidityDays', d.defaultValidityDays],
    ['proposal.infoGerais', d.infoGerais],
    ['proposal.diferenciais', d.diferenciais],
  ];

  for (const [key, value] of valores) {
    await prisma.systemSetting.upsert({
      where: { companyId_key: { companyId: user.companyId, key } },
      create: { companyId: user.companyId, key, value: value as never, updatedById: user.id },
      update: { value: value as never, updatedById: user.id },
    });
  }

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'commercial_settings',
    after: Object.fromEntries(valores.map(([k, v]) => [k, typeof v === 'string' ? `${String(v).length} chars` : v])),
  });

  revalidatePath('/configuracoes');
  return { info: 'Regras e textos salvos. Valem para os próximos documentos.' };
}

// ---------- Modelos de contrato ----------

const clauseSchema = z.object({
  title: z.string().trim().min(3, 'Cláusula sem título.'),
  paragraphs: z.array(z.string()),
  items: z.array(z.string()).optional(),
});

const templateSchema = z.object({
  templateId: z.string().min(1),
  preamble: z.string().trim(),
  clauses: z.array(clauseSchema).min(1, 'O modelo precisa de ao menos uma cláusula.'),
});

/** Edita as cláusulas de um modelo de contrato sem tocar no código. */
export async function saveContractTemplateAction(input: unknown): Promise<ActionState> {
  const user = await requirePermission('settings:manage');
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const template = await prisma.contractTemplate.findFirst({
    where: { id: parsed.data.templateId, companyId: user.companyId },
  });
  if (!template) return { error: 'Modelo não encontrado.' };

  const clauses = parsed.data.clauses.map((c) => ({
    title: c.title,
    paragraphs: c.paragraphs.map((p) => p.trim()).filter(Boolean),
    items: (c.items ?? []).map((i) => i.trim()).filter(Boolean),
  }));

  await prisma.contractTemplate.update({
    where: { id: template.id },
    data: { preamble: parsed.data.preamble || null, clauses: clauses as never },
  });

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'contract_template', entityId: template.id,
    after: { name: template.name, clauses: clauses.length },
  });

  revalidatePath('/configuracoes');
  return { info: `Modelo "${template.name}" salvo.` };
}
