// Motor de cálculo de orçamentos — funções puras, sempre Decimal (§22.3).
import { Decimal, dec, toMoney } from '@/lib/money';

export type BudgetItemInput = {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
  unitCost?: Decimal.Value | null;
  discount?: Decimal.Value | null; // desconto em R$ no item
};

export type BudgetTotalsInput = {
  items: BudgetItemInput[];
  discount?: Decimal.Value | null; // desconto global em R$
  surcharge?: Decimal.Value | null; // acréscimo global em R$
  taxes?: Decimal.Value | null; // impostos estimados em R$
  estimatedRetentions?: Decimal.Value | null; // retenções estimadas em R$
};

export type BudgetTotals = {
  itemTotals: Decimal[]; // total de cada item (qtd × preço − desconto do item)
  subtotal: Decimal;
  discount: Decimal;
  surcharge: Decimal;
  taxes: Decimal;
  estimatedRetentions: Decimal;
  total: Decimal; // subtotal − desconto + acréscimo
  netEstimated: Decimal; // total − impostos − retenções (líquido estimado)
  totalCost: Decimal; // soma de qtd × custo
  grossMargin: Decimal; // total − custo
  marginPercent: Decimal; // margem sobre o total (0 se total = 0)
  discountPercent: Decimal; // desconto global sobre o subtotal (0 se subtotal = 0)
};

export function itemTotal(item: BudgetItemInput): Decimal {
  const gross = dec(item.quantity).mul(dec(item.unitPrice));
  return toMoney(gross.minus(dec(item.discount)));
}

export function computeBudgetTotals(input: BudgetTotalsInput): BudgetTotals {
  const itemTotals = input.items.map(itemTotal);
  const subtotal = toMoney(itemTotals.reduce((acc, t) => acc.plus(t), dec(0)));
  const discount = toMoney(dec(input.discount));
  const surcharge = toMoney(dec(input.surcharge));
  const taxes = toMoney(dec(input.taxes));
  const estimatedRetentions = toMoney(dec(input.estimatedRetentions));

  const total = toMoney(subtotal.minus(discount).plus(surcharge));
  const netEstimated = toMoney(total.minus(taxes).minus(estimatedRetentions));

  const totalCost = toMoney(
    input.items.reduce((acc, i) => acc.plus(dec(i.quantity).mul(dec(i.unitCost))), dec(0)),
  );
  const grossMargin = toMoney(total.minus(totalCost));
  const marginPercent = total.isZero()
    ? dec(0)
    : grossMargin.div(total).mul(100).toDecimalPlaces(4);
  const discountPercent = subtotal.isZero()
    ? dec(0)
    : discount.div(subtotal).mul(100).toDecimalPlaces(4);

  return {
    itemTotals, subtotal, discount, surcharge, taxes, estimatedRetentions,
    total, netEstimated, totalCost, grossMargin, marginPercent, discountPercent,
  };
}

export type ApprovalRules = {
  maxDiscountPercent: Decimal.Value; // desconto acima disso exige aprovação
  minMarginPercent: Decimal.Value; // margem abaixo disso exige aprovação
  maxValueWithoutApproval: Decimal.Value; // valor acima disso exige aprovação
};

/** Retorna as regras violadas que exigem aprovação interna (§5.5). */
export function approvalTriggers(totals: BudgetTotals, rules: ApprovalRules): string[] {
  const triggers: string[] = [];
  if (totals.discountPercent.greaterThan(dec(rules.maxDiscountPercent))) {
    triggers.push('desconto_acima_maximo');
  }
  // margem só é avaliada quando há custo informado
  if (totals.totalCost.greaterThan(0) && totals.marginPercent.lessThan(dec(rules.minMarginPercent))) {
    triggers.push('margem_abaixo_minima');
  }
  if (totals.total.greaterThan(dec(rules.maxValueWithoutApproval))) {
    triggers.push('valor_acima_limite');
  }
  return triggers;
}
