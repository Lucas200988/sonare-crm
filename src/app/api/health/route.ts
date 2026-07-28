import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { storageInfo, checkStorageAccess } from '@/server/storage';
import { appUrl } from '@/server/signature';

/**
 * Diagnóstico do ambiente. Útil após publicar para confirmar que banco,
 * storage e endereço público estão corretos — sem expor dados sensíveis.
 */
export async function GET() {
  const checks: Record<string, unknown> = {};
  let healthy = true;

  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Date.now() - t0 };
  } catch {
    checks.database = { status: 'unavailable' };
    healthy = false;
  }

  const storage = storageInfo();
  const acesso = await checkStorageAccess();
  checks.storage = acesso.ok
    ? { ...storage, bucket: acesso.bucket, gravacao: 'ok' }
    : { ...storage, gravacao: 'falhou', erro: acesso.erro };
  if (!storage.configured || !acesso.ok) healthy = false;

  const url = appUrl();
  checks.appUrl = url;
  // Em produção, endereço local significa QR code de verificação quebrado
  if (process.env.NODE_ENV === 'production' && url.includes('localhost')) {
    checks.appUrlWarning = 'APP_URL não configurada: os QR codes apontarão para localhost.';
    healthy = false;
  }
  if (process.env.NODE_ENV === 'production' && storage.driver === 'local') {
    checks.storageWarning = 'Storage local em produção: os arquivos se perdem a cada atualização.';
    healthy = false;
  }

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', ...checks },
    { status: healthy ? 200 : 503 },
  );
}
