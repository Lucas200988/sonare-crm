import { describe, expect, it } from 'vitest';
import { approvalTriggers, computeBudgetTotals, itemTotal } from './budget-calc';

describe('itemTotal', () => {
  it('calcula qtd × preço − desconto', () => {
    expect(itemTotal({ quantity: '2', unitPrice: '1500.50' }).toString()).toBe('3001');
    expect(itemTotal({ quantity: '1', unitPrice: '100', discount: '10' }).toString()).toBe('90');
    expect(itemTotal({ quantity: '2.5', unitPrice: '99.90' }).toString()).toBe('249.75');
  });
});

describe('computeBudgetTotals', () => {
  const items = [
    { quantity: '1', unitPrice: '10000', unitCost: '4000' },
    { quantity: '10', unitPrice: '350', unitCost: '120' },
  ];
  // subtotal = 10000 + 3500 = 13500; custo = 4000 + 1200 = 5200

  it('soma subtotal, aplica desconto/acréscimo e calcula margem', () => {
    const t = computeBudgetTotals({ items, discount: '500', surcharge: '0', taxes: '810' });
    expect(t.subtotal.toString()).toBe('13500');
    expect(t.total.toString()).toBe('13000');
    expect(t.netEstimated.toString()).toBe('12190');
    expect(t.totalCost.toString()).toBe('5200');
    expect(t.grossMargin.toString()).toBe('7800');
    expect(t.marginPercent.toString()).toBe('60');
    expect(t.discountPercent.toFixed(2)).toBe('3.70');
  });

  it('não divide por zero com orçamento vazio', () => {
    const t = computeBudgetTotals({ items: [] });
    expect(t.total.toString()).toBe('0');
    expect(t.marginPercent.toString()).toBe('0');
    expect(t.discountPercent.toString()).toBe('0');
  });
});

describe('approvalTriggers', () => {
  const rules = { maxDiscountPercent: '10', minMarginPercent: '20', maxValueWithoutApproval: '100000' };

  it('não dispara para orçamento saudável', () => {
    const t = computeBudgetTotals({
      items: [{ quantity: '1', unitPrice: '50000', unitCost: '20000' }],
      discount: '1000',
    });
    expect(approvalTriggers(t, rules)).toEqual([]);
  });

  it('dispara por desconto acima do máximo', () => {
    const t = computeBudgetTotals({
      items: [{ quantity: '1', unitPrice: '10000' }],
      discount: '1500', // 15%
    });
    expect(approvalTriggers(t, rules)).toContain('desconto_acima_maximo');
  });

  it('dispara por margem abaixo da mínima (apenas com custo informado)', () => {
    const comCusto = computeBudgetTotals({
      items: [{ quantity: '1', unitPrice: '10000', unitCost: '9000' }], // margem 10%
    });
    expect(approvalTriggers(comCusto, rules)).toContain('margem_abaixo_minima');

    const semCusto = computeBudgetTotals({ items: [{ quantity: '1', unitPrice: '10000' }] });
    expect(approvalTriggers(semCusto, rules)).not.toContain('margem_abaixo_minima');
  });

  it('dispara por valor acima do limite', () => {
    const t = computeBudgetTotals({ items: [{ quantity: '1', unitPrice: '150000', unitCost: '50000' }] });
    expect(approvalTriggers(t, rules)).toContain('valor_acima_limite');
  });
});
