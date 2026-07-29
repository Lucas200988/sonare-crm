import { describe, expect, it } from 'vitest';
import { aplicarServico, faixaPraticada, type ServicoCatalogo, type SugestaoPrecoUI } from './aplicar-servico';

const SPDA: ServicoCatalogo = {
  id: 'svc-spda',
  name: 'Projeto de SPDA',
  unit: 'un',
  defaultPrice: '3000.00',
  estimatedCost: '900.00',
  scopeTemplate: 'Elaboração do projeto de SPDA conforme ABNT NBR 5419.',
  premisesTemplate: 'Cliente fornece a planta arquitetônica.',
  exclusionsTemplate: 'Não inclui execução da instalação.',
};

const HISTORICO: SugestaoPrecoUI = {
  serviceCatalogId: 'svc-spda',
  sugerido: '4500.00',
  ultimo: '4800.00',
  menor: '4000.00',
  maior: '7200.00',
  amostras: 5,
};

const VAZIOS = { scope: '', premises: '', exclusions: '' };

/** O Intl separa "R$" do número com espaço não separável; aqui isso não importa. */
const semNbsp = (texto: string) => texto.replace(/ /g, ' ');

describe('aplicarServico — preço', () => {
  it('usa o preço de tabela quando não há histórico', () => {
    const { item, aviso } = aplicarServico(SPDA, undefined, VAZIOS);
    expect(item.unitPrice).toBe('3.000,00');
    expect(aviso).not.toContain('histórico');
  });

  it('prefere o histórico ao preço de tabela', () => {
    const { item } = aplicarServico(SPDA, HISTORICO, VAZIOS);
    expect(item.unitPrice).toBe('4.500,00');
  });

  it('explica de quantos orçamentos veio a sugestão', () => {
    const { aviso } = aplicarServico(SPDA, HISTORICO, VAZIOS);
    expect(aviso).toContain('5 orçamentos');
  });

  it('usa o singular com uma única amostra', () => {
    const { aviso } = aplicarServico(SPDA, { ...HISTORICO, amostras: 1 }, VAZIOS);
    expect(aviso).toContain('1 orçamento');
    expect(aviso).not.toContain('1 orçamentos');
  });

  it('zera o preço quando não há tabela nem histórico', () => {
    const { item } = aplicarServico({ ...SPDA, defaultPrice: null }, undefined, VAZIOS);
    expect(item.unitPrice).toBe('0');
  });

  it('preenche descrição, unidade e custo a partir do serviço', () => {
    const { item } = aplicarServico(SPDA, undefined, VAZIOS);
    expect(item).toMatchObject({
      serviceCatalogId: 'svc-spda',
      description: 'Projeto de SPDA',
      unit: 'un',
      unitCost: '900,00',
    });
  });

  it('assume unidade "un" quando o serviço não define uma', () => {
    const { item } = aplicarServico({ ...SPDA, unit: null }, undefined, VAZIOS);
    expect(item.unit).toBe('un');
  });
});

describe('aplicarServico — escopo', () => {
  it('preenche escopo, premissas e exclusões quando tudo está em branco', () => {
    const { textos, aviso } = aplicarServico(SPDA, undefined, VAZIOS);
    expect(textos?.scope).toContain('ABNT NBR 5419');
    expect(textos?.premises).toContain('planta arquitetônica');
    expect(textos?.exclusions).toContain('execução da instalação');
    expect(aviso).toContain('escopo padrão');
  });

  it('não sobrescreve escopo já escrito', () => {
    const atuais = { ...VAZIOS, scope: '<p>Escopo redigido pelo engenheiro.</p>' };
    const { textos, aviso } = aplicarServico(SPDA, undefined, atuais);
    expect(textos).toBeNull();
    expect(aviso).toBeNull();
  });

  it('preserva premissas escritas mesmo preenchendo o escopo', () => {
    const atuais = { ...VAZIOS, premises: '<p>Premissa combinada em reunião.</p>' };
    const { textos } = aplicarServico(SPDA, undefined, atuais);
    expect(textos?.scope).toContain('ABNT NBR 5419');
    expect(textos?.premises).toBe('<p>Premissa combinada em reunião.</p>');
  });

  it('trata HTML vazio do editor como campo em branco', () => {
    const { textos } = aplicarServico(SPDA, undefined, { ...VAZIOS, scope: '<p></p>' });
    expect(textos?.scope).toContain('ABNT NBR 5419');
  });

  it('não mexe nos textos quando o serviço não tem modelo', () => {
    const { textos, aviso } = aplicarServico({ ...SPDA, scopeTemplate: null }, HISTORICO, VAZIOS);
    expect(textos).toBeNull();
    expect(aviso).toContain('histórico');
  });
});

describe('faixaPraticada', () => {
  it('mostra o intervalo quando os preços variam', () => {
    expect(semNbsp(faixaPraticada(HISTORICO))).toBe('R$ 4.000,00 a R$ 7.200,00');
  });

  it('mostra um valor só quando todos foram iguais', () => {
    expect(semNbsp(faixaPraticada({ ...HISTORICO, menor: '4500.00', maior: '4500.00' })))
      .toBe('R$ 4.500,00');
  });
});
