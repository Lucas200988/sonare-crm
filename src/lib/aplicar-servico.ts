import { formatDecimalBR } from '@/lib/parse';
import { formatBRL } from '@/lib/money';
import { isEmptyRich, textToHtml } from '@/lib/html-text';

/**
 * O que acontece quando alguém escolhe um serviço do catálogo em um item do
 * orçamento.
 *
 * A regra vive aqui, fora do componente, porque é ela que decide o preço e se
 * o escopo padrão entra — as duas coisas que mais impactam o orçamento final.
 */

export type ServicoCatalogo = {
  id: string;
  name: string;
  unit: string | null;
  defaultPrice: string | null;
  estimatedCost: string | null;
  scopeTemplate: string | null;
  premisesTemplate: string | null;
  exclusionsTemplate: string | null;
};

export type SugestaoPrecoUI = {
  serviceCatalogId: string;
  sugerido: string;
  ultimo: string;
  menor: string;
  maior: string;
  amostras: number;
};

/** Campos de texto do orçamento que o serviço pode preencher. */
export type TextosOrcamento = {
  scope: string;
  premises: string;
  exclusions: string;
};

export type AplicacaoServico = {
  item: {
    serviceCatalogId: string;
    description: string;
    unit: string;
    unitPrice: string;
    unitCost: string;
  };
  /** Textos a gravar, ou `null` quando nada deve ser tocado. */
  textos: TextosOrcamento | null;
  /** Mensagem para o usuário entender o que foi preenchido sozinho. */
  aviso: string | null;
};

/**
 * Monta o item e decide o que preencher.
 *
 * Preço: vem do histórico praticado (mediana dos orçamentos que viraram
 * proposta) e só cai para o preço de tabela quando não há histórico — a tabela
 * envelhece, o histórico não.
 *
 * Escopo: entra apenas se o campo estiver vazio. Texto já escrito nunca é
 * sobrescrito, senão a automação apagaria o trabalho de quem estava redigindo.
 */
export function aplicarServico(
  servico: ServicoCatalogo,
  historico: SugestaoPrecoUI | undefined,
  atuais: TextosOrcamento,
): AplicacaoServico {
  const preco = historico?.sugerido ?? servico.defaultPrice;

  const item = {
    serviceCatalogId: servico.id,
    description: servico.name,
    unit: servico.unit ?? 'un',
    unitPrice: preco ? formatDecimalBR(preco) : '0',
    unitCost: servico.estimatedCost ? formatDecimalBR(servico.estimatedCost) : '0',
  };

  const avisos: string[] = [];
  if (historico) {
    avisos.push(
      `preço de ${formatBRL(historico.sugerido)} sugerido pelo histórico `
      + `(${historico.amostras} orçamento${historico.amostras > 1 ? 's' : ''})`,
    );
  }

  let textos: TextosOrcamento | null = null;
  if (servico.scopeTemplate && isEmptyRich(atuais.scope)) {
    textos = {
      scope: textToHtml(servico.scopeTemplate),
      premises: isEmptyRich(atuais.premises) && servico.premisesTemplate
        ? textToHtml(servico.premisesTemplate)
        : atuais.premises,
      exclusions: isEmptyRich(atuais.exclusions) && servico.exclusionsTemplate
        ? textToHtml(servico.exclusionsTemplate)
        : atuais.exclusions,
    };
    avisos.push('escopo padrão do serviço aplicado');
  }

  return {
    item,
    textos,
    aviso: avisos.length > 0 ? `${servico.name}: ${avisos.join('; ')}.` : null,
  };
}

/** Faixa de preço já praticada, para mostrar ao lado do campo. */
export function faixaPraticada(historico: SugestaoPrecoUI): string {
  return historico.menor === historico.maior
    ? formatBRL(historico.menor)
    : `${formatBRL(historico.menor)} a ${formatBRL(historico.maior)}`;
}
