import { describe, expect, it } from 'vitest';
import { perfilDoBriefing } from './perfil-briefing';

describe('perfil do briefing', () => {
  it('dono/diretoria recebe gestão; o resto, operação', () => {
    expect(perfilDoBriefing(['ADMIN'])).toBe('gestao');
    expect(perfilDoBriefing(['ENGENHARIA', 'DIRETORIA'])).toBe('gestao');
    expect(perfilDoBriefing(['admin'])).toBe('gestao');
    expect(perfilDoBriefing(['ENGENHARIA'])).toBe('operacao');
    expect(perfilDoBriefing(['COMERCIAL', 'FINANCEIRO'])).toBe('operacao');
    expect(perfilDoBriefing([])).toBe('operacao');
  });
});
