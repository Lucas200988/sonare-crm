'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Check, CircleDot, Clock, FileText, Megaphone, Plug, Siren, Trash2,
} from 'lucide-react';
import {
  abrirAprovacaoAction, cancelarAprovacaoAction, concluirPassoAction,
  registrarCobrancaAction, registrarProtocoloAction,
} from '@/actions/aprovacoes';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';
import { formatDateBR } from '@/lib/dates';
import {
  MODELO_POR_CODIGO, TEXTO_ACAO, prazoDoPasso, situacaoPasso,
  type CodigoPasso, type StatusPasso,
} from '@/lib/aprovacao-externa';

export type PassoDoProcesso = {
  id: string;
  code: string;
  name: string;
  status: StatusPasso;
  protocol: string | null;
  protocolAt: string | null;
  deadlineDays: number | null;
  respondedAt: string | null;
  chargedAt: string | null;
  outcome: string | null;
  notes: string | null;
};

export type ProcessoAprovacao = {
  id: string;
  orgao: string;
  status: string;
  steps: PassoDoProcesso[];
};

/** Desfechos oferecidos por passo — evita cada um escrever de um jeito. */
const DESFECHOS: Partial<Record<CodigoPasso, string[]>> = {
  ORCAMENTO_RECEBIDO: ['Aceito', 'Recusado'],
  CONTRATO_CONEXAO: ['Contrato assinado', 'Não gera contrato'],
  PARECER_ACESSO: ['Aprovado', 'Aprovado com exigências', 'Reprovado'],
};

const CORES = {
  pendente: 'border-slate-200 bg-white',
  aguardando: 'border-sky-200 bg-sky-50',
  atrasado: 'border-red-300 bg-red-50',
  concluido: 'border-green-200 bg-green-50',
  dispensado: 'border-slate-200 bg-slate-50',
};

/**
 * Acompanhamento do processo na concessionária.
 *
 * Cada passo mostra o protocolo, o prazo que corre e o que fazer agora. O
 * prazo é o ponto: ele corre contra o órgão, e quem não conta os dias perde
 * tempo de obra sem ter a quem reclamar depois.
 */
export function ApprovalPanel({
  projectId, processo, canWrite,
}: {
  projectId: string;
  processo: ProcessoAprovacao | null;
  canWrite: boolean;
}) {
  if (!processo) {
    return canWrite ? <AbrirProcesso projectId={projectId} /> : null;
  }

  const agora = new Date();
  const emAberto = processo.steps.find(
    (p) => p.status !== 'CONCLUIDO' && p.status !== 'DISPENSADO',
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Plug className="h-4 w-4 text-brand" aria-hidden />
        <h3 className="text-sm font-semibold text-slate-900">
          Aprovação na {processo.orgao}
        </h3>
        {processo.status === 'CONCLUIDO' ? (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800">
            Concluído
          </span>
        ) : null}
        {canWrite && processo.status === 'EM_ANDAMENTO' ? (
          <RemoverProcesso processo={processo} projectId={projectId} />
        ) : null}
      </div>

      <ol className="space-y-2">
        {processo.steps.map((passo) => (
          <Passo
            key={passo.id}
            passo={passo}
            projectId={projectId}
            agora={agora}
            atual={passo.id === emAberto?.id}
            canWrite={canWrite}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * Saída para o clique errado.
 *
 * Processo virgem some sem cerimônia — bastou confirmar. Se algum passo já
 * tem protocolo ou registro, aquilo aconteceu de verdade: o cancelamento
 * pede um motivo e o processo vai para a auditoria em vez de sumir.
 */
function RemoverProcesso({ processo, projectId }: {
  processo: ProcessoAprovacao; projectId: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const temProgresso = processo.steps.some(
    (p) => p.protocol !== null || p.status !== 'PENDENTE',
  );

  function remover() {
    startTransition(async () => {
      setErro(null);
      const r = await cancelarAprovacaoAction(
        processo.id, projectId, temProgresso ? motivo : null,
      );
      if (r.error) { setErro(r.error); return; }
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <div className="ml-auto">
      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          title="Remover processo"
          aria-label="Remover processo de aprovação"
          className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {temProgresso ? (
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo do cancelamento"
              aria-label="Motivo do cancelamento"
              className={`${inputCls} w-56 py-1 text-xs`}
            />
          ) : (
            <span className="text-[11px] text-slate-500">Aberto por engano?</span>
          )}
          <button
            type="button"
            disabled={pending || (temProgresso && !motivo.trim())}
            onClick={remover}
            className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {pending ? 'Removendo…' : temProgresso ? 'Cancelar processo' : 'Remover'}
          </button>
          <button
            type="button"
            onClick={() => { setAberto(false); setErro(null); }}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
          >
            Manter
          </button>
          {erro ? <span className="w-full text-right text-[11px] text-red-700">{erro}</span> : null}
        </div>
      )}
    </div>
  );
}

function Passo({ passo, projectId, agora, atual, canWrite }: {
  passo: PassoDoProcesso;
  projectId: string;
  agora: Date;
  atual: boolean;
  canWrite: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const modelo = MODELO_POR_CODIGO.get(passo.code as CodigoPasso);

  const situacao = situacaoPasso({
    status: passo.status,
    prazoDias: passo.deadlineDays,
    protocoladoEm: passo.protocolAt ? new Date(passo.protocolAt) : null,
    respondidoEm: passo.respondedAt ? new Date(passo.respondedAt) : null,
    cobradoEm: passo.chargedAt ? new Date(passo.chargedAt) : null,
  }, agora);

  const limite = passo.protocolAt && passo.deadlineDays
    ? prazoDoPasso(new Date(passo.protocolAt), passo.deadlineDays)
    : null;

  const Icone = situacao.nivel === 'concluido' ? Check
    : situacao.nivel === 'atrasado' ? AlertTriangle
      : situacao.nivel === 'aguardando' ? Clock : CircleDot;

  return (
    <li className={`rounded-lg border p-3 ${CORES[situacao.nivel]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icone className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">{passo.name}</p>

            {passo.protocol ? (
              <p className="text-xs text-slate-600">
                Protocolo <span className="font-medium">{passo.protocol}</span>
                {passo.protocolAt ? ` · ${formatDateBR(passo.protocolAt)}` : ''}
                {limite ? ` · prazo até ${formatDateBR(limite)}` : ''}
              </p>
            ) : atual && modelo ? (
              <p className="text-xs text-slate-500">{modelo.instrucao}</p>
            ) : null}

            {passo.outcome ? (
              <p className="mt-0.5 text-xs font-medium text-slate-700">{passo.outcome}</p>
            ) : null}
            {passo.notes ? (
              <p className="mt-0.5 text-[11px] italic text-slate-500">{passo.notes}</p>
            ) : null}
            {passo.chargedAt ? (
              <p className="mt-0.5 text-[11px] text-slate-500">
                Cobrado em {formatDateBR(passo.chargedAt)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {situacao.nivel !== 'concluido' && situacao.nivel !== 'dispensado' ? (
            <span className={`text-[11px] font-medium ${
              situacao.nivel === 'atrasado' ? 'text-red-700' : 'text-slate-500'
            }`}>
              {situacao.resumo}
            </span>
          ) : passo.respondedAt ? (
            <span className="text-[11px] text-slate-500">{formatDateBR(passo.respondedAt)}</span>
          ) : null}

          {canWrite && atual && !aberto ? (
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Registrar
            </button>
          ) : null}
        </div>
      </div>

      {/* A escalada só aparece quando há prazo estourado — sugerir ouvidoria
          com o prazo correndo seria pressa sem motivo. */}
      {situacao.nivel === 'atrasado' && canWrite ? (
        <Escalada
          stepId={passo.id}
          projectId={projectId}
          acao={situacao.acao === 'ouvidoria' ? 'ouvidoria' : 'cobrar'}
          jaCobrado={passo.chargedAt !== null}
        />
      ) : null}

      {aberto ? (
        <FormularioPasso
          passo={passo}
          projectId={projectId}
          onFechar={() => setAberto(false)}
        />
      ) : null}
    </li>
  );
}

function Escalada({ stepId, projectId, acao, jaCobrado }: {
  stepId: string; projectId: string; acao: 'cobrar' | 'ouvidoria'; jaCobrado: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-red-200 pt-2">
      {acao === 'ouvidoria' ? (
        <>
          <Siren className="h-3.5 w-3.5 text-red-700" aria-hidden />
          <span className="text-[11px] text-red-800">
            {jaCobrado
              ? 'A cobrança não resolveu. O caminho agora é a ouvidoria.'
              : 'O atraso já passou de uma semana — vale acionar a ouvidoria.'}
          </span>
        </>
      ) : (
        <>
          <Megaphone className="h-3.5 w-3.5 text-red-700" aria-hidden />
          <span className="text-[11px] text-red-800">{TEXTO_ACAO.cobrar}.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => {
              setErro(null);
              const r = await registrarCobrancaAction(stepId, projectId);
              if (r.error) setErro(r.error);
              else router.refresh();
            })}
            className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {pending ? 'Registrando…' : 'Registrei a cobrança'}
          </button>
        </>
      )}
      {erro ? <span className="text-[11px] text-red-700">{erro}</span> : null}
    </div>
  );
}

/**
 * Um formulário por passo, com os campos que aquele passo pede.
 *
 * Passo com protocolo pede o número antes de qualquer coisa; passo de
 * decisão pede o desfecho. Mostrar tudo sempre faria a pessoa procurar o
 * que preencher.
 */
function FormularioPasso({ passo, projectId, onFechar }: {
  passo: PassoDoProcesso; projectId: string; onFechar: () => void;
}) {
  const router = useRouter();
  const modelo = MODELO_POR_CODIGO.get(passo.code as CodigoPasso);
  const precisaProtocolo = Boolean(modelo?.temProtocolo) && !passo.protocol;

  const acao = precisaProtocolo
    ? registrarProtocoloAction.bind(null, passo.id, projectId)
    : concluirPassoAction.bind(null, passo.id, projectId);
  const [state, formAction, pending] = useActionState(acao, {});

  useEffect(() => {
    if (state.info) { onFechar(); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const hoje = new Date().toISOString().slice(0, 10);
  const desfechos = DESFECHOS[passo.code as CodigoPasso];

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      {precisaProtocolo ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Número do protocolo" htmlFor={`p-${passo.id}`} required>
            <input id={`p-${passo.id}`} name="protocolo" required className={inputCls} />
          </Field>
          <Field label="Data do protocolo" htmlFor={`d-${passo.id}`} required>
            <input id={`d-${passo.id}`} name="data" type="date" defaultValue={hoje} required className={inputCls} />
          </Field>
          <p className="text-[11px] text-slate-500 sm:col-span-2">
            O prazo de {modelo?.prazoDias} dias passa a contar desta data.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {desfechos ? (
            <Field label="Desfecho" htmlFor={`o-${passo.id}`} required>
              <select id={`o-${passo.id}`} name="desfecho" required defaultValue="" className={inputCls}>
                <option value="" disabled>Selecione…</option>
                {desfechos.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="Data" htmlFor={`d-${passo.id}`} required>
            <input id={`d-${passo.id}`} name="data" type="date" defaultValue={hoje} required className={inputCls} />
          </Field>
        </div>
      )}

      <Field label="Observação" htmlFor={`n-${passo.id}`}>
        <input id={`n-${passo.id}`} name="notes" defaultValue={passo.notes ?? ''} className={inputCls} />
      </Field>

      {!precisaProtocolo ? (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="dispensar" className="rounded border-slate-300" />
          Este passo não se aplica a este projeto
        </label>
      ) : null}

      <FormError message={state.error} />
      <div className="flex gap-2">
        <SubmitButton pending={pending}>
          {precisaProtocolo ? 'Registrar protocolo' : 'Concluir passo'}
        </SubmitButton>
        <button
          type="button" onClick={onFechar}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AbrirProcesso({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const acao = abrirAprovacaoAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(acao, {});

  useEffect(() => {
    if (state.info) { setAberto(false); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs font-medium text-slate-600 hover:border-brand hover:text-brand"
      >
        <FileText className="h-4 w-4" aria-hidden />
        Este projeto precisa de aprovação na concessionária
      </button>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Abrir processo de aprovação</h3>
      <p className="mt-1 text-xs text-slate-500">
        Cria o roteiro: orçamento de conexão, contrato, protocolo do projeto e parecer —
        com o prazo de resposta contado a cada protocolo.
      </p>
      <div className="mt-3">
        <Field label="Órgão" htmlFor="orgao" required>
          <input id="orgao" name="orgao" defaultValue="Energisa" required className={inputCls} />
        </Field>
      </div>
      <FormError message={state.error} />
      <div className="mt-3 flex gap-2">
        <SubmitButton pending={pending}>Abrir processo</SubmitButton>
        <button
          type="button" onClick={() => setAberto(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
