import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
/* eslint-disable @next/next/no-img-element */
import {
  AlertTriangle, ArrowLeft, Camera, ClipboardList, Download,
  FileText, MessageSquare, Paperclip, Printer, Video,
} from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { listarRelatorios, painelDaObra } from '@/server/services/diario-relatorio';
import { formatDateBR } from '@/lib/dates';
import { inputCls } from '@/components/ui';

export const metadata: Metadata = { title: 'Relatórios da obra — SONARE CRM' };

const CHIP_STATUS: Record<string, { rotulo: string; cor: string }> = {
  ABERTO: { rotulo: 'Preenchendo', cor: 'bg-amber-100 text-amber-800' },
  FINALIZADO: { rotulo: 'Finalizado', cor: 'bg-sky-100 text-sky-800' },
  APROVADO: { rotulo: 'Aprovado', cor: 'bg-green-100 text-green-800' },
};

/** Painel da obra: contadores, prazo e todos os relatórios, com download por período. */
export default async function RelatoriosDaObraPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage('diary:read');
  const { id } = await props.params;
  const sp = await props.searchParams;

  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? '') ? sp.de! : null;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? '') ? sp.ate! : null;

  const [painel, listagem] = await Promise.all([
    painelDaObra(user, id),
    listarRelatorios(user, id, { de, ate }),
  ]);
  if (!painel || !listagem) notFound();

  const { projeto, prazos, contadores, ultimasFotos } = painel;
  const pctDecorrido = prazos.contratual && prazos.decorrido
    ? Math.min(100, Math.round((prazos.decorrido / prazos.contratual) * 100))
    : null;

  // sugestão de período para o download: o mês do relatório mais recente
  const maisRecente = listagem.itens[0]?.diaryDate ?? new Date().toISOString().slice(0, 10);
  const loteDe = de ?? `${maisRecente.slice(0, 7)}-01`;
  const loteAte = ate ?? maisRecente;

  return (
    <div className="mx-auto max-w-4xl pb-10">
      <Link
        href={`/obra/${projeto.id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Obra
      </Link>

      {/* Painel */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{projeto.name}</h1>
            <p className="text-xs text-slate-500">
              {projeto.code} · {projeto.client.tradeName ?? projeto.client.legalName}
              {projeto.siteAddress ? ` · ${projeto.siteAddress}` : ''}
            </p>
          </div>
          {projeto.technicalLead?.name ? (
            <p className="text-xs text-slate-500">Responsável: <strong>{projeto.technicalLead.name}</strong></p>
          ) : null}
        </div>

        {/* Contadores */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Contador Icone={ClipboardList} rotulo="Relatórios" valor={contadores.relatorios} />
          <Contador Icone={FileText} rotulo="Atividades" valor={contadores.atividades} />
          <Contador Icone={AlertTriangle} rotulo="Ocorrências" valor={contadores.ocorrencias} />
          <Contador Icone={MessageSquare} rotulo="Comentários" valor={contadores.comentarios} />
          <Contador Icone={Camera} rotulo="Fotos" valor={contadores.fotos} />
          <Contador Icone={Video} rotulo="Vídeos" valor={contadores.videos} />
        </div>

        {/* Prazo */}
        {prazos.contratual ? (
          <div className="mt-4">
            <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
              <span>Prazo contratual: <strong className="text-slate-800">{prazos.contratual} dias</strong></span>
              <span>Decorrido: <strong className="text-slate-800">{prazos.decorrido ?? '—'} dias</strong></span>
              <span>A vencer: <strong className="text-slate-800">{prazos.aVencer ?? '—'} dias</strong></span>
            </div>
            {pctDecorrido !== null ? (
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"
                role="progressbar" aria-valuenow={pctDecorrido} aria-valuemin={0} aria-valuemax={100}
                aria-label="Prazo decorrido da obra"
              >
                <div
                  className={`h-full ${pctDecorrido >= 90 ? 'bg-red-500' : pctDecorrido >= 70 ? 'bg-amber-500' : 'bg-brand'}`}
                  style={{ width: `${pctDecorrido}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Sem datas de início e previsão de término no projeto — preencha no cartão do projeto para
            os prazos aparecerem aqui e no cabeçalho dos RDOs.
          </p>
        )}

        {/* Últimas fotos */}
        {ultimasFotos.length > 0 ? (
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {ultimasFotos.map((f) => (
              <a key={f.id} href={`/api/foto/${f.id}?v=view`} target="_blank" rel="noopener noreferrer">
                <img
                  src={`/api/foto/${f.id}?v=thumb`}
                  alt={f.description ?? f.category ?? 'Foto da obra'}
                  className="aspect-square w-full rounded border border-slate-200 object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {/* Filtro + download em lote */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            De
            <input type="date" name="de" defaultValue={de ?? ''} className={`${inputCls} mt-0.5 py-1.5`} />
          </label>
          <label className="text-xs text-slate-600">
            Até
            <input type="date" name="ate" defaultValue={ate ?? ''} className={`${inputCls} mt-0.5 py-1.5`} />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
          {de || ate ? (
            <Link href={`/obra/${projeto.id}/relatorios`} className="px-1 text-xs text-slate-500 underline">
              limpar
            </Link>
          ) : null}
        </form>

        <a
          href={`/api/rdo/lote/${projeto.id}?de=${loteDe}&ate=${loteAte}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          title={`Baixa um único PDF com os RDOs de ${formatDateBR(new Date(`${loteDe}T12:00:00Z`))} a ${formatDateBR(new Date(`${loteAte}T12:00:00Z`))} (máx. 31)`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> Baixar período (PDF)
        </a>
      </div>

      {/* Lista */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[540px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Data</th>
              <th className="px-4 py-2.5 font-medium">Nº</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Registros</th>
              <th className="px-4 py-2.5 font-medium" aria-label="Ações" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {listagem.itens.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-400">
                  Nenhum relatório {de || ate ? 'no período' : 'nesta obra'} ainda.
                </td>
              </tr>
            ) : listagem.itens.map((r) => {
              const chip = CHIP_STATUS[r.status] ?? CHIP_STATUS.ABERTO;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/obra/${projeto.id}/rdo/${r.id}`} className="font-medium text-slate-900 hover:underline">
                      {formatDateBR(new Date(`${r.diaryDate}T12:00:00Z`))}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.number}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.cor}`}>
                      {chip.rotulo}
                    </span>
                    {r.status !== 'ABERTO' && r.signatures.length > 0 ? (
                      <span className="ml-1.5 text-[10px] text-slate-400">
                        {r.signatures.length}/3 assinatura(s)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" aria-hidden /> {r._count.entries}</span>
                    <span className="ml-3 inline-flex items-center gap-1"><Camera className="h-3 w-3" aria-hidden /> {r._count.photos}</span>
                    {r._count.files > 0 ? (
                      <span className="ml-3 inline-flex items-center gap-1"><Paperclip className="h-3 w-3" aria-hidden /> {r._count.files}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <a
                      href={`/api/rdo/${r.id}/pdf`}
                      target="_blank" rel="noopener noreferrer"
                      title="Imprimir / PDF"
                      className="inline-flex rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand"
                    >
                      <Printer className="h-4 w-4" aria-hidden />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Contador({ Icone, rotulo, valor }: {
  Icone: typeof Camera; rotulo: string; valor: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-2 py-2 text-center">
      <p className="text-lg font-bold leading-tight text-brand">{valor}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-[10px] text-slate-500">
        <Icone className="h-3 w-3" aria-hidden /> {rotulo}
      </p>
    </div>
  );
}
