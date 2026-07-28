import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Assinatura eletrônica de documentos (MP 2.200-2, art. 10, §2º).
 *
 * O documento sai com nome e registro do responsável técnico, data/hora,
 * um código público de conferência e o hash SHA-256 do arquivo emitido.
 * Qualquer pessoa confere a autenticidade em /verificar/<código> sem login.
 *
 * Isto NÃO é assinatura ICP-Brasil (PAdES) — para o selo verde do Adobe Reader
 * é preciso um certificado A1/A3 da empresa. A estrutura aqui já guarda tudo
 * que essa evolução exigiria (hash, autor, momento da emissão).
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1 para evitar leitura ambígua

/** Código curto de conferência, legível em papel: ex. "K7M2-P9XQ". */
export function generateVerificationCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function hashDocument(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Endereço público do sistema, usado nos QR codes de conferência.
 *
 * Ordem: APP_URL (definida por você) → URL atribuída pela plataforma de
 * hospedagem → localhost. Sem isso, um documento emitido em produção sairia
 * com QR apontando para o computador de quem gerou.
 */
export function appUrl(): string {
  const candidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    // Vercel expõe o domínio em runtime
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ].filter(Boolean) as string[];

  const base = candidates[0] ?? 'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

/** URL pública de conferência do documento. */
export function verificationUrl(code: string): string {
  return `${appUrl()}/verificar/${code}`;
}

/** Exibe o hash em blocos, para leitura e conferência manual. */
export function formatHashForDisplay(hash: string): string {
  return hash.slice(0, 32).toUpperCase().match(/.{1,8}/g)?.join(' ') ?? hash;
}
