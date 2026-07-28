'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, ChevronDown, Loader2, Search, UserPlus, X } from 'lucide-react';
import {
  searchClientsAction, quickCreateClientAction,
  type ClientOptionResult,
} from '@/actions/clients';
import { inputCls, Field, FormError } from '@/components/ui';
import { formatCNPJ, formatCPF } from '@/lib/br';

export type { ClientOptionResult };

/**
 * Seletor de cliente com busca no servidor e cadastro rápido embutido.
 * Publica o id selecionado num input oculto (`name`), para funcionar dentro
 * de formulários com Server Actions.
 */
export function ClientPicker({
  name, initialClients, initialSelectedId, required, onSelect,
}: {
  name: string;
  initialClients: ClientOptionResult[];
  initialSelectedId?: string;
  required?: boolean;
  onSelect?: (client: ClientOptionResult | null) => void;
}) {
  const [options, setOptions] = useState<ClientOptionResult[]>(initialClients);
  const [selected, setSelected] = useState<ClientOptionResult | null>(
    initialClients.find((c) => c.id === initialSelectedId) ?? null,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, startSearch] = useTransition();
  const [showQuickForm, setShowQuickForm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Notifica o formulário pai na montagem quando já há seleção inicial
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (!notifiedRef.current && selected) {
      notifiedRef.current = true;
      onSelect?.(selected);
    }
  }, [selected, onSelect]);

  // Busca no servidor com atraso curto para não disparar a cada tecla
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      startSearch(async () => {
        setOptions(await searchClientsAction(query));
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [query, open]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function choose(client: ClientOptionResult | null) {
    setSelected(client);
    setOpen(false);
    setQuery('');
    setShowQuickForm(false);
    onSelect?.(client);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ''} required={required} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
          selected ? 'border-slate-300 bg-white text-slate-900' : 'border-slate-300 bg-white text-slate-400'
        } hover:border-slate-400 focus:border-brand focus:ring-1 focus:ring-brand`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            <>
              {selected.legalName}
              {selected.document ? (
                <span className="ml-2 text-xs text-slate-400">
                  {selected.document.length === 14 ? formatCNPJ(selected.document) : formatCPF(selected.document)}
                </span>
              ) : null}
            </>
          ) : (
            'Selecione o cliente…'
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); choose(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); choose(null); } }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Limpar seleção"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : null}
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
        </span>
      </button>

      {open ? (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
              {searching ? (
                <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-slate-400" aria-hidden />
              ) : null}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, CNPJ/CPF, e-mail ou telefone…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-8 text-sm outline-none focus:border-brand"
                aria-label="Buscar cliente"
              />
            </div>
          </div>

          {showQuickForm ? (
            <QuickClientForm
              onCancel={() => setShowQuickForm(false)}
              onCreated={(client) => { setOptions((prev) => [client, ...prev]); choose(client); }}
              suggestedName={query}
            />
          ) : (
            <>
              <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                {options.length === 0 ? (
                  <li className="px-3 py-4 text-center text-sm text-slate-500">
                    {query.trim().length >= 2
                      ? `Nenhum cliente encontrado para “${query.trim()}”.`
                      : 'Nenhum cliente cadastrado ainda.'}
                  </li>
                ) : (
                  options.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected?.id === c.id}
                        onClick={() => choose(c)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-900">{c.legalName}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {[
                              c.tradeName,
                              c.document
                                ? (c.document.length === 14 ? formatCNPJ(c.document) : formatCPF(c.document))
                                : null,
                              c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : null,
                            ].filter(Boolean).join(' · ') || 'Sem dados complementares'}
                          </span>
                        </span>
                        {selected?.id === c.id ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <div className="border-t border-slate-100 p-2">
                <button
                  type="button"
                  onClick={() => setShowQuickForm(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand/50 px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand-light"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden />
                  {query.trim() ? `Cadastrar “${query.trim()}”` : 'Cadastrar novo cliente'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cadastro rápido. Não usa <form> porque o seletor vive dentro de outro
 * formulário — HTML não permite aninhamento e o submit seria descartado.
 * Os campos são controlados e a Server Action é chamada com um FormData montado.
 */
function QuickClientForm({
  onCreated, onCancel, suggestedName,
}: {
  onCreated: (client: ClientOptionResult) => void;
  onCancel: () => void;
  suggestedName: string;
}) {
  const [personType, setPersonType] = useState<'FISICA' | 'JURIDICA'>('JURIDICA');
  const [fields, setFields] = useState({
    legalName: suggestedName, document: '', email: '', phone: '', city: '', state: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set('personType', personType);
    fd.set('legalName', fields.legalName);
    fd.set(personType === 'JURIDICA' ? 'cnpj' : 'cpf', fields.document);
    fd.set('email', fields.email);
    fd.set('phone', fields.phone);
    fd.set('city', fields.city);
    fd.set('state', fields.state);

    startTransition(async () => {
      const result = await quickCreateClientAction({}, fd);
      if (result.error) setError(result.error);
      else if (result.created) onCreated(result.created);
    });
  }

  return (
    <div className="p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <UserPlus className="h-3.5 w-3.5 text-brand" aria-hidden /> Cadastro rápido de cliente
      </p>
      <div
        className="space-y-2.5"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!pending && fields.legalName.trim().length >= 2) submit();
          }
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo" htmlFor="q-type">
            <select
              id="q-type" value={personType}
              onChange={(e) => setPersonType(e.target.value as 'FISICA' | 'JURIDICA')}
              className={inputCls}
            >
              <option value="JURIDICA">Pessoa Jurídica</option>
              <option value="FISICA">Pessoa Física</option>
            </select>
          </Field>
          <Field label={personType === 'JURIDICA' ? 'CNPJ' : 'CPF'} htmlFor="q-doc">
            <input
              id="q-doc"
              value={fields.document}
              onChange={set('document')}
              placeholder={personType === 'JURIDICA' ? '00.000.000/0000-00' : '000.000.000-00'}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label={personType === 'JURIDICA' ? 'Razão social' : 'Nome completo'} htmlFor="q-name" required>
          <input id="q-name" value={fields.legalName} onChange={set('legalName')} required className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="E-mail" htmlFor="q-email">
            <input id="q-email" type="email" value={fields.email} onChange={set('email')} className={inputCls} />
          </Field>
          <Field label="Telefone" htmlFor="q-phone">
            <input id="q-phone" value={fields.phone} onChange={set('phone')} placeholder="(65) 99999-8888" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Cidade" htmlFor="q-city" className="col-span-2">
            <input id="q-city" value={fields.city} onChange={set('city')} className={inputCls} />
          </Field>
          <Field label="UF" htmlFor="q-state">
            <input id="q-state" value={fields.state} onChange={set('state')} maxLength={2} placeholder="MT" className={inputCls} />
          </Field>
        </div>

        <FormError message={error} />

        <div className="flex gap-2 pt-0.5">
          <button
            type="button"
            onClick={submit}
            disabled={pending || fields.legalName.trim().length < 2}
            className="flex-1 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? 'Cadastrando…' : 'Cadastrar e selecionar'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
        <p className="text-[10px] text-slate-400">
          Os demais dados podem ser completados depois na ficha do cliente.
        </p>
      </div>
    </div>
  );
}
