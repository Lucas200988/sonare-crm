import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { notificar } from '@/server/services/notify';
import { conquistasDoPeriodo, visaoGeralDaEmpresa } from '@/server/services/agente-contexto';
import { panoramaDaEquipe, panoramaPessoal } from '@/server/services/agente-panorama';
import { perfilDoBriefing, type PerfilDoBriefing } from '@/lib/perfil-briefing';
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
  pessoal?: Awaited<ReturnType<typeof panoramaPessoal>> | null,
): string {
  const linhas: string[] = [];
  linhas.push(periodo === 'manha' ? 'Resumo do dia:' : 'Resumo do fechamento:');
  if (pessoal) {
    for (const n of pessoal.conquistasPessoais.negociosGanhos) linhas.push(`- Seu negócio ganho: ${n.codigo} ${n.titulo}${n.valorEstimado ? ` (${n.valorEstimado})` : ''}.`);
    if (pessoal.tarefas.vencidas.length > 0) linhas.push(`- Suas tarefas vencidas: ${pessoal.tarefas.vencidas.map((t) => `${t.titulo}${t.projeto ? ` (${t.projeto})` : ''}`).join('; ')}.`);
    if (pessoal.tarefas.vencemEm3Dias.length > 0) linhas.push(`- Vencem em até 3 dias: ${pessoal.tarefas.vencemEm3Dias.map((t) => t.titulo).join('; ')}.`);
    const prazos = pessoal.projetosSobMinhaResponsabilidade.filter((p) => p.situacaoDoPrazo !== 'no prazo' && p.situacaoDoPrazo !== 'sem prazo');
    for (const p of prazos.slice(0, 3)) linhas.push(`- Seu projeto ${p.codigo}: prazo ${p.situacaoDoPrazo.toLowerCase()}.`);
  }
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

/**
 * Aberturas e fechamentos dos últimos briefings da empresa — o modelo não
 * enxerga o que escreveu ontem e, sem isto, repete a mesma ironia dia após
 * dia (e para cada destinatário).
 */
export async function frasesRecentesDosBriefings(companyId: string, take = 6): Promise<string[]> {
  const recentes = await prisma.notification.findMany({
    where: { companyId, kind: { startsWith: 'jarvis_briefing' }, body: { not: null } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { body: true },
  });
  const frases = new Set<string>();
  for (const n of recentes) {
    const linhas = (n.body ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('-') && !l.endsWith(':'));
    for (const l of [linhas[0], linhas.at(-1)]) if (l && l.length > 25) frases.add(l.slice(0, 160));
  }
  return [...frases].slice(0, 8);
}

/**
 * O que muda entre o briefing de quem dirige e o de quem opera. Os dados
 * (RBAC) já vêm recortados; aqui é o ÂNGULO: gestão olha empresa e equipe
 * nominalmente; operação recebe o próprio dia, em segunda pessoa.
 */
function anguloDoPerfil(perfil: PerfilDoBriefing): string {
  if (perfil === 'gestao') {
    return `Perfil do destinatário: SÓCIO/GESTOR. Ângulo de gestão:
- Problemas grandes primeiro: caixa, prazo contratual, ART, capacidade da equipe, propostas a vencer. Tarefa miúda não entra.
- EQUIPE, nominalmente, a partir de "equipe" (fatos: acesso, registros, tarefas vencidas, horas, vendas): reconheça quem entregou (venda com código e valor, tarefas concluídas, horas) e aponte o que precisa de cobrança — quem não registrou acesso no período, quem acumula tarefas vencidas. Sempre como fato ("Rodrigo não registrou acesso ao sistema ontem"), nunca como julgamento ("não trabalhou"); antes de cobrar, considere a disponibilidade conhecida (férias, campo). Pule quem está em dia sem nada a destacar.
- Sugira a delegação concreta: "peça ao X que…", "vale uma conversa com Y sobre…". O gestor lê para decidir, não para executar.
- Itens sobre a própria pessoa (souEu) só se forem relevantes; o gestor não precisa da própria lista de tarefas.`;
  }
  return `Perfil do destinatário: OPERAÇÃO. Ângulo pessoal, em segunda pessoa ("você"):
- Comece pelo que é dele em "pessoal": tarefas vencidas e as que vencem, projetos sob sua responsabilidade com prazo vencido ou próximo, horas e registros no período.
- Conquista dele (negócio ganho, tarefas concluídas): reconheça com o fato e já emende o próximo passo ("boa a venda X — agora precisa de Y: contrato, ART, abertura do projeto").
- Sem acesso ou sem registro no período: diga direto e sem rodeio ("você não registrou acesso ao sistema ontem"), como fato, sem julgar; se houver disponibilidade conhecida, respeite-a.
- Dos problemas da empresa, cite só o que toca os projetos dele. NÃO liste financeiro, carteira nem equipe.
- Feche com a prioridade DELE para o dia, uma frase.`;
}

function promptDoBriefing(periodo: PeriodoBriefing, nomeDestinatario: string, hoje: string, jaUsadas: string[] = [], perfil: PerfilDoBriefing = 'gestao'): string {
  const proximo = diaPorExtenso(proximoDiaUtil(hoje));
  const foco = periodo === 'manha'
    ? 'Abra com "Bom dia". Foque no que precisa de atenção HOJE: prazos, tarefas vencidas, compromissos do dia e o principal risco. Feche com a prioridade sugerida do dia.'
    : `É o fechamento do dia (17h30). Resuma o que se moveu hoje, o que segue pendente e o que fica para o próximo dia útil (${proximo}) — chame-o pelo nome do dia, não de "amanhã" se não for o dia seguinte. Sem abrir com saudação de manhã.`;
  return `Você é o SONARE AI Manager (Jarvis), gerente operacional da SONARE Engenharia. Redija o briefing ${periodo === 'manha' ? 'da manhã' : 'de fechamento'} para ${nomeDestinatario}, em português do Brasil.

${contextoDeCalendario(hoje)}

${foco}

${anguloDoPerfil(perfil)}

${TOM_DE_GESTOR}
Ajuste ao briefing: com o próprio destinatário, sobre a situação DELE, a ironia leve é permitida (é conversa direta). Sobre terceiros nomeados, continua proibida.

Estrutura:
1. Conquistas do período (se houver, em conquistas): comece por elas — uma frase por conquista, com código, valor e o impacto concreto para a operação. Sem conquista, a seção NÃO existe (nada de "Conquistas: nenhuma").
2. Leitura cruzada: relacione comercial, operação e financeiro quando os dados sustentarem (ex.: projeto novo aberto enquanto a equipe já tem tarefas vencidas = atenção à capacidade; pagamento recebido de projeto que estava atrasado).
3. Pontos de atenção, do mais grave ao menor.

Regras:
- "Sem movimentação" só se aplica a projetos listados em projetosSemMovimentacaoHa3Dias; cite o tipo da última movimentação quando útil.
- Use SOMENTE os dados do JSON fornecido; nunca invente. Sem dado relevante, diga que o dia está sem pendências críticas.
- Ausência de registro não significa ausência de trabalho.
- Cite códigos (PRJ-…, PROP-…) quando existirem.
- Formato (obrigatório — o e-mail renderiza assim): abertura de UMA frase; depois seções curtas com título terminado em dois-pontos ("Conquistas:", "Atenção:", "Prioridade do dia:"), cada item numa linha própria começando com "- ". Máximo 6 itens no total; cada item com código e uma consequência. Sem asteriscos, sem numeração "1.", sem parágrafo longo. Até ~180 palavras.
- O toque de humor, se houver, vai na abertura ou no fechamento — nunca dentro de um item de risco.${jaUsadas.length > 0 ? `\n- Frases já usadas em briefings recentes — NÃO repita nem parafraseie: ${jaUsadas.map((f) => `"${f}"`).join('; ')}.` : ''}`;
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
  const [config, compromissos, jaUsadas] = await Promise.all([
    getAiConfig(companyId), memoriasDoPeriodo(companyId, periodo, hoje),
    frasesRecentesDosBriefings(companyId).catch(() => [] as string[]),
  ]);

  // manhã olha o dia útil anterior (segunda vê a sexta); fechamento, o dia
  const desde = inicioDoDia(periodo === 'manha' ? diaUtilAnterior(hoje) : hoje);

  let enviados = 0;
  for (const destinatario of destinatarios) {
    const sessao = await sessaoRealDoUsuario(destinatario.id);
    if (!sessao) continue;

    // os dados respeitam o que ESTE destinatário pode ver; o ângulo, o perfil dele
    const perfil = perfilDoBriefing(sessao.roles);
    const [dados, conquistas, pessoal, equipe] = await Promise.all([
      visaoGeralDaEmpresa(sessao),
      conquistasDoPeriodo(sessao, desde),
      panoramaPessoal(sessao, desde).catch(() => null),
      perfil === 'gestao' ? panoramaDaEquipe(sessao, desde).catch(() => null) : null,
    ]);

    let texto = briefingDeterministico(periodo, dados, compromissos, conquistas, pessoal);
    if (config.enabled && config.apiKey && config.provider === 'openai') {
      try {
        const redigido = await completarTexto(config, {
          temperature: 0.6, // a redação pode variar; os dados vêm fixos no JSON
          messages: [
            { role: 'system', content: promptDoBriefing(periodo, destinatario.name, hoje, jaUsadas, perfil) },
            { role: 'user', content: JSON.stringify({ pessoal, equipe, conquistas, dados, compromissos }).slice(0, 28_000) },
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
