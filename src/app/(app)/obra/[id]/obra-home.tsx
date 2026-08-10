'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Ban, CheckSquare, CloudSun, Copy, Eye, FileText,
  MapPin, MessageSquare, Package, Play, Sun, Trash2, Users, Wrench, X,
} from 'lucide-react';
import {
  abrirDiarioAction, adicionarEquipamentoAction, adicionarEquipeAction,
  finalizarDiarioAction, registrarNoDiarioAction, removerEquipamentoAction,
  removerEquipeAction, removerRegistroAction, repetirDiaAnteriorAction,
} from '@/actions/diario';
import { inputCls, Field, FormError, SubmitButton } from '@/components/ui';

export type DiarioDaTela = {
  id: string;
  code: string;
  status: string;
  abertura: string;
  localTexto: string;
  geofence: string | null;
  clima: {
    rotulo?: string; tempC?: number | null; fonte?: string; consultadoEm?: string;
  } | null;
  narrativa: string | null;
  entries: Array<{
    id: string;
    kind: string;
    title: string;
    description: string | null;
    responsible: string | null;
    status: string | null;
    happenedAt: string;
    payload: Record<string, string> | null;
  }>;
  workforce: Array<{ id: string; role: string; company: string | null; quantity: number }>;
  equipment: Array<{ id: string; name: string; identification: string | null; quantity: number }>;
  sugestoesAtividade: string[];
  conferencia: { pendencias: string[]; narrativa: string } | null;
};

type Projeto = {
  id: string; code: string; name: string; cliente: string; endereco: string | null;
};

const KIND_META: Record<string, { rotulo: string; Icone: typeof CheckSquare; cor: string }> = {
  ATIVIDADE: { rotulo: 'Atividade', Icone: CheckSquare, cor: 'text-green-700 bg-green-50 border-green-200' },
  OCORRENCIA: { rotulo: 'Ocorrência', Icone: AlertTriangle, cor: 'text-amber-700 bg-amber-50 border-amber-200' },
  IMPEDIMENTO: { rotulo: 'Impedimento', Icone: Ban, cor: 'text-red-700 bg-red-50 border-red-200' },
  ORIENTACAO: { rotulo: 'Orientação', Icone: MessageSquare, cor: 'text-sky-700 bg-sky-50 border-sky-200' },
  VISITANTE: { rotulo: 'Visitante', Icone: Eye, cor: 'text-violet-700 bg-violet-50 border-violet-200' },
  MATERIAL: { rotulo: 'Material', Icone: Package, cor: 'text-slate-700 bg-slate-50 border-slate-200' },
  OBSERVACAO: { rotulo: 'Observação', Icone: FileText, cor: 'text-slate-700 bg-slate-50 border-slate-200' },
};

function horaLocal(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Cuiaba',
  }).format(new Date(iso));
}

/**
 * Home da obra no celular.
 *
 * A regra de projeto: qualquer operação rotineira no menor número de toques
 * possível. Um formulário por vez, botões de dedo, e tudo que o sistema já
 * sabe (obra, data, usuário, hora) não é perguntado.
 */
export function ObraHome({ projeto, diario, canWrite }: {
  projeto: Projeto;
  diario: DiarioDaTela | null;
  canWrite: boolean;
}) {
  if (!diario) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">{projeto.name}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{projeto.code} · {projeto.cliente}</p>
        {projeto.endereco ? (
          <p className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-400">
            <MapPin className="h-3 w-3" aria-hidden /> {projeto.endereco}
          </p>
        ) : null}
        {canWrite ? (
          <IniciarDiario projectId={projeto.id} />
        ) : (
          <p className="mt-6 text-sm text-slate-500">Nenhum diário aberto hoje.</p>
        )}
      </div>
    );
  }

  const fechado = diario.status !== 'ABERTO';
  const contagem = (kind: string) => diario.entries.filter((e) => e.kind === kind).length;

  return (
    <div className="space-y-4">
      {/* Cabeçalho do dia */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-slate-900">{projeto.name}</h1>
            <p className="text-xs text-slate-500">
              {diario.code} · aberto às {horaLocal(diario.abertura)}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            fechado ? 'bg-green-100 text-green-800' : 'bg-sky-100 text-sky-800'
          }`}>
            {fechado ? 'Finalizado' : 'Em andamento'}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className={`flex items-center gap-1 ${
            diario.geofence === 'FORA' ? 'text-red-600 font-medium' : ''
          }`}>
            <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {diario.localTexto}
          </span>
          {diario.clima?.rotulo ? (
            <span className="flex items-center gap-1" title={`Fonte: ${diario.clima.fonte}`}>
              <CloudSun className="h-3 w-3 shrink-0" aria-hidden />
              {diario.clima.rotulo}
              {diario.clima.tempC != null ? ` · ${Math.round(diario.clima.tempC)}°C` : ''}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Contador rotulo="Equipe" valor={diario.workforce.reduce((a, w) => a + w.quantity, 0)} />
          <Contador rotulo="Atividades" valor={contagem('ATIVIDADE')} />
          <Contador rotulo="Ocorrências" valor={contagem('OCORRENCIA')} />
          <Contador rotulo="Impedim." valor={contagem('IMPEDIMENTO')} />
        </div>
      </div>

      {fechado ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-900">Diário finalizado</p>
          {diario.narrativa ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-green-900/90">{diario.narrativa}</p>
          ) : null}
        </div>
      ) : canWrite ? (
        <Botoes projeto={projeto} diario={diario} />
      ) : null}

      <Registros projeto={projeto} diario={diario} canWrite={canWrite && !fechado} />
      <EquipeSection projeto={projeto} diario={diario} canWrite={canWrite && !fechado} />
      <EquipamentosSection projeto={projeto} diario={diario} canWrite={canWrite && !fechado} />

      {!fechado && canWrite ? (
        <Finalizar projeto={projeto} diario={diario} />
      ) : null}
    </div>
  );
}

function Contador({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5">
      <p className="text-lg font-bold leading-tight text-slate-900">{valor}</p>
      <p className="text-[10px] text-slate-500">{rotulo}</p>
    </div>
  );
}

/**
 * Abertura do diário: pede o GPS na hora do toque, e abre mesmo sem ele.
 *
 * O GPS negado ou indisponível não pode impedir o trabalho — a classificação
 * fica "indisponível" e segue.
 */
function IniciarDiario({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fase, setFase] = useState<'parado' | 'gps' | 'abrindo'>('parado');
  const [erro, setErro] = useState<string | null>(null);

  function iniciar() {
    setErro(null);
    setFase('gps');

    const abrir = (loc: { lat: number | null; lng: number | null; accuracy: number | null }) => {
      setFase('abrindo');
      startTransition(async () => {
        const r = await abrirDiarioAction(projectId, loc);
        if (r.error) { setErro(r.error); setFase('parado'); return; }
        router.refresh();
      });
    };

    if (!navigator.geolocation) {
      abrir({ lat: null, lng: null, accuracy: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => abrir({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => abrir({ lat: null, lng: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={iniciar}
        disabled={pending || fase !== 'parado'}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-4 text-base font-bold text-white shadow-md transition hover:bg-brand-dark disabled:opacity-60"
      >
        <Play className="h-5 w-5" aria-hidden />
        {fase === 'gps' ? 'Obtendo localização…'
          : fase === 'abrindo' ? 'Abrindo o diário…'
            : 'Iniciar diário de hoje'}
      </button>
      <p className="mt-2 text-[11px] text-slate-400">
        A localização é associada ao registro para rastreabilidade do trabalho em campo.
      </p>
      {erro ? <p className="mt-2 text-sm text-red-600">{erro}</p> : null}
    </div>
  );
}

type TipoForm = 'ATIVIDADE' | 'OCORRENCIA' | 'IMPEDIMENTO' | 'OBSERVACAO' | null;

function Botoes({ projeto, diario }: { projeto: Projeto; diario: DiarioDaTela }) {
  const [aberto, setAberto] = useState<TipoForm>(null);

  const botoes: Array<{ tipo: Exclude<TipoForm, null>; rotulo: string; Icone: typeof Sun }> = [
    { tipo: 'ATIVIDADE', rotulo: 'Atividade', Icone: CheckSquare },
    { tipo: 'OCORRENCIA', rotulo: 'Ocorrência', Icone: AlertTriangle },
    { tipo: 'IMPEDIMENTO', rotulo: 'Impedimento', Icone: Ban },
    { tipo: 'OBSERVACAO', rotulo: 'Observação', Icone: FileText },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {botoes.map((b) => (
          <button
            key={b.tipo}
            type="button"
            onClick={() => setAberto(aberto === b.tipo ? null : b.tipo)}
            aria-pressed={aberto === b.tipo}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-4 text-sm font-semibold transition ${
              aberto === b.tipo
                ? 'border-brand bg-brand text-white'
                : 'border-slate-200 bg-white text-slate-800 hover:border-brand/50'
            }`}
          >
            <b.Icone className="h-5 w-5" aria-hidden /> {b.rotulo}
          </button>
        ))}
      </div>

      {aberto ? (
        <FormRegistro
          tipo={aberto}
          projeto={projeto}
          diario={diario}
          onFechar={() => setAberto(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Um formulário por tipo, com só os campos daquele tipo.
 *
 * A atividade sugere o que já está planejado no projeto — selecionar em vez
 * de digitar é o que faz o diário ser preenchido de verdade.
 */
function FormRegistro({ tipo, projeto, diario, onFechar }: {
  tipo: Exclude<TipoForm, null>;
  projeto: Projeto;
  diario: DiarioDaTela;
  onFechar: () => void;
}) {
  const router = useRouter();
  const acao = registrarNoDiarioAction.bind(null, diario.id, projeto.id);
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof acao>>, fd: FormData) => {
      const r = await acao(prev, fd);
      if (!r.error) { onFechar(); router.refresh(); }
      return r;
    },
    {},
  );

  const meta = KIND_META[tipo];

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="kind" value={tipo} />
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <meta.Icone className="h-4 w-4" aria-hidden /> {meta.rotulo}
      </p>

      <Field label={tipo === 'ATIVIDADE' ? 'O que foi executado' : 'Título'} htmlFor="r-titulo" required>
        <input
          id="r-titulo" name="title" required autoFocus list={tipo === 'ATIVIDADE' ? 'sugestoes' : undefined}
          placeholder={tipo === 'ATIVIDADE' ? 'Ex.: Instalação de eletrocalhas' : undefined}
          className={inputCls}
        />
        {tipo === 'ATIVIDADE' ? (
          <datalist id="sugestoes">
            {diario.sugestoesAtividade.map((s) => <option key={s} value={s} />)}
          </datalist>
        ) : null}
      </Field>

      {tipo === 'ATIVIDADE' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Quantidade" htmlFor="r-qtd">
            <input id="r-qtd" name="quantidade" inputMode="decimal" placeholder="40" className={inputCls} />
          </Field>
          <Field label="Unidade" htmlFor="r-un">
            <input id="r-un" name="unidade" placeholder="m, un, %…" className={inputCls} />
          </Field>
        </div>
      ) : null}

      {tipo === 'OCORRENCIA' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Gravidade" htmlFor="r-grav">
            <select id="r-grav" name="gravidade" defaultValue="MEDIA" className={inputCls}>
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
            </select>
          </Field>
          <Field label="Responsável" htmlFor="r-resp">
            <input id="r-resp" name="responsible" className={inputCls} />
          </Field>
        </div>
      ) : null}

      {tipo === 'IMPEDIMENTO' ? (
        <Field label="Responsável pelo impedimento" htmlFor="r-resp" hint="Ex.: contratante, fornecedor, concessionária">
          <input id="r-resp" name="responsible" className={inputCls} />
        </Field>
      ) : null}

      <Field label="Detalhes (opcional)" htmlFor="r-desc">
        <textarea id="r-desc" name="description" rows={2} className={inputCls} />
      </Field>

      <FormError message={state.error} />
      <div className="flex gap-2">
        <SubmitButton pending={pending}>Registrar</SubmitButton>
        <button
          type="button" onClick={onFechar}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Registros({ projeto, diario, canWrite }: {
  projeto: Projeto; diario: DiarioDaTela; canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (diario.entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Registros do dia</h2>
      <ul className="space-y-2">
        {diario.entries.map((e) => {
          const meta = KIND_META[e.kind] ?? KIND_META.OBSERVACAO;
          const extras = [
            e.payload?.quantidade
              ? `${e.payload.quantidade}${e.payload.unidade ? ` ${e.payload.unidade}` : ''}`
              : null,
            e.payload?.gravidade ? `gravidade ${e.payload.gravidade.toLowerCase()}` : null,
            e.responsible ? `resp.: ${e.responsible}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <li key={e.id} className={`rounded-lg border p-2.5 ${meta.cor}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <meta.Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="text-[11px] opacity-75">
                      {horaLocal(e.happenedAt)}{extras ? ` · ${extras}` : ''}
                    </p>
                    {e.description ? (
                      <p className="mt-0.5 text-xs opacity-90">{e.description}</p>
                    ) : null}
                  </div>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Remover ${e.title}`}
                    onClick={() => startTransition(async () => {
                      await removerRegistroAction(diario.id, projeto.id, e.id);
                      router.refresh();
                    })}
                    className="rounded p-1 opacity-50 hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EquipeSection({ projeto, diario, canWrite }: {
  projeto: Projeto; diario: DiarioDaTela; canWrite: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendingCopy, startCopy] = useTransition();
  const [erroCopy, setErroCopy] = useState<string | null>(null);
  const acao = adicionarEquipeAction.bind(null, diario.id, projeto.id);
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof acao>>, fd: FormData) => {
      const r = await acao(prev, fd);
      if (!r.error) { setAberto(false); router.refresh(); }
      return r;
    },
    {},
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Users className="h-4 w-4" aria-hidden /> Equipe
        </h2>
        {canWrite ? (
          <div className="flex gap-1.5">
            {diario.workforce.length === 0 ? (
              <button
                type="button"
                disabled={pendingCopy}
                onClick={() => startCopy(async () => {
                  setErroCopy(null);
                  const r = await repetirDiaAnteriorAction(diario.id, projeto.id);
                  if (r.error) setErroCopy(r.error);
                  else router.refresh();
                })}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <Copy className="h-3 w-3" aria-hidden /> Repetir ontem
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              Adicionar
            </button>
          </div>
        ) : null}
      </div>
      {erroCopy ? <p className="mb-2 text-xs text-red-600">{erroCopy}</p> : null}

      {aberto ? (
        <form action={formAction} className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Field label="Função" htmlFor="w-role" required>
              <input id="w-role" name="role" required autoFocus placeholder="Eletricista" list="funcoes" className={inputCls} />
              <datalist id="funcoes">
                {['Eletricista', 'Ajudante', 'Encarregado', 'Engenheiro', 'Técnico', 'Pedreiro', 'Soldador'].map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
            <Field label="Qtd." htmlFor="w-qtd" required>
              <input id="w-qtd" name="quantity" type="number" min={1} defaultValue={1} required className={inputCls} />
            </Field>
          </div>
          <Field label="Empresa (opcional)" htmlFor="w-emp">
            <input id="w-emp" name="company" className={inputCls} />
          </Field>
          <FormError message={state.error} />
          <SubmitButton pending={pending}>Adicionar</SubmitButton>
        </form>
      ) : null}

      {diario.workforce.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhuma equipe registrada.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {diario.workforce.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-slate-800">
                {w.role}{w.company ? <span className="text-xs text-slate-400"> · {w.company}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{w.quantity}</span>
                {canWrite ? (
                  <RemoverBotao onClick={() => removerEquipeAction(diario.id, projeto.id, w.id)} rotulo={w.role} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EquipamentosSection({ projeto, diario, canWrite }: {
  projeto: Projeto; diario: DiarioDaTela; canWrite: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const acao = adicionarEquipamentoAction.bind(null, diario.id, projeto.id);
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof acao>>, fd: FormData) => {
      const r = await acao(prev, fd);
      if (!r.error) { setAberto(false); router.refresh(); }
      return r;
    },
    {},
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Wrench className="h-4 w-4" aria-hidden /> Equipamentos
        </h2>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
          >
            Adicionar
          </button>
        ) : null}
      </div>

      {aberto ? (
        <form action={formAction} className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Field label="Equipamento" htmlFor="e-nome" required>
              <input id="e-nome" name="name" required autoFocus placeholder="Plataforma elevatória" className={inputCls} />
            </Field>
            <Field label="Qtd." htmlFor="e-qtd">
              <input id="e-qtd" name="quantity" type="number" min={1} defaultValue={1} className={inputCls} />
            </Field>
          </div>
          <FormError message={state.error} />
          <SubmitButton pending={pending}>Adicionar</SubmitButton>
        </form>
      ) : null}

      {diario.equipment.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum equipamento registrado.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {diario.equipment.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-slate-800">
                {e.name}
                {e.identification ? <span className="text-xs text-slate-400"> · {e.identification}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{e.quantity}</span>
                {canWrite ? (
                  <RemoverBotao onClick={() => removerEquipamentoAction(diario.id, projeto.id, e.id)} rotulo={e.name} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RemoverBotao({ onClick, rotulo }: { onClick: () => Promise<unknown>; rotulo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remover ${rotulo}`}
      onClick={() => startTransition(async () => { await onClick(); router.refresh(); })}
      className="rounded p-1 text-slate-300 hover:text-red-600"
    >
      <X className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/**
 * Fechamento com conferência.
 *
 * As pendências não impedem — obra fecha com o que tem. Mas as ignoradas
 * ficam gravadas no diário, porque três meses depois isso é informação.
 */
function Finalizar({ projeto, diario }: { projeto: Projeto; diario: DiarioDaTela }) {
  const router = useRouter();
  const [conferindo, setConferindo] = useState(false);
  const acao = finalizarDiarioAction.bind(null, diario.id, projeto.id);
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof acao>>, fd: FormData) => {
      const r = await acao(prev, fd);
      if (!r.error) { setConferindo(false); router.refresh(); }
      return r;
    },
    {},
  );

  const pendencias = diario.conferencia?.pendencias ?? [];

  if (!conferindo) {
    return (
      <button
        type="button"
        onClick={() => setConferindo(true)}
        className="w-full rounded-xl border-2 border-slate-800 bg-slate-900 px-6 py-4 text-base font-bold text-white transition hover:bg-slate-700"
      >
        Finalizar diário
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Conferência do dia</h2>

      {pendencias.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">Antes de finalizar:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
            {pendencias.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      ) : null}
      <input type="hidden" name="avisos" value={JSON.stringify(pendencias)} />

      <Field
        label="Narrativa do dia"
        htmlFor="f-narrativa"
        hint="Montada a partir dos registros. Ajuste o que quiser antes de fechar."
      >
        <textarea
          id="f-narrativa" name="narrativa" rows={7}
          defaultValue={diario.conferencia?.narrativa ?? ''}
          className={`${inputCls} text-sm`}
        />
      </Field>

      <FormError message={state.error} />
      <div className="flex gap-2">
        <SubmitButton pending={pending}>
          {pendencias.length > 0 ? 'Finalizar assim mesmo' : 'Finalizar diário'}
        </SubmitButton>
        <button
          type="button" onClick={() => setConferindo(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"
        >
          Voltar
        </button>
      </div>
    </form>
  );
}
