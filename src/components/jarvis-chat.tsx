'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, Paperclip, RotateCcw, Send, ShieldAlert, Sparkles, X,
} from 'lucide-react';
import {
  cancelarAcaoDoJarvisAction, cancelarRascunhoDoJarvisAction, confirmarAcaoDoJarvisAction,
  conversaRecenteDoJarvisAction, perguntarAoJarvisAction,
} from '@/actions/agente';
import {
  ACEITOS_NO_SELETOR, ANEXOS_POR_MENSAGEM, anexoAceito, TAMANHO_MAXIMO_ANEXO,
} from '@/lib/agente-anexos';

type Arquivo = { url: string; nome: string | null; orcamentoId: string } | null;
type Anexo = { id: string; nome: string };
type Fala = { id: string; papel: 'user' | 'jarvis'; texto: string; arquivo?: Arquivo; anexos?: Anexo[] };
type AcaoPendente = { id: string; resumo: string } | null;
type Rascunho = {
  rascunhoId: string;
  resumo: string;
  totais: { subtotal: number; desconto: number; total: number };
  avisosComerciais: string[];
  faltantes: { obrigatorios: string[]; recomendaveis: string[] };
  rascunho: { clienteNome: string; itens: Array<{ descricao: string; quantidade: number; precoUnitario: number }>; prazoExecucao: string; formaPagamento: string; validadeDias: number };
} | null;

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const SUGESTOES = [
  'Como está a empresa hoje?',
  'O que merece minha atenção?',
  'Quais tarefas estão vencidas?',
  'Quais propostas precisam de atenção?',
];

/**
 * O Jarvis na tela: botão flutuante e painel de conversa.
 *
 * Deliberadamente discreto — um assistente, não um pop-up. O painel carrega
 * a última conversa ao abrir, e "nova conversa" começa outra thread (as
 * anteriores ficam guardadas no servidor).
 */
export function JarvisChat() {
  const [aberto, setAberto] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [acaoPendente, setAcaoPendente] = useState<AcaoPendente>(null);
  // orçamento em elaboração — conversa e cartão manipulam o mesmo objeto
  const [rascunho, setRascunho] = useState<Rascunho>(null);
  // dupla confirmação: o primeiro clique arma, o segundo executa
  const [armada, setArmada] = useState(false);
  // arquivos já lidos pelo servidor, esperando a próxima mensagem
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [lendo, setLendo] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [pensando, startTransition] = useTransition();
  const [decidindo, startDecidir] = useTransition();
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (aberto) fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [falas, aberto, pensando]);

  function abrir() {
    setAberto(true);
    if (carregado) return;
    setCarregado(true);
    startTransition(async () => {
      const r = await conversaRecenteDoJarvisAction();
      if (r) {
        setThreadId(r.threadId);
        setFalas(r.mensagens.map((m) => ({ id: m.id, papel: m.papel, texto: m.texto, arquivo: m.arquivo ?? null, anexos: m.anexos ?? [] })));
        setAcaoPendente(r.acaoPendente ? { id: r.acaoPendente.id, resumo: r.acaoPendente.resumo } : null);
        setRascunho((r.rascunho as Rascunho) ?? null);
        setArmada(false);
      }
    });
  }

  /** Sobe o arquivo: o servidor lê, guarda só o texto e devolve a referência. */
  async function anexar(arquivo: File) {
    setErro(null);
    if (anexos.length >= ANEXOS_POR_MENSAGEM) { setErro(`No máximo ${ANEXOS_POR_MENSAGEM} arquivos por mensagem.`); return; }
    if (!anexoAceito(arquivo.type, arquivo.name)) { setErro('Formato não suportado. Envie PDF, Word (.docx), texto, CSV ou imagem (JPG/PNG).'); return; }
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO) { setErro('Arquivo acima de 4 MB. Envie só a parte que interessa.'); return; }

    setLendo(arquivo.name);
    try {
      const dados = new FormData();
      dados.set('arquivo', arquivo);
      if (threadId) dados.set('threadId', threadId);
      const res = await fetch('/api/jarvis/anexo', { method: 'POST', body: dados });
      const r = await res.json().catch(() => null) as
        | { error?: string; threadId?: string; documento?: { id: string; nome: string; cortado: boolean } } | null;
      if (!res.ok || !r?.documento || !r.threadId) {
        setErro(r?.error ?? 'Não consegui ler o arquivo. Tente novamente.');
        return;
      }
      setThreadId(r.threadId);
      setAnexos((p) => [...p, { id: r.documento!.id, nome: r.documento!.nome }]);
      if (r.documento.cortado) setErro('Arquivo longo: li só o começo (cerca de 60 mil caracteres).');
      inputRef.current?.focus();
    } catch {
      setErro('Falha no envio do arquivo. Confira a conexão e tente de novo.');
    } finally {
      setLendo(null);
    }
  }

  function enviar(mensagem: string) {
    // só o arquivo, sem texto: o pedido padrão é ler e resumir
    const limpa = mensagem.trim() || (anexos.length > 0 ? 'Leia o arquivo e me diga o que é importante.' : '');
    if (!limpa || pensando || lendo) return;
    const enviados = anexos;
    setErro(null);
    setTexto('');
    setAnexos([]);
    setFalas((p) => [...p, { id: `u-${Date.now()}`, papel: 'user', texto: limpa, anexos: enviados }]);

    startTransition(async () => {
      const r = await perguntarAoJarvisAction({ threadId, mensagem: limpa, documentoIds: enviados.map((a) => a.id) });
      if ('ok' in r && r.ok) {
        setThreadId(r.threadId);
        setFalas((p) => [...p, { id: `j-${Date.now()}`, papel: 'jarvis', texto: r.resposta }]);
        setAcaoPendente(r.acaoPendente ? { id: r.acaoPendente.id, resumo: r.acaoPendente.resumo } : null);
        setRascunho((r.rascunho as Rascunho) ?? null);
        setArmada(false);
        return;
      }
      setErro(('error' in r ? r.error : null) ?? 'Não consegui responder agora.');
      if ('threadId' in r && r.threadId) setThreadId(r.threadId);
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={abrir}
        title="SONARE AI Manager"
        aria-label="Abrir o assistente Jarvis"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:bg-brand"
      >
        <Sparkles className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-40 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl sm:bottom-5 sm:right-5 sm:h-[38rem] sm:max-h-[85vh] sm:w-[26rem] sm:rounded-2xl sm:border">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Jarvis</p>
            <p className="text-[10px] text-slate-400">SONARE AI Manager · propõe; você confirma</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setThreadId(null); setFalas([]); setAnexos([]); setErro(null); setAcaoPendente(null); setRascunho(null); setArmada(false); }}
            title="Nova conversa"
            aria-label="Começar nova conversa"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {falas.length === 0 && !pensando ? (
          <div className="space-y-2 pt-4">
            <p className="text-center text-xs text-slate-500">
              Pergunte sobre a operação — eu consulto os dados reais do CRM,
              respeitando o que você pode ver.
            </p>
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => enviar(s)}
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:border-brand/50 hover:bg-brand-light/40"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {falas.map((f) => (
          <div key={f.id} className={f.papel === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                f.papel === 'user'
                  ? 'rounded-br-sm bg-slate-900 text-white'
                  : 'rounded-bl-sm bg-slate-100 text-slate-800'
              }`}
            >
              {f.anexos?.length ? (
                <span className="mb-1 flex flex-wrap gap-1">
                  {f.anexos.map((a) => (
                    <span key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px]">
                      <FileText className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{a.nome}</span>
                    </span>
                  ))}
                </span>
              ) : null}
              {f.texto}
              {f.arquivo ? (
                <a
                  href={f.arquivo.url}
                  target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {f.arquivo.nome ? 'Baixar PDF da proposta' : 'Abrir orçamento'}
                </a>
              ) : null}
            </div>
          </div>
        ))}

        {rascunho ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Orçamento em elaboração
            </p>
            <p className="mt-1 text-xs font-medium text-slate-900">{rascunho.rascunho.clienteNome}</p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-slate-700">
              {rascunho.rascunho.itens.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{i.descricao}{i.quantidade !== 1 ? ` (${i.quantidade}×)` : ''}</span>
                  <span className="shrink-0 tabular-nums">{brl(i.quantidade * i.precoUnitario)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 border-t border-sky-200 pt-1.5 text-[11px] text-slate-700">
              {rascunho.totais.desconto > 0 ? (
                <p className="flex justify-between"><span>Desconto</span><span className="tabular-nums">- {brl(rascunho.totais.desconto)}</span></p>
              ) : null}
              <p className="flex justify-between font-semibold text-slate-900"><span>Total</span><span className="tabular-nums">{brl(rascunho.totais.total)}</span></p>
              {rascunho.rascunho.prazoExecucao ? <p>Prazo: {rascunho.rascunho.prazoExecucao}</p> : null}
              {rascunho.rascunho.formaPagamento ? <p>Pagamento: {rascunho.rascunho.formaPagamento}</p> : null}
              <p>Validade: {rascunho.rascunho.validadeDias} dias</p>
            </div>
            {rascunho.avisosComerciais.length > 0 ? (
              <p className="mt-1.5 rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-900">
                Exigirá aprovação interna: {rascunho.avisosComerciais.join('; ')}.
              </p>
            ) : null}
            {rascunho.faltantes.obrigatorios.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-red-700">Falta: {rascunho.faltantes.obrigatorios.join(', ')}.</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={pensando || rascunho.faltantes.obrigatorios.length > 0}
                onClick={() => enviar('Gere a proposta.')}
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand disabled:opacity-40"
              >
                Gerar proposta
              </button>
              <button
                type="button"
                disabled={pensando}
                onClick={() => enviar('Mostre o rascunho completo, com escopo, premissas, exclusões e as referências de preço.')}
                className="rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-40"
              >
                Visualizar
              </button>
              <button
                type="button"
                disabled={decidindo}
                onClick={() => startDecidir(async () => {
                  if (!threadId) return;
                  await cancelarRascunhoDoJarvisAction(threadId);
                  setRascunho(null);
                  setFalas((p) => [...p, { id: `a-${Date.now()}`, papel: 'jarvis', texto: 'Rascunho de orçamento descartado.' }]);
                })}
                className="ml-auto rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {acaoPendente ? (
          <div className={`rounded-xl border p-3 ${armada ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
            <p className={`flex items-start gap-1.5 text-xs font-medium ${armada ? 'text-red-900' : 'text-amber-900'}`}>
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {armada ? 'Última confirmação — a ação será executada de verdade' : 'Ação aguardando sua confirmação'}
            </p>
            <p className={`mt-1 text-xs ${armada ? 'text-red-900/90' : 'text-amber-900/90'}`}>
              {acaoPendente.resumo}
            </p>
            <div className="mt-2 flex gap-2">
              {!armada ? (
                <button
                  type="button"
                  disabled={decidindo}
                  onClick={() => setArmada(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Confirmar
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={decidindo}
                    onClick={() => startDecidir(async () => {
                      const r = await confirmarAcaoDoJarvisAction(acaoPendente.id);
                      setAcaoPendente(null);
                      setArmada(false);
                      const arquivo = 'ok' in r && r.ok ? (r.arquivo as Arquivo) ?? null : null;
                      if (arquivo) setRascunho(null); // o rascunho virou orçamento
                      setFalas((p) => [...p, {
                        id: `a-${Date.now()}`, papel: 'jarvis',
                        texto: 'ok' in r && r.ok ? r.mensagem : `A ação não foi executada: ${'error' in r ? r.error : 'falha'}`,
                        arquivo,
                      }]);
                    })}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    {decidindo ? 'Executando…' : 'Sim, executar'}
                  </button>
                  <button
                    type="button"
                    disabled={decidindo}
                    onClick={() => setArmada(false)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                  >
                    Voltar
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={decidindo}
                onClick={() => startDecidir(async () => {
                  await cancelarAcaoDoJarvisAction(acaoPendente.id);
                  setAcaoPendente(null);
                  setArmada(false);
                  setFalas((p) => [...p, { id: `a-${Date.now()}`, papel: 'jarvis', texto: 'Ação cancelada — nada foi executado.' }]);
                })}
                className={`ml-auto rounded-lg border bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  armada ? 'border-red-300 text-red-900 hover:bg-red-100' : 'border-amber-300 text-amber-900 hover:bg-amber-100'
                }`}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {pensando ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Consultando o CRM…
          </div>
        ) : null}
        {erro ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {erro}
          </p>
        ) : null}
        <div ref={fimRef} />
      </div>

      {anexos.length > 0 || lendo ? (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-200 px-3 pt-2">
          {anexos.map((a) => (
            <span key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
              <FileText className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
              <span className="max-w-[12rem] truncate">{a.nome}</span>
              <button
                type="button"
                onClick={() => setAnexos((p) => p.filter((x) => x.id !== a.id))}
                aria-label={`Remover ${a.nome}`}
                className="rounded text-slate-400 hover:text-slate-700"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          {lendo ? (
            <span className="inline-flex items-center gap-1 px-1 py-1 text-[11px] text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Lendo {lendo}…
            </span>
          ) : null}
        </div>
      ) : null}

      <form
        className={`flex items-end gap-2 p-3 ${anexos.length > 0 || lendo ? '' : 'border-t border-slate-200'}`}
        onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
      >
        <input
          ref={arquivoRef}
          type="file"
          accept={ACEITOS_NO_SELETOR}
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = ''; // permite reenviar o mesmo arquivo
            if (arquivo) void anexar(arquivo);
          }}
        />
        <button
          type="button"
          onClick={() => arquivoRef.current?.click()}
          disabled={pensando || Boolean(lendo)}
          title="Anexar arquivo (PDF, Word, texto, CSV ou imagem — até 4 MB)"
          aria-label="Anexar arquivo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-500 hover:border-brand/50 hover:text-brand disabled:opacity-40"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
        </button>
        <textarea
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); }
          }}
          onPaste={(e) => {
            // print colado direto na conversa vira anexo
            const colado = e.clipboardData.files?.[0];
            if (colado) { e.preventDefault(); void anexar(colado); }
          }}
          rows={1}
          placeholder="Pergunte ao Jarvis ou anexe um arquivo…"
          aria-label="Mensagem para o Jarvis"
          className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={pensando || Boolean(lendo) || (!texto.trim() && anexos.length === 0)}
          aria-label="Enviar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white hover:bg-brand-dark disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
