import 'server-only';

// Rate limiting simples em memória (por instância).
// Suficiente para instalação single-node; trocar por Redis em cluster.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Retorna true se a ação está permitida; false se excedeu o limite.
 * Ex.: rateLimit(`login:${email}`, 5, 15 * 60_000) — 5 tentativas por 15 min.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }
  return bucket.count <= max;
}
