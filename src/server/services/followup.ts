import 'server-only';
import { prisma } from '@/server/db';
import { auditLog } from '@/server/audit/audit';
import { enviarEmail, remetenteComCaixa } from '@/server/mail';
import { notificar } from '@/server/services/notify';
import { registrarEnvio } from '@/server/services/email-delivery';
import { verificationUrl } from '@/server/signature';
import { codigoProposta } from '@/lib/proposta-codigo';
import { linkWhatsApp } from '@/server/email-proposta';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import {
  avaliarProposta, diasUteisEntre, emHorarioComercial, CONFIG_PADRAO,
  type ConfigFollowUp, type TipoToque,
} from '@/lib/followup-regras';
import type { SessionUser } from '@/server/auth/session';

/**
 * Follow-up comercial: cobrar retorno das propostas enviadas.
 *
 * A fila é calculada na hora, como a de cobrança — nada para manter em dia.
 * A tabela FollowUpEvent guarda só o que já foi feito, e é ela que impede
 * repetir o mesmo toque e alimenta o histórico da proposta.
 *
 * Nada sai para o cliente sem passar pela decisão configurada: no nível
 * "preparar" (o padrão) o texto fica na fila esperando alguém aprovar.
 */

const CHAVE_CONFIG = 'followup.config';

export async function getConfig(companyId: string): Promise<ConfigFollowUp> {
  const s = await prisma.systemSetting.findUnique({
    where: { companyId_key: { companyId, key: CHAVE_CONFIG } },
  });
  if (!s || typeof s.value !== 'object' || s.value === null) return CONFIG_PADRAO;
  // campo novo em versão futura não pode quebrar a configuração já salva
  return { ...CONFIG_PADRAO, ...(s.value as Partial<ConfigFollowUp>) };
}

export async function saveConfig(user: SessionUser, cfg: ConfigFollowUp) {
  await prisma.systemSetting.upsert({
    where: { companyId_key: { companyId: user.companyId, key: CHAVE_CONFIG } },
    create: { companyId: user.companyId, key: CHAVE_CONFIG, value: cfg, updatedById: user.id },
    update: { value: cfg, updatedById: user.id },
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'update',
    entityType: 'followup_config', entityId: null, after: cfg,
  });
  return { ok: true as const };
}

/** Texto de cada tipo de toque, já pronto para revisão na fila. */
export const ROTULO_TOQUE: Record<TipoToque, string> = {
  SEM_RETORNO: 'Sem retorno do cliente',
  VISUALIZADA_SEM_DECISAO: 'Cliente abriu e não respondeu',
  VALIDADE_PROXIMA: 'Validade acabando',
  EXPIRADA: 'Proposta vencida',
};

function mensagemPara(
  tipo: TipoToque, dados: { codigo: string; contato: string | null; validade: string | null; dias: number },
): { assunto: string; corpo: string } {
  const ola = dados.contato ? `Olá, ${dados.contato}.` : 'Prezados,';
  switch (tipo) {
    case 'VALIDADE_PROXIMA':
      return {
        assunto: `Proposta ${dados.codigo} — validade até ${dados.validade}`,
        corpo: `${ola}\n\nNossa proposta ${dados.codigo} é válida até ${dados.validade}. `
          + 'Se precisar de mais prazo para decidir ou de algum ajuste no escopo, é só responder — '
          + 'conseguimos revalidar as condições.',
      };
    case 'EXPIRADA':
      return {
        assunto: `Proposta ${dados.codigo} — podemos revalidar?`,
        corpo: `${ola}\n\nA validade da proposta ${dados.codigo} venceu. `
          + 'Se o serviço ainda for de interesse, respondemos com as condições atualizadas — '
          + 'basta responder a esta mensagem.',
      };
    case 'VISUALIZADA_SEM_DECISAO':
      return {
        assunto: `Proposta ${dados.codigo} — alguma dúvida?`,
        corpo: `${ola}\n\nVimos que a proposta ${dados.codigo} foi acessada. `
          + 'Ficou alguma dúvida sobre escopo, prazo ou condições? '
          + 'Podemos ajustar o que for necessário — é só responder.',
      };
    default:
      return {
        assunto: `Proposta ${dados.codigo} — retorno`,
        corpo: `${ola}\n\nEnviamos a proposta ${dados.codigo} há ${dados.dias} dia(s) úteis `
          + 'e gostaríamos de saber se conseguiu avaliar. '
          + 'Qualquer dúvida sobre escopo, prazo ou valores, é só responder a esta mensagem.',
      };
  }
}

export type ItemFila = {
  proposalId: string;
  codigo: string;
  tipo: TipoToque;
  rotulo: string;
  diasDesde: number;
  cliente: string;
  emailCliente: string | null;
  contato: string | null;
  valor: string;
  validade: string | null;
  assunto: string;
  corpo: string;
  urlWhatsApp: string | null;
};

/**
 * O que precisa de um toque hoje.
 *
 * Puramente consultivo: montar a fila não envia nada nem grava evento.
 */
export async function getFila(user: SessionUser, agora = new Date()): Promise<ItemFila[]> {
  const cfg = await getConfig(user.companyId);

  const propostas = await prisma.proposal.findMany({
    where: {
      companyId: user.companyId,
      deletedAt: null,
      status: { in: ['ENVIADA', 'VISUALIZADA'] },
      sentAt: { not: null },
    },
    include: {
      followUps: { orderBy: { createdAt: 'desc' } },
      budgetVersion: {
        select: {
          validUntil: true,
          total: true,
          budget: {
            select: {
              clientId: true,
              client: { select: { legalName: true, tradeName: true, email: true, phone: true, whatsapp: true } },
              contact: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });

  // contatos por cliente nos últimos 7 dias — a trava anti-insistência
  const seteDiasAtras = new Date(agora);
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const recentes = await prisma.followUpEvent.findMany({
    where: {
      companyId: user.companyId,
      createdAt: { gte: seteDiasAtras },
      channel: { not: 'INTERNO' },
    },
    select: { proposal: { select: { budgetVersion: { select: { budget: { select: { clientId: true } } } } } } },
  });
  const porCliente = new Map<string, number>();
  for (const r of recentes) {
    const id = r.proposal.budgetVersion.budget.clientId;
    porCliente.set(id, (porCliente.get(id) ?? 0) + 1);
  }

  const fila: ItemFila[] = [];
  for (const p of propostas) {
    const bv = p.budgetVersion;
    const cliente = bv.budget.client;

    const decisao = avaliarProposta({
      proposalId: p.id,
      status: p.status,
      sentAt: p.sentAt,
      viewedAt: p.viewedAt,
      validUntil: bv.validUntil,
      ultimoToqueEm: p.followUps[0]?.createdAt ?? null,
      toquesJaDados: p.followUps.map((f) => f.kind as TipoToque),
      contatosClienteNaSemana: porCliente.get(bv.budget.clientId) ?? 0,
    }, cfg, agora);

    if (!decisao.agir) continue;

    const codigo = codigoProposta(p.code, p.revision);
    const contato = bv.budget.contact?.name ?? null;
    const validade = bv.validUntil ? formatDateBR(bv.validUntil) : null;
    const { assunto, corpo } = mensagemPara(decisao.tipo, {
      codigo, contato, validade, dias: decisao.diasDesde,
    });

    fila.push({
      proposalId: p.id,
      codigo,
      tipo: decisao.tipo,
      rotulo: ROTULO_TOQUE[decisao.tipo],
      diasDesde: decisao.diasDesde,
      cliente: cliente.tradeName ?? cliente.legalName,
      emailCliente: bv.budget.contact?.email ?? cliente.email,
      contato,
      valor: formatBRL(bv.total.toString()),
      validade,
      assunto,
      corpo,
      // Conversa já aberta no assunto, para quem prefere resolver por WhatsApp
      urlWhatsApp: cliente.whatsapp || cliente.phone
        ? linkWhatsApp(
            (cliente.whatsapp || cliente.phone)!,
            `${contato ? `Olá, ${contato}!` : 'Olá!'} Sobre a proposta ${codigo} que enviamos, `
            + 'conseguiu avaliar? Qualquer dúvida estou à disposição.',
          )
        : null,
    });
  }

  return fila.sort((a, b) => b.diasDesde - a.diasDesde);
}

/**
 * Prepara um follow-up disparado à mão, a partir do cartão do pipeline.
 *
 * O manual existe justamente para furar as regras da rotina — o comercial
 * sentiu que é hora de cobrar, e o sistema não deve discutir. O que ele
 * faz é AVISAR: se já houve contato recente com o cliente, isso aparece no
 * diálogo antes do envio, e a decisão fica com quem está enviando.
 */
export async function prepararFollowUpManual(user: SessionUser, opportunityId: string) {
  const proposta = await prisma.proposal.findFirst({
    where: {
      companyId: user.companyId,
      deletedAt: null,
      sentAt: { not: null },
      budgetVersion: {
        budget: { opportunityId, companyId: user.companyId, deletedAt: null },
      },
    },
    orderBy: { sentAt: 'desc' },
    include: {
      followUps: { orderBy: { createdAt: 'desc' }, take: 1 },
      budgetVersion: {
        select: {
          validUntil: true,
          total: true,
          budget: {
            select: {
              clientId: true,
              client: {
                select: {
                  legalName: true, tradeName: true, email: true,
                  phone: true, whatsapp: true,
                },
              },
              contact: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!proposta || !proposta.sentAt) {
    return { error: 'Este negócio ainda não tem proposta enviada — não há o que cobrar.' };
  }

  const bv = proposta.budgetVersion;
  const cliente = bv.budget.client;
  const agora = new Date();

  // o tipo certo pelo estado da proposta, só para o texto sair adequado
  const validadeVencida = bv.validUntil !== null && bv.validUntil < agora;
  const tipo: TipoToque = validadeVencida
    ? 'EXPIRADA'
    : proposta.status === 'VISUALIZADA'
      ? 'VISUALIZADA_SEM_DECISAO'
      : 'SEM_RETORNO';

  const codigo = codigoProposta(proposta.code, proposta.revision);
  const contato = bv.budget.contact?.name ?? null;
  const validade = bv.validUntil ? formatDateBR(bv.validUntil) : null;
  const dias = diasUteisEntre(proposta.sentAt, agora);
  const { assunto, corpo } = mensagemPara(tipo, { codigo, contato, validade, dias });

  // contatos com este cliente nos últimos 7 dias — aviso, não trava
  const seteDiasAtras = new Date(agora);
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const contatosRecentes = await prisma.followUpEvent.count({
    where: {
      companyId: user.companyId,
      createdAt: { gte: seteDiasAtras },
      channel: { not: 'INTERNO' },
      proposal: {
        budgetVersion: { budget: { clientId: bv.budget.clientId } },
      },
    },
  });

  return {
    ok: true as const,
    proposalId: proposta.id,
    tipo,
    codigo,
    cliente: cliente.tradeName ?? cliente.legalName,
    para: bv.budget.contact?.email ?? cliente.email,
    contato,
    valor: formatBRL(bv.total.toString()),
    assunto,
    corpo,
    contatosRecentes,
    ultimoToqueEm: proposta.followUps[0]?.createdAt.toISOString() ?? null,
    urlWhatsApp: cliente.whatsapp || cliente.phone
      ? linkWhatsApp(
          (cliente.whatsapp || cliente.phone)!,
          `${contato ? `Olá, ${contato}!` : 'Olá!'} Sobre a proposta ${codigo} que enviamos, `
          + 'conseguiu avaliar? Qualquer dúvida estou à disposição.',
        )
      : null,
  };
}

/** Registra o toque — o que impede repetir e alimenta o histórico. */
async function registrarToque(
  companyId: string,
  input: {
    proposalId: string; tipo: TipoToque;
    canal: 'EMAIL' | 'WHATSAPP' | 'INTERNO';
    destinatario?: string | null; notas?: string | null; porUserId?: string | null;
  },
) {
  await prisma.followUpEvent.create({
    data: {
      companyId,
      proposalId: input.proposalId,
      kind: input.tipo,
      channel: input.canal,
      recipient: input.destinatario ?? null,
      notes: input.notas ?? null,
      createdById: input.porUserId ?? null,
    },
  });
}

/** Envio aprovado na tela: manda o e-mail e registra. */
export async function enviarToque(
  user: SessionUser,
  input: { proposalId: string; tipo: TipoToque; para: string; assunto: string; corpo: string },
) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: input.proposalId, companyId: user.companyId, deletedAt: null },
    select: { id: true, code: true, revision: true, verificationCode: true },
  });
  if (!proposal) return { error: 'Proposta não encontrada.' };

  const codigo = codigoProposta(proposal.code, proposal.revision);
  const link = proposal.verificationCode ? verificationUrl(proposal.verificationCode) : null;

  const envio = await enviarEmail({
    para: input.para,
    remetente: remetenteComCaixa('orcamentos'),
    responderPara: user.email,
    assunto: input.assunto,
    texto: `${input.corpo}\n\n${link ? `Ver a proposta: ${link}/pdf\n` : ''}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#0f172a">
        <p style="font-size:14px;line-height:1.6;white-space:pre-line">${input.corpo}</p>
        ${link ? `<p style="margin-top:18px">
          <a href="${link}/pdf" style="display:inline-block;background:#e22020;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 32px;border-radius:8px">
            VISUALIZAR PROPOSTA ${codigo}
          </a></p>` : ''}
        <p style="margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px">
          Mensagem enviada pelo sistema de gestão da SONARE Engenharia — você pode respondê-la normalmente.
        </p>
      </div>`,
  });
  if ('error' in envio) return { error: envio.error };

  await registrarEnvio({
    companyId: user.companyId, providerId: envio.providerId,
    para: input.para, assunto: input.assunto,
    entityType: 'proposal', entityId: input.proposalId,
  });

  await registrarToque(user.companyId, {
    proposalId: input.proposalId, tipo: input.tipo,
    canal: 'EMAIL', destinatario: input.para, porUserId: user.id,
  });
  await auditLog({
    companyId: user.companyId, userId: user.id, action: 'followup_sent',
    entityType: 'proposal', entityId: input.proposalId,
    after: { tipo: input.tipo, para: input.para },
  });
  return { ok: true as const };
}

/** Contato feito por fora (WhatsApp, telefone): só registra, para não repetir. */
export async function registrarContatoManual(
  user: SessionUser,
  input: { proposalId: string; tipo: TipoToque; canal: 'WHATSAPP' | 'INTERNO'; notas?: string },
) {
  const existe = await prisma.proposal.count({
    where: { id: input.proposalId, companyId: user.companyId, deletedAt: null },
  });
  if (existe === 0) return { error: 'Proposta não encontrada.' };

  await registrarToque(user.companyId, {
    proposalId: input.proposalId, tipo: input.tipo,
    canal: input.canal, notas: input.notas, porUserId: user.id,
  });
  return { ok: true as const };
}

/** Tira a proposta da fila sem contatar ninguém — "já falei, deixa quieto". */
export async function dispensarToque(
  user: SessionUser, proposalId: string, tipo: TipoToque, motivo?: string,
) {
  return registrarContatoManual(user, {
    proposalId, tipo, canal: 'INTERNO',
    notas: motivo ?? 'Dispensado na fila de follow-up.',
  });
}

/**
 * Rotina diária, chamada pelo agendador.
 *
 * No nível "avisar" e "preparar" ela não fala com cliente nenhum: só avisa a
 * equipe que há fila. Só o nível "automatico" dispara os e-mails — e ainda
 * assim dentro do horário comercial.
 */
export async function executarRotina(user: SessionUser, agora = new Date()) {
  const cfg = await getConfig(user.companyId);
  if (!cfg.ativo) return { ok: true as const, pulou: 'automação desligada' };

  const fila = await getFila(user, agora);
  if (fila.length === 0) return { ok: true as const, fila: 0, enviados: 0 };

  if (cfg.nivel === 'automatico' && !emHorarioComercial(agora)) {
    return { ok: true as const, fila: fila.length, enviados: 0, pulou: 'fora do horário comercial' };
  }

  let enviados = 0;
  if (cfg.nivel === 'automatico') {
    for (const item of fila) {
      if (!item.emailCliente) continue; // sem e-mail não há como falar
      const r = await enviarToque(user, {
        proposalId: item.proposalId, tipo: item.tipo,
        para: item.emailCliente, assunto: item.assunto, corpo: item.corpo,
      });
      if ('ok' in r) enviados += 1;
    }
  }

  const pendentes = fila.length - enviados;
  if (pendentes > 0) {
    await notificar(user, {
      paraUserId: user.id,
      kind: 'followup_pendente',
      titulo: `${pendentes} proposta(s) aguardando retorno`,
      corpo: 'Há propostas enviadas sem resposta do cliente. Abra a fila de follow-up para revisar e enviar.',
      link: '/orcamentos/followup',
    });
  }

  return { ok: true as const, fila: fila.length, enviados };
}
