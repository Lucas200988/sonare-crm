import { describe, expect, it } from 'vitest';
import { promptDoNivel } from './scope-prompt';

/**
 * O prompt é o que determina o que sai na proposta do cliente. Estes testes
 * travam as regras que protegem a contratação — se alguém as remover editando
 * o texto, a suíte avisa.
 */
describe('promptDoNivel', () => {
  const NIVEIS = ['resumido', 'padrao', 'detalhado'] as const;

  it('usa o nível padrão quando nenhum é informado', () => {
    expect(promptDoNivel()).toBe(promptDoNivel('padrao'));
  });

  it('nunca deixa o marcador de nível cru no prompt', () => {
    for (const n of NIVEIS) expect(promptDoNivel(n), n).not.toContain('{{NIVEL}}');
    expect(promptDoNivel('inexistente' as never)).not.toContain('{{NIVEL}}');
  });

  it('mantém as regras que impedem a IA de inventar', () => {
    for (const n of NIVEIS) {
      const p = promptDoNivel(n);
      expect(p, n).toContain('Não inventar informações');
      expect(p, n).toContain('Não ampliar indevidamente o escopo');
      expect(p, n).toContain('Nunca prometa');
    }
  });

  it('mantém as travas de responsabilidade em todos os níveis', () => {
    for (const n of NIVEIS) {
      const p = promptDoNivel(n);
      // sem estas, a proposta assume obrigação que ninguém vendeu
      expect(p, n).toContain('aprovação garantida');
      expect(p, n).toContain('Não considere revisões ilimitadas');
      expect(p, n).toContain('Quando o prazo não estiver informado, não invente');
    }
  });

  it('descreve o JSON de saída com os campos que a tela consome', () => {
    const p = promptDoNivel('padrao');
    for (const campo of [
      'escopo_detalhado', 'entregaveis', 'premissas', 'responsabilidades_contratante',
      'exclusoes', 'perguntas_necessarias', 'riscos_orcamentarios', 'servicos_opcionais',
      'observacoes_internas', 'resumo_whatsapp',
    ]) {
      expect(p, campo).toContain(campo);
    }
  });

  it('limita as perguntas a cinco', () => {
    expect(promptDoNivel('padrao')).toContain('no máximo cinco perguntas');
  });

  it('a profundidade cresce com o nível', () => {
    expect(promptDoNivel('resumido')).toContain('2 a 4 etapas');
    expect(promptDoNivel('padrao')).toContain('4 a 7 etapas');
    expect(promptDoNivel('detalhado')).toContain('6 a 10 etapas');
  });

  it('só o detalhado pede o nível de memorial', () => {
    expect(promptDoNivel('detalhado')).toContain('memorial descritivo: 6 a 10 etapas');
    expect(promptDoNivel('resumido')).not.toContain('6 a 10 etapas');
  });
});
