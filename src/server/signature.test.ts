import { describe, expect, it } from 'vitest';
import { generateVerificationCode, hashDocument, formatHashForDisplay } from './signature';

describe('assinatura eletrônica', () => {
  it('gera código no formato XXXX-XXXX sem caracteres ambíguos', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('gera códigos distintos', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateVerificationCode()));
    expect(codes.size).toBe(200);
  });

  it('calcula hash SHA-256 estável e sensível a alterações', () => {
    const a = hashDocument(Buffer.from('documento'));
    const b = hashDocument(Buffer.from('documento'));
    const c = hashDocument(Buffer.from('documento alterado'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });

  it('formata o hash em blocos legíveis', () => {
    const hash = hashDocument(Buffer.from('x'));
    const shown = formatHashForDisplay(hash);
    expect(shown).toMatch(/^[0-9A-F]{8}( [0-9A-F]{8}){3}$/);
  });
});
