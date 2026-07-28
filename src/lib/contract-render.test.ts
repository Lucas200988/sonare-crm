import { describe, expect, it } from 'vitest';
import {
  applyVariables, findMissingVariables, renderClauses, toRoman, ordinalFeminino,
  buildContractingPartyText, buildContractedPartyText,
} from './contract-render';

describe('numeração', () => {
  it('converte para romanos', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(8)).toBe('VIII');
    expect(toRoman(9)).toBe('IX');
  });

  it('usa ordinais femininos por extenso', () => {
    expect(ordinalFeminino(1)).toBe('PRIMEIRA');
    expect(ordinalFeminino(11)).toBe('DÉCIMA PRIMEIRA');
    expect(ordinalFeminino(99)).toBe('99ª');
  });
});

describe('variáveis', () => {
  const values = { contrato: { objeto: 'Projeto elétrico', valorTotal: 'R$ 10.000,00' }, cliente: { razaoSocial: 'ACME' } };

  it('substitui caminhos aninhados', () => {
    expect(applyVariables('Objeto: {{contrato.objeto}}', values)).toBe('Objeto: Projeto elétrico');
    expect(applyVariables('{{cliente.razaoSocial}} paga {{contrato.valorTotal}}', values))
      .toBe('ACME paga R$ 10.000,00');
  });

  it('marca visivelmente as variáveis sem valor', () => {
    expect(applyVariables('Prazo: {{contrato.prazo}}', values)).toBe('Prazo: [contrato.prazo]');
  });

  it('tolera espaços dentro das chaves', () => {
    expect(applyVariables('{{ contrato.objeto }}', values)).toBe('Projeto elétrico');
  });

  it('lista as variáveis pendentes', () => {
    const clauses = [
      { title: 'DO OBJETO', paragraphs: ['{{contrato.objeto}} pelo prazo de {{contrato.prazo}}'], items: ['{{contrato.foro}}'] },
    ];
    const missing = findMissingVariables(clauses, values);
    expect(missing).toContain('contrato.prazo');
    expect(missing).toContain('contrato.foro');
    expect(missing).not.toContain('contrato.objeto');
  });
});

describe('renderClauses', () => {
  const clauses = [
    { title: 'DO OBJETO', paragraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.'] },
    { title: 'DAS OBRIGAÇÕES', paragraphs: ['São obrigações:'], items: ['Entregar;', 'Pagar.'] },
  ];

  it('numera cláusulas e parágrafos', () => {
    const out = renderClauses(clauses, {});
    expect(out[0].heading).toBe('CLÁUSULA PRIMEIRA — DO OBJETO');
    expect(out[0].paragraphs.map((p) => p.number)).toEqual(['1.1', '1.2']);
    expect(out[1].heading).toBe('CLÁUSULA SEGUNDA — DAS OBRIGAÇÕES');
    expect(out[1].paragraphs[0].number).toBe('2.1');
    expect(out[1].items.map((i) => i.number)).toEqual(['I', 'II']);
  });

  it('descarta parágrafos vazios sem furar a numeração', () => {
    const out = renderClauses([{ title: 'X', paragraphs: ['A', '   ', 'B'] }], {});
    expect(out[0].paragraphs.map((p) => p.number)).toEqual(['1.1', '1.2']);
    expect(out[0].paragraphs.map((p) => p.text)).toEqual(['A', 'B']);
  });
});

describe('qualificação das partes', () => {
  it('qualifica pessoa jurídica com representante', () => {
    const text = buildContractingPartyText({
      legalName: 'Condomínio Aurora', personType: 'JURIDICA',
      document: '11.222.333/0001-81', address: 'Rua A, 1 — Cuiabá/MT',
      representativeName: 'Márcia Souza', representativeRole: 'síndica', representativeCpf: '529.982.247-25',
    });
    expect(text).toContain('CONDOMÍNIO AURORA');
    expect(text).toContain('CNPJ sob o nº 11.222.333/0001-81');
    expect(text).toContain('Márcia Souza');
    expect(text).toContain('CONTRATANTE');
  });

  it('qualifica pessoa física', () => {
    const text = buildContractingPartyText({
      legalName: 'João Pereira', personType: 'FISICA', document: '529.982.247-25',
    });
    expect(text).toContain('pessoa física');
    expect(text).toContain('CPF sob o nº 529.982.247-25');
  });

  it('sinaliza dados faltantes em vez de omiti-los', () => {
    const text = buildContractingPartyText({ legalName: 'Cliente X', personType: 'JURIDICA' });
    expect(text).toContain('[informar]');
    expect(text).toContain('[informar endereço]');
  });

  it('qualifica a contratada com múltiplos sócios', () => {
    const text = buildContractedPartyText({
      legalName: 'Sonare Ltda', cnpj: '15.356.635/0001-01', address: 'Av. General Valle, 321',
      representatives: [
        { name: 'Lucas Silva Costa', nationality: 'brasileiro', profession: 'engenheiro eletricista', cpf: '022.021.671-10' },
        { name: 'Thiago Mengatti', nationality: 'brasileiro', profession: 'engenheiro eletricista', cpf: '733.152.571-91' },
      ],
    });
    expect(text).toContain('sócios-administradores');
    expect(text).toContain('LUCAS SILVA COSTA');
    expect(text).toContain('THIAGO MENGATTI');
    expect(text).toContain('CONTRATADA');
  });

  it('avisa quando não há sócios cadastrados', () => {
    const text = buildContractedPartyText({ legalName: 'Sonare Ltda', cnpj: '15.356.635/0001-01' });
    expect(text).toContain('[informar em Configurações]');
  });
});
