import { describe, expect, it } from 'vitest';
import { splitForReview } from './split-review';

describe('splitForReview', () => {
  it('não divide texto curto', () => {
    expect(splitForReview('Texto curto', 100)).toEqual(['Texto curto']);
  });

  it('divide em parágrafos sem estourar o limite', () => {
    const p = 'a'.repeat(60);
    const blocos = splitForReview([p, p, p].join('\n\n'), 100);
    expect(blocos.length).toBeGreaterThan(1);
    for (const b of blocos) expect(b.length).toBeLessThanOrEqual(100);
  });

  it('quebra por linhas quando o parágrafo sozinho é grande', () => {
    const linhas = Array.from({ length: 10 }, (_, i) => `- linha ${i} com algum conteúdo`);
    const blocos = splitForReview(linhas.join('\n'), 80);
    for (const b of blocos) expect(b.length).toBeLessThanOrEqual(80);
  });

  it('preserva todo o conteúdo ao remontar', () => {
    const original = Array.from({ length: 40 }, (_, i) => `- item ${i}`).join('\n');
    const blocos = splitForReview(original, 60);
    const remontado = blocos.join('\n').split('\n').filter(Boolean);
    expect(remontado).toHaveLength(40);
  });
});
