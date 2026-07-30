import { describe, expect, it } from 'vitest';
import { promptDoNivel } from './scope-prompt';

describe('promptDoNivel', () => {
  it('usa o nível padrão quando nenhum é informado', () => {
    expect(promptDoNivel()).toBe(promptDoNivel('padrao'));
  });

  it('pede escopo curto no resumido', () => {
    const p = promptDoNivel('resumido');
    expect(p).toContain('entre 5 e 8 linhas');
    expect(p).not.toContain('emissão de ART/RRT do serviço');
  });

  it('exige as etapas mínimas de engenharia no padrão', () => {
    const p = promptDoNivel('padrao');
    expect(p).toContain('entre 12 e 18 linhas');
    for (const etapa of ['levantamento de dados de campo', 'memorial descritivo', 'compatibilização', 'ART/RRT']) {
      expect(p, etapa).toContain(etapa);
    }
  });

  it('pede nível de memorial no detalhado', () => {
    const p = promptDoNivel('detalhado');
    expect(p).toContain('entre 22 e 35 linhas');
    expect(p).toContain('memorial descritivo');
  });

  it('preserva as regras gerais em todos os níveis', () => {
    for (const nivel of ['resumido', 'padrao', 'detalhado'] as const) {
      const p = promptDoNivel(nivel);
      expect(p, nivel).toContain('Premissas: 3 a 6 linhas');
      expect(p, nivel).toContain('Exclusões: 3 a 6 linhas');
      expect(p, nivel).toContain('Responda SOMENTE com JSON válido');
      // a instrução de não inventar dados é o que protege a proposta
      expect(p, nivel).toContain('NUNCA invente valores monetários');
    }
  });

  it('exige mais linhas conforme o nível sobe', () => {
    const linhas = (p: string) => Number(/entre (\d+) e \d+ linhas/.exec(p)![1]);
    expect(linhas(promptDoNivel('resumido')))
      .toBeLessThan(linhas(promptDoNivel('padrao')));
    expect(linhas(promptDoNivel('padrao')))
      .toBeLessThan(linhas(promptDoNivel('detalhado')));
  });
});
