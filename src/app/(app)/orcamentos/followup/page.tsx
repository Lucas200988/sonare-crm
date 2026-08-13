import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, PauseCircle } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getConfig, getFila } from '@/server/services/followup';
import { PageHeader, Card, EmptyState, Badge } from '@/components/ui';
import { ConfigPanel, RunNowButton, QueueItemActions } from './followup-actions';

export const metadata: Metadata = { title: 'Follow-up de propostas — SONARE CRM' };

const COR_TIPO: Record<string, string> = {
  EXPIRADA: 'red',
  VALIDADE_PROXIMA: 'amber',
  VISUALIZADA_SEM_DECISAO: 'blue',
  SEM_RETORNO: 'slate',
};

export default async function FollowUpPage() {
  const user = await requirePermissionPage('proposal:read');
  const canWrite = user.permissions.has('proposal:write');

  const [cfg, fila] = await Promise.all([getConfig(user.companyId), getFila(user)]);

  return (
    <div>
      <PageHeader
        title="Follow-up de propostas"
        subtitle={
          cfg.ativo
            ? `${fila.length} proposta(s) aguardando um retorno`
            : 'Automação desligada — ligue nas regras para o sistema começar a acompanhar'
        }
        actions={
          canWrite ? (
            <div className="flex items-center gap-2">
              <RunNowButton />
              <ConfigPanel inicial={cfg} />
            </div>
          ) : null
        }
      />

      {!cfg.ativo ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <p className="text-xs text-slate-600">
            A automação nasce desligada de propósito — assim ninguém é surpreendido por um e-mail
            enviado ao cliente. Em <strong>Ajustar regras</strong>, ligue e escolha o que o sistema pode
            fazer: só avisar a equipe, preparar o texto para você aprovar, ou enviar sozinho.
          </p>
        </div>
      ) : cfg.nivel === 'automatico' ? (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Envio automático ligado: a rotina diária dispara estes e-mails sozinha, em horário comercial.
        </p>
      ) : null}

      {fila.length === 0 ? (
        <EmptyState
          title={cfg.ativo ? 'Nenhuma proposta esperando retorno' : 'Fila vazia'}
          description={
            cfg.ativo
              ? 'Toda proposta enviada teve resposta ou já foi contatada dentro do prazo configurado.'
              : 'Com a automação ligada, as propostas sem retorno aparecem aqui.'
          }
        />
      ) : (
        <div className="space-y-2">
          {fila.map((item) => (
            <Card key={`${item.proposalId}-${item.tipo}`} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    <Link href={`/orcamentos/${item.budgetId}`} className="hover:underline">
                      {item.codigo}
                    </Link>
                    <span className="ml-2 font-normal text-slate-600">{item.cliente}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Orçamento{' '}
                    <Link href={`/orcamentos/${item.budgetId}`} className="underline hover:text-brand">
                      {item.orcamento}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.valor}
                    {item.contato ? ` · A/C ${item.contato}` : ''}
                    {item.validade ? ` · validade ${item.validade}` : ''}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {item.tipo === 'VALIDADE_PROXIMA'
                      ? `Vence em ${item.diasDesde} dia(s)`
                      : item.tipo === 'EXPIRADA'
                        ? `Venceu há ${item.diasDesde} dia(s)`
                        : `Há ${item.diasDesde} dia(s) úteis`}
                    {!item.emailCliente ? ' · cliente sem e-mail cadastrado' : ''}
                  </p>
                </div>
                <Badge color={COR_TIPO[item.tipo] ?? 'slate'}>{item.rotulo}</Badge>
              </div>

              {canWrite ? (
                <div className="mt-2">
                  <QueueItemActions
                    proposalId={item.proposalId}
                    tipo={item.tipo}
                    para={item.emailCliente}
                    assunto={item.assunto}
                    corpo={item.corpo}
                    urlWhatsApp={item.urlWhatsApp}
                  />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        O acompanhamento para sozinho assim que o cliente responde — visualizou, aceitou ou recusou.
        Todo contato fica registrado no histórico da proposta.{' '}
        <Link href="/orcamentos" className="underline">Voltar aos orçamentos</Link>
      </p>
    </div>
  );
}
