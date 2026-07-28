import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Criptografia simétrica para segredos guardados no banco (ex.: chave da API de IA).
// AES-256-GCM com chave derivada do APP_SECRET.

function key(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error('APP_SECRET não configurado — necessário para guardar segredos.');
  return createHash('sha256').update(secret).digest();
}

/** Retorna "iv:tag:ciphertext" em base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** Devolve null se o valor estiver corrompido ou o APP_SECRET tiver mudado. */
export function decryptSecret(stored: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = stored.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Máscara para exibição: sk-proj-abc…WXYZ */
export function maskSecret(plain: string): string {
  if (plain.length <= 12) return '••••';
  return `${plain.slice(0, 7)}…${plain.slice(-4)}`;
}
