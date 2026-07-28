import { describe, expect, it } from 'vitest';
import { formatCNPJ, formatCPF, formatPhoneBR, isValidCNPJ, isValidCPF } from './br';

describe('CPF', () => {
  it('valida CPFs corretos', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('52998224725')).toBe(true);
  });
  it('rejeita CPFs inválidos', () => {
    expect(isValidCPF('529.982.247-26')).toBe(false);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF('123')).toBe(false);
  });
  it('formata', () => {
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
  });
});

describe('CNPJ', () => {
  it('valida CNPJs corretos', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11222333000181')).toBe(true);
  });
  it('rejeita CNPJs inválidos', () => {
    expect(isValidCNPJ('11.222.333/0001-82')).toBe(false);
    expect(isValidCNPJ('00.000.000/0000-00')).toBe(false);
    expect(isValidCNPJ('123')).toBe(false);
  });
  it('formata', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('telefone', () => {
  it('formata celular e fixo', () => {
    expect(formatPhoneBR('65999998888')).toBe('(65) 99999-8888');
    expect(formatPhoneBR('6533334444')).toBe('(65) 3333-4444');
  });
});
