'use client';

import { useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { quickCreateClientAction } from '@/actions/clients';
import { inputCls, Field, FormError } from '@/components/ui';

export type ClientOption = { id: string; legalName: string; tradeName: string | null };

/**
 * Seleção de cliente com cadastro rápido embutido.
 *
 * Evita o vaivém de sair do formulário, cadastrar o cliente e voltar do zero:
 * o cliente novo é criado ali mesmo e já fica selecionado.
 */
export function ClientSelect({
  name, id, clients, required, defaultValue, canCreate = true, onSelect,
}: {
  name: string;
  id: string;
  clients: ClientOption[];
  required?: boolean;
  defaultValue?: string;
  canCreate?: boolean;
  /** Avisa a tela sobre o cliente escolhido (ou criado). */
  onSelect?: (clientId: string) => void;
}) {
  const [lista, setLista] = useState(clients);
  const [selecionado, setSelecionado] = useState<string>(defaultValue ?? '');
  const [criando, setCriando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  // campos do cadastro rápido
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'JURIDICA' | 'FISICA'>('JURIDICA');
  const [documento, setDocumento] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');

  function salvar() {
    setErro(null);
    const fd = new FormData();
    fd.set('personType', tipo);
    fd.set('legalName', nome);
    fd.set(tipo === 'JURIDICA' ? 'cnpj' : 'cpf', documento);
    fd.set('email', email);
    fd.set('phone', telefone);

    startTransition(async () => {
      const r = await quickCreateClientAction({}, fd);
      if (r.error || !r.created) { setErro(r.error ?? 'Não foi possível criar o cliente.'); return; }
      const novo = {
        id: r.created.id, legalName: r.created.legalName, tradeName: r.created.tradeName,
      };
      setLista((prev) => [...prev, novo].sort((a, b) => a.legalName.localeCompare(b.legalName)));
      setSelecionado(novo.id);
      onSelect?.(novo.id);
      setCriando(false);
      setNome(''); setDocumento(''); setEmail(''); setTelefone('');
    });
  }

  if (criando) {
    return (
      <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
        <input type="hidden" name={name} value={selecionado} />

        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">Novo cliente</p>
          <button
            type="button" onClick={() => setCriando(false)}
            aria-label="Fechar cadastro rápido"
            className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Nome / razão social" htmlFor={`${id}-nome`} required className="sm:col-span-2">
            <input
              id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Construtora Alfa Ltda" className={inputCls}
            />
          </Field>
          <Field label="Tipo" htmlFor={`${id}-tipo`}>
            <select
              id={`${id}-tipo`} value={tipo}
              onChange={(e) => setTipo(e.target.value as 'JURIDICA' | 'FISICA')}
              className={inputCls}
            >
              <option value="JURIDICA">Pessoa jurídica</option>
              <option value="FISICA">Pessoa física</option>
            </select>
          </Field>
          <Field label={tipo === 'JURIDICA' ? 'CNPJ' : 'CPF'} htmlFor={`${id}-doc`}>
            <input
              id={`${id}-doc`} value={documento} onChange={(e) => setDocumento(e.target.value)}
              placeholder={tipo === 'JURIDICA' ? '00.000.000/0000-00' : '000.000.000-00'}
              className={inputCls}
            />
          </Field>
          <Field label="E-mail" htmlFor={`${id}-email`}>
            <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Telefone" htmlFor={`${id}-fone`}>
            <input id={`${id}-fone`} value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <FormError message={erro} />
        <div className="mt-2 flex gap-2">
          {/* button comum: submit dispararia o formulário externo */}
          <button
            type="button" onClick={salvar} disabled={pending}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? 'Salvando…' : 'Salvar e usar'}
          </button>
          <button
            type="button" onClick={() => setCriando(false)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
          >
            Cancelar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Só o nome é obrigatório — o cadastro completo pode ser feito depois em Clientes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        id={id}
        name={name}
        required={required}
        value={selecionado}
        onChange={(e) => { setSelecionado(e.target.value); onSelect?.(e.target.value); }}
        className={inputCls}
      >
        <option value="" disabled>Selecione…</option>
        {lista.map((c) => (
          <option key={c.id} value={c.id}>{c.tradeName ?? c.legalName}</option>
        ))}
      </select>
      {canCreate ? (
        <button
          type="button"
          onClick={() => setCriando(true)}
          title="Cadastrar novo cliente sem sair desta tela"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Novo
        </button>
      ) : null}
    </div>
  );
}
