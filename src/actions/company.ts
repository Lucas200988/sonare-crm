'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { isValidCNPJ, onlyDigits } from '@/lib/br';

export type CompanyActionState = { error?: string; info?: string };

const optional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);

const companySchema = z.object({
  legalName: z.string().trim().min(2, 'Informe a razão social.'),
  tradeName: optional,
  cnpj: optional,
  stateRegistration: optional,
  cityRegistration: optional,
  crea: optional,
  email: optional,
  phone: optional,
  whatsapp: optional,
  website: optional,
  addressStreet: optional,
  addressNumber: optional,
  addressComplement: optional,
  addressDistrict: optional,
  zipCode: optional,
  city: optional,
  state: optional,
  // Assinatura padrão das propostas
  signerName: optional,
  signerTitle: optional,
  signerRegistration: optional,
  signerPhone: optional,
  signerEmail: optional,
});

/**
 * Dados do proponente usados em propostas e contratos.
 * A assinatura padrão fica em SystemSetting para poder ser sobrescrita por
 * documento no futuro sem alterar o cadastro da empresa.
 */
export async function saveCompanyAction(
  _prev: CompanyActionState, formData: FormData,
): Promise<CompanyActionState> {
  const user = await requirePermission('settings:manage');
  const parsed = companySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const { signerName, signerTitle, signerRegistration, signerPhone, signerEmail, ...company } = parsed.data;

  if (company.cnpj && !isValidCNPJ(company.cnpj)) return { error: 'CNPJ inválido.' };

  const before = await prisma.company.findUnique({ where: { id: user.companyId } });
  const updated = await prisma.company.update({
    where: { id: user.companyId },
    data: {
      ...company,
      cnpj: company.cnpj ? onlyDigits(company.cnpj) : null,
      zipCode: company.zipCode ? onlyDigits(company.zipCode) : null,
    },
  });

  const upsertSetting = (key: string, value: string | null) =>
    prisma.systemSetting.upsert({
      where: { companyId_key: { companyId: user.companyId, key } },
      create: { companyId: user.companyId, key, value: value as never, updatedById: user.id },
      update: { value: value as never, updatedById: user.id },
    });
  await upsertSetting('proposal.signerName', signerName ?? null);
  await upsertSetting('proposal.signerTitle', signerTitle ?? null);
  await upsertSetting('proposal.signerRegistration', signerRegistration ?? null);
  await upsertSetting('proposal.signerPhone', signerPhone ?? null);
  await upsertSetting('proposal.signerEmail', signerEmail ?? null);

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'company', entityId: user.companyId,
    before, after: updated,
  });

  revalidatePath('/configuracoes');
  return { info: 'Dados do proponente salvos.' };
}
