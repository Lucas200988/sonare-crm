import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { notificar } from '@/server/services/notify';
import { conquistasDoPeriodo, visaoGeralDaEmpresa } from '@/server/services/agente-contexto';
import { completarTexto, getAiConfig } from '@/server/ai/client';
import { TOM_DE_GESTOR } from '@/server/ai/manager-prompt';
import {
  contextoDeCalendario, diaPorExtenso, diaUtilAnterior, hojeEmCuiaba,
  inicioDoDia, proximoDiaUtil,
} from '@/lib/dias-uteis';
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

/** SessionUser real de um usuário (papéis + permissões extras) — usado
 * pelos ciclos autônomos e pelo adapter de WhatsApp. */
export async function sessaoRealDoUsuario(userId: string): Promise<SessionUser | null> {
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

/**
 * Compromissos e disponibilidades que importam para ESTE briefing.
 *
 * Manhã: o que vale hoje. Fechamento: o que vale no PRÓXIMO dia útil — a
 * memória que termina hoje já é passado às 17h30. Sem esse corte, o
 * fechamento de sexta anunciou como "amanhã" um campo que era da própria
 * sexta.
 */
async function memoriasDoPeriodo(companyId: string, periodo: PeriodoBriefing, hoje: string) {
  const alvo = periodo === 'manha' ? hoje : proximoDiaUtil(hoje);
  const inicio = new Date(`${alvo}T00:00:00-04:00`);
  const fim = new Date(`${alvo}T23:59:59.999-04:00`);

  const memorias = await prisma.agentMemory.findMany({
    where: {
      companyId, deletedAt: null,
      type: { in: ['COMMITMENT', 'USER_AVAILABILITY', 'MANAGEMENT_INSTRUCTION'] },
      // vale em algum momento do dia-alvo
      OR: [{ validFrom: null }, { validFrom: { lte: fim } }],
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: inicio } }] }],
    },
    select: { type: true, content: true, subjectType: true, subjectId: true, validFrom: true, validUntil: true },
    take: 20,
  });
  if (memorias.length === 0) return [];

  const idsDeUsuario = memorias
    .filter((m) => m.subjectType === 'user' && m.subjectId)
    .map((m) => m.subjectId as string);
  const nomes = idsDeUsuario.length > 0
    ? await prisma.user.findMany({ where: { id: { in: idsDeUsuario } }, select: { id: true, name: true } })
    : [];
  // datas por extenso: o modelo compara com "hoje" em vez de adivinhar
  const dia = (d: Date | null) => (d ? diaPorExtenso(hojeEmCuiaba(d)) : null);
  return memorias.map((m) => ({
    tipo: m.type,
    sobre: m.subjectType === 'user'
      ? nomes.find((n) => n.id === m.subjectId)?.name ?? 'usuário'
      : m.subjectType,
    informacao: m.content,
    valeDe: dia(m.validFrom),
    valeAte: dia(m.validUntil),
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
  conquistas?: Awaited<ReturnType<typeof conquistasDoPeriodo>>,
): string {
  const linhas: string[] = [];
  linhas.push(periodo === 'manha' ? 'Resumo do dia:' : 'Resumo do fechamento:');
  if (conquistas) {
    for (const n of conquistas.negociosGanhos) linhas.push(`- Negócio ganho: ${n.codigo} ${n.titulo}${n.valorEstimado ? ` (${n.valorEstimado})` : ''}.`);
    for (const c of conquistas.contratosAssinados) linhas.push(`- Contrato assinado: ${c.codigo} ${c.objeto} (${c.valor}).`);
    for (const p of conquistas.projetosAbertos) linhas.push(`- Projeto aberto: ${p.codigo} ${p.nome}.`);
    for (const r of conquistas.pagamentosRecebidos) linhas.push(`- Pagamento recebido: ${r.valor}${r.projeto ? ` — ${r.projeto}` : ''}.`);
  }
  linhas.push(`- ${dados.projetosAtivos} projeto(s) ativo(s); ${dados.projetosAtrasados.length} atrasado(s); ${dados.projetosSemMovimentacaoHa3Dias.length} sem movimentação há 3+ dias.`);
  linhas.push(`- ${dados.tarefasVencidas.total} tarefa(s) vencida(s).`);
  for (const a of dados.alertasDoPainel.slice(0, 5)) linhas.push(`- ${a.titulo} (${a.detalhe})`);
  for (const c of compromissos.slice(0, 5)) linhas.push(`- ${c.tipo === 'COMMITMENT' ? 'Compromisso' : 'Aviso'}: ${c.sobre} — ${c.informacao}`);
  linhas.push('Abra o dashboard para os detalhes.');
  return linhas.join('\n');
}

function promptDoBriefing(periodo: PeriodoBriefing, nomeDestinatario: string, hoje: string): string {
  const proximo = diaPorExtenso(proximoDiaUtil(hoje));
  const foco = periodo === 'manha'
    ? 'Abra com "Bom dia". Foque no que precisa de atenção HOJE: prazos, tarefas vencidas, compromissos do dia e o principal risco. Feche com a prioridade sugerida do dia.'
    : `É o fechamento do dia (17h30). Resuma o que se moveu hoje, o que segue pendente e o que fica para o próximo dia útil (${proximo}) — chame-o pelo nome do dia, não de "amanhã" se não for o dia seguinte. Sem abrir com saudação de manhã.`;
  return `Você é o SONARE AI Manager (Jarvis), gerente operacional da SONARE Engenharia. Redija o briefing ${periodo === 'manha' ? 'da manhã' : 'de fechamento'} para ${nomeDestinatario}, em português do Brasil.

${contextoDeCalendario(hoje)}

${foco}

${TOM_DE_GESTOR}

Estrutura:
1. Conquistas do período (se houver, em conquistas): comece por elas — uma frase por conquista, com código, valor e o impacto concreto para a operação.
2. Leitura cruzada: relacione comercial, operação e financeiro quando os dados sustentarem (ex.: projeto novo aberto enquanto a equipe já tem tarefas vencidas = atenção à capacidade; pagamento recebido de projeto que estava atrasado).
3. Pontos de atenção, do mais grave ao menor.

Regras:
- "Sem movimentação" só se aplica a projetos listados em projetosSemMovimentacaoHa3Dias; cite o tipo da última movimentação quando útil.
- Use SOMENTE os dados do JSON fornecido; nunca invente. Sem dado relevante, diga que o dia está sem pendências críticas.
- Ausência de registro não significa ausência de trabalho.
- Cite códigos (PRJ-…, PROP-…) quando existirem.
- Texto puro, sem markdown, no máximo ~180 palavras.`;
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

  const hoje = hojeEmCuiaba();
  const [config, compromissos] = await Promise.all([
    getAiConfig(companyId), memoriasDoPeriodo(companyId, periodo, hoje),
  ]);

  // manhã olha o dia útil anterior (segunda vê a sexta); fechamento, o dia
  const desde = inicioDoDia(periodo === 'manha' ? diaUtilAnterior(hoje) : hoje);

  let enviados = 0;
  for (const destinatario of destinatarios) {
    const sessao = await sessaoRealDoUsuario(destinatario.id);
    if (!sessao) continue;

    // os dados respeitam o que ESTE destinatário pode ver
    const [dados, conquistas] = await Promise.all([
      visaoGeralDaEmpresa(sessao),
      conquistasDoPeriodo(sessao, desde),
    ]);

    let texto = briefingDeterministico(periodo, dados, compromissos, conquistas);
    if (config.enabled && config.apiKey && config.provider === 'openai') {
      try {
        const redigido = await completarTexto(config, {
          temperature: 0.3,
          messages: [
            { role: 'system', content: promptDoBriefing(periodo, destinatario.name, hoje) },
            { role: 'user', content: JSON.stringify({ conquistas, dados, compromissos }).slice(0, 24_000) },
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
