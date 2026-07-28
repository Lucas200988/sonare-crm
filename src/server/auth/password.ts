import { hash, verify } from '@node-rs/argon2';

// Parâmetros OWASP para Argon2id
const ARGON_OPTS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
}

/** Política mínima de senha (tamanho configurável via SystemSetting no futuro). */
export function validatePasswordPolicy(plain: string): string | null {
  if (plain.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
  if (!/[a-zA-Z]/.test(plain) || !/\d/.test(plain)) return 'A senha deve conter letras e números.';
  return null;
}
