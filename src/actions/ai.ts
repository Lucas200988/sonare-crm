'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { encryptSecret, decryptSecret, maskSecret } from '@/server/crypto';
import { generateScope, reviewText, testAiConnection, type GeneratedScope } from '@/server/ai/scope-generator';
import { auditLog } from '@/server/audit/audit';

export type AiActionState = { error?: string; info?: string };

// ---------- Configuração ----------

const configSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  model: z.string().trim().min(1, 'Informe o modelo.'),
  apiKey: z.string().trim(),
  enabled: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
});

export async function saveAiConfigAction(_prev: AiActionState, formData: FormData): Promise<AiActionState> {
  const user = await requirePermission('settings:manage');
  const parsed = configSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { provider, model, apiKey, enabled } = parsed.data;

  const upsert = (key: string, value: unknown) =>
    prisma.systemSetting.upsert({
      where: { companyId_key: { companyId: user.companyId, key } },
      create: { companyId: user.companyId, key, value: value as never, updatedById: user.id },
      update: { value: value as never, updatedById: user.id },
    });

  await upsert('ai.provider', provider);
  await upsert('ai.model', model);
  await upsert('ai.enabled', enabled);
  // chave vazia = manter a que já existe
  if (apiKey) await upsert('ai.apiKey', encryptSecret(apiKey));

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'update', entityType: 'ai_config',
    after: { provider, model, enabled, apiKeyChanged: Boolean(apiKey) },
  });
  revalidatePath('/configuracoes');
  return { info: 'Configuração de IA salva.' };
}

export async function testAiConnectionAction(): Promise<AiActionState> {
  const user = await requirePermission('settings:manage');
  const result = await testAiConnection(user.companyId);
  if ('error' in result) return { error: result.error };
  return { info: `Conexão bem-sucedida com o modelo ${result.model}.` };
}

export async function removeAiKeyAction(): Promise<AiActionState> {
  const user = await requirePermission('settings:manage');
  await prisma.systemSetting.deleteMany({
    where: { companyId: user.companyId, key: 'ai.apiKey' },
  });
  await prisma.systemSetting.upsert({
    where: { companyId_key: { companyId: user.companyId, key: 'ai.enabled' } },
    create: { companyId: user.companyId, key: 'ai.enabled', value: false, updatedById: user.id },
    update: { value: false, updatedById: user.id },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'delete', entityType: 'ai_config',
  });
  revalidatePath('/configuracoes');
  return { info: 'Chave removida.' };
}

/** Estado da configuração para exibir na tela (nunca devolve a chave completa). */
export async function getAiStatusAction(): Promise<{
  configured: boolean; masked: string | null; provider: string; model: string; enabled: boolean;
}> {
  const user = await requirePermission('settings:manage');
  const settings = await prisma.systemSetting.findMany({
    where: { companyId: user.companyId, key: { in: ['ai.provider', 'ai.model', 'ai.apiKey', 'ai.enabled'] } },
  });
  const get = (k: string) => settings.find((s) => s.key === k)?.value;
  const stored = get('ai.apiKey');
  const plain = typeof stored === 'string' && stored ? decryptSecret(stored) : null;
  return {
    configured: Boolean(plain),
    masked: plain ? maskSecret(plain) : null,
    provider: (get('ai.provider') as string) ?? 'openai',
    model: (get('ai.model') as string) ?? '',
    enabled: get('ai.enabled') === true,
  };
}

// ---------- Geração de escopo ----------

const briefingSchema = z.object({
  serviceType: z.string().trim().min(3, 'Informe o tipo de serviço.'),
  description: z.string().trim().min(10, 'Descreva a demanda com um pouco mais de detalhe.'),
  discipline: z.string().trim().optional(),
  clientType: z.string().trim().optional(),
  area: z.string().trim().optional(),
  extraContext: z.string().trim().optional(),
});

export async function generateScopeAction(
  input: unknown,
): Promise<{ error: string } | { scope: GeneratedScope }> {
  const user = await requirePermission('budget:write');
  const parsed = briefingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await generateScope(user.companyId, parsed.data);
  if ('error' in result) return result;

  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'ai_generate', entityType: 'budget_scope',
    after: { serviceType: parsed.data.serviceType },
  });
  return result;
}

// ---------- Revisão ortográfica e gramatical ----------

const reviewSchema = z.object({
  // Textos longos são divididos em blocos pelo serviço; o teto evita abuso.
  text: z.string().trim().min(3, 'Nada a revisar.').max(60_000, 'Texto muito longo para revisar de uma vez.'),
  context: z.string().trim().optional(),
});

export async function reviewTextAction(
  input: unknown,
): Promise<{ error: string } | { text: string; changed: boolean }> {
  const user = await requirePermission('budget:write');
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await reviewText(user.companyId, parsed.data.text, parsed.data.context);
  if ('error' in result) return result;

  return { text: result.text, changed: result.text.trim() !== parsed.data.text.trim() };
}

// ---------- Salvar escopo como modelo padrão ----------

const saveTemplateSchema = z.object({
  /** id do serviço do catálogo a sobrescrever; vazio = criar novo item */
  serviceId: z.string().optional(),
  name: z.string().trim().min(3, 'Dê um nome ao modelo.'),
  scope: z.string().trim().min(10, 'O escopo está vazio.'),
  premises: z.string().optional(),
  exclusions: z.string().optional(),
});

/**
 * Grava o escopo revisado como modelo padrão no catálogo de serviços,
 * para reutilização nos próximos orçamentos.
 */
export async function saveScopeTemplateAction(
  input: unknown,
): Promise<{ error: string } | { ok: true; serviceId: string; name: string }> {
  const user = await requirePermission('budget:write');
  const parsed = saveTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { serviceId, name, scope, premises, exclusions } = parsed.data;

  const templateData = {
    scopeTemplate: scope,
    premisesTemplate: premises || null,
    exclusionsTemplate: exclusions || null,
  };

  if (serviceId) {
    const existing = await prisma.serviceCatalog.findFirst({
      where: { id: serviceId, companyId: user.companyId, deletedAt: null },
    });
    if (!existing) return { error: 'Serviço não encontrado.' };

    await prisma.serviceCatalog.update({
      where: { id: serviceId },
      data: { ...templateData, name },
    });
    await auditLog({
      companyId: user.companyId, userId: user.id,
      action: 'update', entityType: 'scope_template', entityId: serviceId, after: { name },
    });
    revalidatePath('/configuracoes');
    return { ok: true, serviceId, name };
  }

  // Novo item no catálogo — gera um código sequencial livre
  const count = await prisma.serviceCatalog.count({ where: { companyId: user.companyId } });
  let code = `SRV-${String(count + 1).padStart(3, '0')}`;
  while (await prisma.serviceCatalog.findFirst({ where: { companyId: user.companyId, code } })) {
    code = `SRV-${String(Number(code.slice(4)) + 1).padStart(3, '0')}`;
  }

  const created = await prisma.serviceCatalog.create({
    data: { companyId: user.companyId, code, name, ...templateData },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id,
    action: 'create', entityType: 'scope_template', entityId: created.id, after: { name, code },
  });
  revalidatePath('/configuracoes');
  return { ok: true, serviceId: created.id, name };
}
