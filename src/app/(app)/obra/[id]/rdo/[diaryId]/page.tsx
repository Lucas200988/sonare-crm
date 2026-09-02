import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
/* eslint-disable @next/next/no-img-element */
import { ArrowLeft, Printer, ShieldCheck } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getRelatorio } from '@/server/services/diario-relatorio';
import { percentualDaAtividade, totaisDaEquipe } from '@/lib/rdo-relatorio';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import { verificationUrl } from '@/server/signature';
import { AssinarPapel, LegendaFoto, ReabrirRelatorio } from './rdo-acoes';

export const metadata: Metadata = { title: 'Relatório Diário de Obra — SONARE CRM' };

const COR_STATUS: Record<string, string> = {
  ABERTO: 'bg-amber-500',
  FINALIZADO: 'bg-sky-600',
  APROVADO: 'bg-green-600',
};

/** Visualização formal do RDO — o espelho na tela do documento impresso. */
export default async function RdoPage(props: {
  params: Promise<{ id: string; diaryId: string }>;
}) {
  const user = await requirePermissionPage('diary:read');
  const { id: projectId, diaryId } = await props.params;

  const rel = await getRelatorio(user, diaryId);
  if (!rel || rel.diario.projectId !== projectId) notFound();
  const d = rel.diario;

  const canWrite = user.permissions.has('diary:write');
  const dataBR = formatDateBR(new Date(`${d.diaryDate}T12:00:00Z`));
  const totais = totaisDaEquipe(d.workforce);
  const atividades = d.entries.filter((e) => e.kind === 'ATIVIDADE');
  const ocorrencias = d.entries.filter((e) => e.kind === 'OCORRENCIA' || e.kind === 'IMPEDIMENTO');
  const comentarios = d.entries.filter((e) => !['ATIVIDADE', 'OCORRENCIA', 'IMPEDIMENTO'].includes(e.kind));
  const clima = d.weather as Record<string, { rotulo?: string; praticavel?: boolean }> | null;
  const climaUnico = (d.weather as { rotulo?: string } | null)?.rotulo;
  const periodos = (['manha', 'tarde', 'noite'] as const)
    .map((chave, i) => {
      const p = clima?.[chave];
      return p?.rotulo ? { nome: ['Manhã', 'Tarde', 'Noite'][i], ...p } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/obra/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Obra
        </Link>
        <div className="flex items-center gap-2">
          {canWrite && d.status === 'FINALIZADO' && d.signatures.length === 0 ? (
            <ReabrirRelatorio diaryId={d.id} projectId={projectId} />
          ) : null}
          <a
            href={`/api/rdo/${d.id}/pdf`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden /> Imprimir / PDF
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold text-white ${COR_STATUS[d.status]}`}>
          {rel.rotuloStatus}
        </span>

        {/* Cabeçalho */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border border-slate-300 text-xs">
            <tbody>
              <tr>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold" colSpan={2}>
                  <span className="text-sm font-bold">Relatório Diário de Obra (RDO)</span>
                </td>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Relatório nº</td>
                <td className="border border-slate-300 px-2 py-1.5">{d.number}</td>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Data</td>
                <td className="border border-slate-300 px-2 py-1.5">{dataBR} · {rel.diaSemana}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Obra</td>
                <td className="border border-slate-300 px-2 py-1.5" colSpan={3}>{d.project.name}</td>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Prazo contratual</td>
                <td className="border border-slate-300 px-2 py-1.5">{rel.prazos.contratual ?? '—'} dias</td>
              </tr>
              <tr>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Endereço</td>
                <td className="border border-slate-300 px-2 py-1.5" colSpan={3}>{d.project.siteAddress ?? '—'}</td>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Prazo decorrido</td>
                <td className="border border-slate-300 px-2 py-1.5">{rel.prazos.decorrido ?? '—'} dias</td>
              </tr>
              <tr>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Contratante</td>
                <td className="border border-slate-300 px-2 py-1.5">
                  {d.project.client.tradeName ?? d.project.client.legalName}
                </td>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Responsável</td>
                <td className="border border-slate-300 px-2 py-1.5">{d.project.technicalLead?.name ?? '—'}</td>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">Prazo a vencer</td>
                <td className="border border-slate-300 px-2 py-1.5">{rel.prazos.aVencer ?? '—'} dias</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Clima */}
        {periodos.length > 0 || climaUnico ? (
          <Secao titulo="Clima">
            <table className="w-full text-xs">
              <tbody>
                {(periodos.length > 0
                  ? periodos.map((p) => ({ nome: p.nome, rotulo: p.rotulo!, praticavel: p.praticavel !== false }))
                  : [{ nome: 'Dia', rotulo: climaUnico!, praticavel: !d.weatherBlocked }]
                ).map((p) => (
                  <tr key={p.nome} className="border-b border-slate-100 last:border-0">
                    <td className="w-24 py-1 font-medium">{p.nome}</td>
                    <td className="py-1">{p.rotulo}</td>
                    <td className={`w-28 py-1 text-right font-medium ${p.praticavel ? 'text-green-700' : 'text-red-700'}`}>
                      {p.praticavel ? 'Praticável' : 'Impraticável'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.weatherNotes ? <p className="mt-1 text-[11px] text-slate-500">{d.weatherNotes}</p> : null}
          </Secao>
        ) : null}

        {/* Mão de obra */}
        {d.workforce.length > 0 ? (
          <Secao titulo={`Mão de obra (${totais.total})`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {d.workforce.map((w) => (
                <div key={w.id} className="rounded border border-slate-200 px-2 py-1.5 text-center">
                  <p className="text-xs font-semibold text-slate-800">{w.role}</p>
                  <p className="text-sm">{w.quantity}</p>
                  <p className="text-[10px] text-slate-400">{w.kind === 'TERCEIRO' ? 'Terceiros' : 'Própria'}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-600">
              Mão de obra própria: <strong>{totais.propria}</strong> · Terceiros: <strong>{totais.terceiros}</strong>
            </p>
          </Secao>
        ) : null}

        {/* Equipamentos */}
        {d.equipment.length > 0 ? (
          <Secao titulo={`Equipamentos (${d.equipment.reduce((a, e) => a + e.quantity, 0)})`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {d.equipment.map((e) => (
                <div key={e.id} className="rounded border border-slate-200 px-2 py-1.5 text-center">
                  <p className="text-xs font-semibold text-slate-800">
                    {e.name}{e.identification ? ` (${e.identification})` : ''}
                  </p>
                  <p className="text-sm">{e.quantity}</p>
                </div>
              ))}
            </div>
          </Secao>
        ) : null}

        {/* Atividades */}
        <Secao titulo={`Atividades (${atividades.length})`}>
          {atividades.length === 0 ? <Vazio texto="Nenhuma atividade registrada." /> : (
            <ul className="divide-y divide-slate-100">
              {atividades.map((a) => {
                const pct = percentualDaAtividade(a.payload);
                return (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-1.5 text-xs">
                    <div>
                      <p className="text-slate-800">{a.title}</p>
                      {a.description ? <p className="text-[11px] text-slate-500">{a.description}</p> : null}
                    </div>
                    {pct !== null ? (
                      <span className="shrink-0 text-[11px] font-medium text-slate-500">
                        {pct}% {pct >= 100 ? 'Concluída' : 'Em andamento'}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>

        {/* Ocorrências */}
        <Secao titulo={`Ocorrências (${ocorrencias.length})`}>
          {ocorrencias.length === 0 ? <Vazio texto="Sem ocorrências." /> : (
            <ul className="divide-y divide-slate-100">
              {ocorrencias.map((o) => (
                <li key={o.id} className="py-1.5 text-xs">
                  <p className="font-medium text-slate-800">
                    {o.kind === 'IMPEDIMENTO' ? `Impedimento: ${o.title}` : o.title}
                    {o.status === 'ABERTA' ? <span className="ml-2 text-[10px] font-semibold text-amber-700">EM ABERTO</span> : null}
                  </p>
                  {o.description ? <p className="text-[11px] text-slate-500">{o.description}</p> : null}
                  {o.responsible ? <p className="text-[11px] text-slate-400">Responsável: {o.responsible}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {/* Comentários */}
        <Secao titulo={`Comentários (${comentarios.length})`}>
          {comentarios.length === 0 ? <Vazio texto="Sem comentários." /> : (
            <ul className="divide-y divide-slate-100">
              {comentarios.map((c) => (
                <li key={c.id} className="py-1.5 text-xs">
                  <p className="text-slate-800">{c.title}</p>
                  {c.description ? <p className="text-[11px] text-slate-500">{c.description}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {/* Relato do dia */}
        {d.narrative ? (
          <Secao titulo="Relato do dia">
            <p className="whitespace-pre-line text-xs text-slate-700">{d.narrative}</p>
          </Secao>
        ) : null}

        {/* Fotos */}
        <Secao titulo={`Fotos (${d.photos.length})`}>
          {d.photos.length === 0 ? <Vazio texto="Sem fotos." /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {d.photos.map((f) => (
                <figure key={f.id}>
                  <a href={`/api/foto/${f.id}?v=view`} target="_blank" rel="noopener noreferrer">
                    <img
                      src={`/api/foto/${f.id}?v=thumb`}
                      alt={f.description ?? f.category ?? `Foto ${f.seq}`}
                      className="aspect-[4/3] w-full rounded border border-slate-200 object-cover"
                      loading="lazy"
                    />
                  </a>
                  <LegendaFoto
                    fotoId={f.id}
                    projectId={projectId}
                    inicial={f.description ?? f.category}
                    editavel={canWrite && d.status === 'ABERTO'}
                  />
                </figure>
              ))}
            </div>
          )}
        </Secao>

        {/* Vídeos e anexos */}
        {d.files.length > 0 ? (
          <Secao titulo={`Vídeos e anexos (${d.files.length})`}>
            <ul className="divide-y divide-slate-100">
              {d.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate">
                    {f.kind === 'VIDEO' ? '🎬 ' : '📎 '}{f.originalFilename}
                    {f.description ? <span className="text-slate-500"> — {f.description}</span> : null}
                  </span>
                  <a
                    href={`/api/arquivos/${f.attachmentId}`}
                    className="shrink-0 text-[11px] font-medium text-brand underline"
                  >
                    abrir
                  </a>
                </li>
              ))}
            </ul>
          </Secao>
        ) : null}

        {/* Assinaturas */}
        <Secao titulo="Assinaturas">
          {d.status === 'ABERTO' ? (
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              As assinaturas são colhidas depois que o relatório do dia for finalizado.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
            {rel.quadroAssinaturas.map((q) => (
              <div key={q.papel} className="flex flex-col justify-end">
                {q.assinatura ? (
                  <div className="mb-1">
                    <p className="text-sm font-semibold text-slate-900">{q.assinatura.name}</p>
                    {q.assinatura.registration ? (
                      <p className="text-[11px] text-slate-500">{q.assinatura.registration}</p>
                    ) : null}
                    <p className="text-[10px] text-slate-400">
                      Assinado eletronicamente em {formatDateTimeBR(q.assinatura.signedAt)}
                    </p>
                  </div>
                ) : canWrite && d.status !== 'ABERTO' ? (
                  <div className="mb-1">
                    <AssinarPapel diaryId={d.id} projectId={projectId} papel={q.papel} rotulo={q.rotulo} />
                  </div>
                ) : (
                  <p className="mb-1 text-[11px] text-slate-400">Pendente</p>
                )}
                <p className="border-t border-slate-400 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {q.rotulo}
                </p>
              </div>
            ))}
          </div>
        </Secao>

        {/* Autenticidade */}
        {d.verificationCode ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[11px] text-green-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Código de conferência <strong className="font-mono">{d.verificationCode}</strong> —
              qualquer pessoa confere a autenticidade em{' '}
              <a href={verificationUrl(d.verificationCode)} className="underline" target="_blank" rel="noopener noreferrer">
                {verificationUrl(d.verificationCode).replace(/^https?:\/\//, '')}
              </a>
              {d.documentHash ? <> · SHA-256 registrado.</> : null}
            </span>
          </div>
        ) : null}

        <p className="mt-4 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
          {rel.criadoPor ? `Criado por: ${rel.criadoPor} (${formatDateTimeBR(d.openedAt)})` : `Criado em ${formatDateTimeBR(d.openedAt)}`}
          {d.updatedAt > d.openedAt ? ` · Última modificação: ${formatDateTimeBR(d.updatedAt)}` : ''}
        </p>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-brand">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-[11px] text-slate-400">{texto}</p>;
}
