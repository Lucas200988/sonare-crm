import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { conferirParaFechar, getDiarioDeHoje } from '@/server/services/diario';
import { listarFotos } from '@/server/services/diario-fotos';
import { listarArquivos } from '@/server/services/diario-arquivos';
import { codigoFoto, textoDoLocal, type ClasseLocal } from '@/lib/diario-regras';
import { ObraHome, type DiarioDaTela } from './obra-home';

export const metadata: Metadata = { title: 'Diário de Obras — SONARE CRM' };

export default async function ObraPage(props: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage('diary:read');
  const { id } = await props.params;

  const projeto = await prisma.project.findFirst({
    where: {
      id, companyId: user.companyId, deletedAt: null, diaryEnabled: true,
      ...escopoDeProjetos(user),
    },
    select: {
      id: true, code: true, name: true, siteAddress: true,
      client: { select: { legalName: true, tradeName: true } },
    },
  });
  if (!projeto) notFound();

  const diario = await getDiarioDeHoje(user, id);
  const [fotos, arquivos] = diario
    ? await Promise.all([listarFotos(user, diario.id), listarArquivos(user, diario.id)])
    : [[], []];
  const conferencia = diario && diario.status === 'ABERTO'
    ? await conferirParaFechar(user, diario.id)
    : null;

  const canWrite = user.permissions.has('diary:write');

  const diarioDaTela: DiarioDaTela | null = diario ? {
    id: diario.id,
    code: diario.code,
    status: diario.status,
    abertura: diario.openedAt.toISOString(),
    localTexto: textoDoLocal(
      (diario.geofence ?? 'INDISPONIVEL') as ClasseLocal,
      diario.geofenceDistM,
    ),
    geofence: diario.geofence,
    clima: (diario.weather as DiarioDaTela['clima']) ?? null,
    narrativa: diario.narrative,
    entries: diario.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      description: e.description,
      responsible: e.responsible,
      status: e.status,
      happenedAt: e.happenedAt.toISOString(),
      payload: (e.payload as Record<string, string>) ?? null,
    })),
    workforce: diario.workforce.map((w) => ({
      id: w.id, role: w.role, kind: w.kind, company: w.company, quantity: w.quantity,
    })),
    equipment: diario.equipment.map((e) => ({
      id: e.id, name: e.name, identification: e.identification, quantity: e.quantity,
    })),
    // sugestões de atividade vêm do que o projeto já tem planejado
    sugestoesAtividade: [
      ...diario.project.tasks.map((t) => t.title),
      ...diario.project.stages.map((s) => s.name),
    ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 30),
    arquivos: arquivos.map((a) => ({
      id: a.id,
      kind: a.kind,
      seq: a.seq,
      description: a.description,
      attachmentId: a.attachmentId,
      originalFilename: a.originalFilename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
    fotos: fotos.map((f) => ({
      id: f.id,
      seq: f.seq,
      codigo: codigoFoto(diario.code, f.seq),
      category: f.category,
      description: f.description,
      captureSource: f.captureSource,
      hora: new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Cuiaba',
      }).format(f.receivedAt),
    })),
    conferencia: conferencia
      ? { pendencias: conferencia.pendencias, narrativa: conferencia.narrativa }
      : null,
  } : null;

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/obra"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Obras
      </Link>

      <ObraHome
        projeto={{
          id: projeto.id,
          code: projeto.code,
          name: projeto.name,
          cliente: projeto.client.tradeName ?? projeto.client.legalName,
          endereco: projeto.siteAddress,
        }}
        diario={diarioDaTela}
        canWrite={canWrite}
      />
    </div>
  );
}
