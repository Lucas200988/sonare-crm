'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { conversaRecenteDoJarvisAction, perguntarAoJarvisAction } from '@/actions/agente';

type Fala = { id: string; papel: 'user' | 'jarvis'; texto: string };

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
  const [pensando, startTransition] = useTransition();
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
        setFalas(r.mensagens.map((m) => ({ id: m.id, papel: m.papel, texto: m.texto })));
      }
    });
  }

  function enviar(mensagem: string) {
    const limpa = mensagem.trim();
    if (!limpa || pensando) return;
    setErro(null);
    setTexto('');
    setFalas((p) => [...p, { id: `u-${Date.now()}`, papel: 'user', texto: limpa }]);

    startTransition(async () => {
      const r = await perguntarAoJarvisAction({ threadId, mensagem: limpa });
      if ('ok' in r && r.ok) {
        setThreadId(r.threadId);
        setFalas((p) => [...p, { id: `j-${Date.now()}`, papel: 'jarvis', texto: r.resposta }]);
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
            <p className="text-[10px] text-slate-400">SONARE AI Manager · analisa, não executa</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setThreadId(null); setFalas([]); setErro(null); }}
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
              {f.texto}
            </div>
          </div>
        ))}

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

      <form
        className="flex items-end gap-2 border-t border-slate-200 p-3"
        onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
      >
        <textarea
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); }
          }}
          rows={1}
          placeholder="Pergunte ao Jarvis…"
          aria-label="Mensagem para o Jarvis"
          className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={pensando || !texto.trim()}
          aria-label="Enviar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white hover:bg-brand-dark disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
