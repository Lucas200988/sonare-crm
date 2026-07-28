'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/server/auth/guards';
import * as clients from '@/server/services/clients';

const optional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);

const clientSchema = z.object({
  personType: z.enum(['FISICA', 'JURIDICA']),
  legalName: z.string().trim().min(2, 'Informe o nome / razão social.'),
  tradeName: optional,
  cpf: optional,
  cnpj: optional,
  stateRegistration: optional,
  cityRegistration: optional,
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().email('E-mail inválido').nullable().optional(),
  ),
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
  notes: optional,
  status: z.enum(['ATIVO', 'INATIVO', 'BLOQUEADO']).default('ATIVO'),
  leadSourceId: optional,
  segment: optional,
  commercialOwnerId: optional,
  tags: z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((t) => t.trim()).filter(Boolean) : []),
    z.array(z.string()).default([]),
  ),
});

export type ActionState = { error?: string };

function parseClientForm(formData: FormData) {
  return clientSchema.safeParse(Object.fromEntries(formData.entries()));
}

export async function createClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('client:write');
  const parsed = parseClientForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await clients.createClient(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/clientes');
  redirect(`/clientes/${result.client.id}`);
}

export async function updateClientAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission('client:write');
  const parsed = parseClientForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await clients.updateClient(user, id, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/clientes');
  revalidatePath(`/clientes/${id}`);
  redirect(`/clientes/${id}`);
}

export async function deleteClientAction(id: string): Promise<ActionState> {
  const user = await requirePermission('client:delete');
  const result = await clients.softDeleteClient(user, id);
  if ('error' in result) return { error: result.error };
  revalidatePath('/clientes');
  redirect('/clientes');
}

// ---------- Seleção rápida de cliente (usada no seletor com busca) ----------

export type ClientOptionResult = {
  id: string;
  legalName: string;
  tradeName: string | null;
  document: string | null;
  city: string | null;
  state: string | null;
  units: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; name: string }>;
  opportunities: Array<{ id: string; code: string; title: string }>;
};

/** Busca clientes por nome, documento, e-mail ou telefone. Limitada a 30 resultados. */
export async function searchClientsAction(query: string): Promise<ClientOptionResult[]> {
  const user = await requirePermission('client:read');
  const found = await clients.searchClientOptions(user, query);
  return found;
}

const quickClientSchema = z.object({
  personType: z.enum(['FISICA', 'JURIDICA']),
  legalName: z.string().trim().min(2, 'Informe o nome / razão social.'),
  cpf: optional,
  cnpj: optional,
  email: optional,
  phone: optional,
  city: optional,
  state: optional,
});

/**
 * Cadastro rápido a partir de outra tela (orçamento, oportunidade).
 * Cria o mínimo necessário e devolve o cliente para seleção imediata —
 * os demais dados podem ser completados depois na ficha do cliente.
 */
export async function quickCreateClientAction(
  _prev: ActionState & { created?: ClientOptionResult },
  formData: FormData,
): Promise<ActionState & { created?: ClientOptionResult }> {
  const user = await requirePermission('client:write');
  const parsed = quickClientSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await clients.createClient(user, parsed.data);
  if ('error' in result) return { error: result.error };

  revalidatePath('/clientes');
  const c = result.client;
  return {
    created: {
      id: c.id,
      legalName: c.legalName,
      tradeName: c.tradeName,
      document: c.cnpj ?? c.cpf ?? null,
      city: c.city,
      state: c.state,
      units: [],
      contacts: [],
      opportunities: [],
    },
  };
}

// ---------- Contatos ----------

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do contato.'),
  position: optional,
  email: optional,
  phone: optional,
  whatsapp: optional,
  department: optional,
  notes: optional,
  decisionMaker: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
  isPrimary: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
  isFinancial: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
  isTechnical: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
  isContractual: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
});

export async function saveContactAction(
  clientId: string, contactId: string | null, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('client:write');
  const parsed = contactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await clients.upsertContact(user, clientId, parsed.data, contactId ?? undefined);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/clientes/${clientId}`);
  return {};
}

export async function deleteContactAction(clientId: string, contactId: string): Promise<ActionState> {
  const user = await requirePermission('client:write');
  const result = await clients.deleteContact(user, contactId);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/clientes/${clientId}`);
  return {};
}

// ---------- Unidades ----------

const unitSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da unidade/obra.'),
  unitType: optional,
  consumerUnit: optional,
  addressStreet: optional,
  addressNumber: optional,
  addressDistrict: optional,
  zipCode: optional,
  city: optional,
  state: optional,
  notes: optional,
});

export async function saveUnitAction(
  clientId: string, unitId: string | null, _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission('client:write');
  const parsed = unitSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const result = await clients.upsertUnit(user, clientId, parsed.data, unitId ?? undefined);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/clientes/${clientId}`);
  return {};
}

export async function deleteUnitAction(clientId: string, unitId: string): Promise<ActionState> {
  const user = await requirePermission('client:write');
  const result = await clients.deleteUnit(user, unitId);
  if ('error' in result) return { error: result.error };
  revalidatePath(`/clientes/${clientId}`);
  return {};
}
