import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { notificar } from '@/server/services/notify';
import { visaoGeralDaEmpresa } from '@/server/services/agente-contexto';
import { completarTexto, getAiConfig } from '@/server/ai/client';
import type { SessionUser } from '@/server/auth/session';

/**
 * Jarvis proativo — Fase 3: Morning Manager e Closing Manager.
 *
 * Duas decisões de arquitetura importantes:
 *
 * 1. IDENTIDADE: quem "fala" é o usuário-sistema SONARE AI Manager
 *    (jarvis@…, inativo para login). Toda emissão fica no AuditLog em nome
 *    dele — ação autônoma nunca é mascarada como ação de uma pessoa.
 *
 * 2. RECORTE: os DADOS de cada briefing são coletados com o SessionUser do
 *    DESTINATÁRIO, não com o do agente. Quem não vê financeiro não recebe
 *    financeiro no briefing — o RBAC vale até para mensagem proativa.
 */

export const EMAIL_DO_AGENTE = 'jarvis@sonareengenharia.com.br';

export type PeriodoBriefing = 'manha' | 'fechamento';

/** O usuário-sistema do agente, para auditoria e remetência. */
export async function agenteDoSistema(companyId: string): Promise<SessionUser | null> {
  const u = await prisma.user.findFirst({
    where: { companyId, email: EMAIL_DO_AGENTE, deletedAt: null },
    select: { id: true, companyId: true, name: true, email: true },
  });
  if (!u) return null;
  return { ...u, roles: ['AGENTE_IA'], permissions: new Set() };
}

/** SessionUser real de um destinatário (papéis + permissões extras). */
async function sessaoDoDestinatario(userId: string): Promise<SessionUser | null> {
  const u = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, active: true },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      extraPermissions: { include: { permission: true } },
    },
  });
  if (!u) return null;
  const permissions = new Set<string>();
  for (const r of u.roles) for (const p of r.role.permissions) permissions.add(p.permission.code);
  for (const p of u.extraPermissions) permissions.add(p.permission.code);
  return { id: u.id, companyId: u.companyId, name: u.name, email: u.email, roles: u.roles.map((r) => r.role.code), permissions };
}

/** Compromissos e disponibilidades valendo hoje — a memória cobra junto. */
async function memoriasDeHoje(companyId: string) {
  const agora = new Date();
  const memorias = await prisma.agentMemory.findMany({
    where: {
      companyId, deletedAt: null,
      type: { in: ['COMMITMENT', 'USER_AVAILABILITY', 'MANAGEMENT_INSTRUCTION'] },
      OR: [{ validFrom: null }, { validFrom: { lte: agora } }],
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: agora } }] }],
    },
    select: { type: true, content: true, subjectType: true, subjectId: true, validUntil: true },
    take: 20,
  });
  if (memorias.length === 0) return [];

  const idsDeUsuario = memorias
    .filter((m) => m.subjectType === 'user' && m.subjectId)
    .map((m) => m.subjectId as string);
  const nomes = idsDeUsuario.length > 0
    ? await prisma.user.findMany({ where: { id: { in: idsDeUsuario } }, select: { id: true, name: true } })
    : [];
  return memorias.map((m) => ({
    tipo: m.type,
    sobre: m.subjectType === 'user'
      ? nomes.find((n) => n.id === m.subjectId)?.name ?? 'usuário'
      : m.subjectType,
    informacao: m.content,
    valeAte: m.validUntil,
  }));
}

const TITULOS: Record<PeriodoBriefing, string> = {
  manha: 'Bom dia — briefing do Jarvis',
  fechamento: 'Fechamento operacional — Jarvis',
};

/**
 * Texto sem IA — o briefing NUNCA deixa de sair porque o provedor falhou.
 * Feio e útil vence bonito e ausente.
 */
export function briefingDeterministico(
  periodo: PeriodoBriefing,
  dados: Awaited<ReturnType<typeof visaoGeralDaEmpresa>>,
  compromissos: Array<{ tipo: string; sobre: string; informacao: string }>,
): string {
  const linhas: string[] = [];
  linhas.push(periodo === 'manha' ? 'Resumo do dia:' : 'Resumo do fechamento:');
  linhas.push(`- ${dados.projetosAtivos} projeto(s) ativo(s); ${dados.projetosAtrasados.length} atrasado(s); ${dados.projetosSemMovimentacaoHa3Dias.length} sem movimentação há 3+ dias.`);
  linhas.push(`- ${dados.tarefasVencidas.total} tarefa(s) vencida(s).`);
  for (const a of dados.alertasDoPainel.slice(0, 5)) linhas.push(`- ${a.titulo} (${a.detalhe})`);
  for (const c of compromissos.slice(0, 5)) linhas.push(`- ${c.tipo === 'COMMITMENT' ? 'Compromisso' : 'Aviso'}: ${c.sobre} — ${c.informacao}`);
  linhas.push('Abra o dashboard para os detalhes.');
  return linhas.join('\n');
}

function promptDoBriefing(periodo: PeriodoBriefing, nomeDestinatario: string): string {
  const foco = periodo === 'manha'
    ? 'Abra com "Bom dia". Foque no que precisa de atenção HOJE: prazos, tarefas vencidas, compromissos do dia e o principal risco. Feche com a prioridade sugerida do dia.'
    : 'É o fechamento do dia (17h30). Resuma o que se moveu hoje, o que segue pendente e o que fica para amanhã. Sem abrir com saudação de manhã.';
  return `Você é o SONARE AI Manager (Jarvis), gerente operacional da SONARE Engenharia. Redija o briefing ${periodo === 'manha' ? 'da manhã' : 'de fechamento'} para ${nomeDestinatario}, em português do Brasil.

${foco}

Regras:
- Use SOMENTE os dados do JSON fornecido; nunca invente. Sem dado relevante, diga que o dia está sem pendências críticas.
- Ausência de registro não significa ausência de trabalho.
- Cite códigos (PRJ-…, PROP-…) quando existirem.
- Texto puro, sem markdown, no máximo ~150 palavras, tom gerencial e direto.`;
}

/** Gera e envia os briefings de uma empresa para os usuários que optaram. */
export async function enviarBriefings(companyId: string, periodo: PeriodoBriefing) {
  const agente = await agenteDoSistema(companyId);
  if (!agente) return { pulou: 'usuário-sistema do agente não existe' };

  const destinatarios = await prisma.user.findMany({
    where: { companyId, deletedAt: null, active: true, jarvisBriefing: true },
    select: { id: true, name: true },
  });
  if (destinatarios.length === 0) return { pulou: 'ninguém optou por receber' };

  const [config, compromissos] = await Promise.all([
    getAiConfig(companyId), memoriasDeHoje(companyId),
  ]);

  let enviados = 0;
  for (const destinatario of destinatarios) {
    const sessao = await sessaoDoDestinatario(destinatario.id);
    if (!sessao) continue;

    // os dados respeitam o que ESTE destinatário pode ver
    const dados = await visaoGeralDaEmpresa(sessao);

    let texto = briefingDeterministico(periodo, dados, compromissos);
    if (config.enabled && config.apiKey && config.provider === 'openai') {
      try {
        const redigido = await completarTexto(config, {
          temperature: 0.3,
          messages: [
            { role: 'system', content: promptDoBriefing(periodo, destinatario.name) },
            { role: 'user', content: JSON.stringify({ dados, compromissos }).slice(0, 24_000) },
          ],
        }, 40_000, { companyId, userId: destinatario.id, useCase: 'manager-briefing' });
        if (redigido.trim()) texto = redigido.trim();
      } catch {
        // fica o determinístico — o briefing sai de qualquer jeito
      }
    }

    await notificar(agente, {
      paraUserId: destinatario.id,
      kind: periodo === 'manha' ? 'jarvis_briefing_manha' : 'jarvis_briefing_fechamento',
      titulo: TITULOS[periodo],
      corpo: texto,
      link: '/dashboard',
    });
    enviados += 1;
  }

  await auditLog({
    companyId, userId: agente.id, action: 'agent_briefing',
    entityType: 'agent', entityId: agente.id,
    after: { periodo, destinatarios: enviados, origem: 'SONARE AI Manager — ciclo autônomo' },
  });

  return { enviados };
}
