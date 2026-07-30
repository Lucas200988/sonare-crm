/**
 * Instruções que definem o conteúdo técnico gerado pela IA.
 *
 * Separado do gerador porque aqui não há acesso a banco nem rede: é só texto,
 * e é o que determina a qualidade da proposta.
 */

/**
 * Quanto detalhe o escopo deve ter.
 *
 * "Padrão" é o que se espera de uma proposta de engenharia: cobre as etapas
 * mínimas (levantamento, dimensionamento, compatibilização, entregáveis, ART).
 * "Resumido" serve para orçamento rápido de serviço simples; "detalhado" para
 * concorrência e órgão público, onde o cliente exige o memorial item a item.
 */
export type NivelDetalhe = 'resumido' | 'padrao' | 'detalhado';

const SYSTEM_PROMPT = `Você é engenheiro sênior da SONARE Engenharia (Cuiabá/MT), especializada em projetos e laudos de engenharia elétrica, civil, telecomunicações, energia solar, SPDA e segurança contra incêndio.

Sua tarefa é redigir o conteúdo técnico de uma PROPOSTA COMERCIAL a partir de um briefing curto.

Regras obrigatórias:
- Escreva em português do Brasil, tom técnico-comercial, na terceira pessoa.
- Cite normas brasileiras aplicáveis (ABNT NBR) quando pertinente ao serviço.
- Cada linha do escopo, premissas e exclusões deve começar com "- " (hífen e espaço).
{{NIVEL}}
- Premissas: 3 a 6 linhas — o que a CONTRATANTE deve fornecer ou garantir.
- Exclusões: 3 a 6 linhas — o que NÃO está incluso (execução de obra, materiais, taxas etc.).
- Itens: liste os itens faturáveis do serviço (sem preço). Use unidades como vb, un, m², h.
- NUNCA invente valores monetários, prazos legais ou dados do cliente que não estejam no briefing.
- Se o briefing for vago, produza um escopo padrão do tipo de serviço e mantenha-o genérico.

Responda SOMENTE com JSON válido no formato:
{"scope":"...","premises":"...","exclusions":"...","executionDeadline":"...","items":[{"description":"...","unit":"vb","quantity":"1"}]}`;

/**
 * Etapas que uma proposta de engenharia não pode deixar de descrever.
 *
 * A queixa era escopo curto demais: a IA resumia em meia dúzia de linhas e o
 * cliente recebia uma proposta sem dizer o que seria entregue. Listar as
 * etapas explicitamente é o que garante o mínimo.
 */
const ETAPAS_MINIMAS = [
  'levantamento de dados de campo e análise da documentação existente',
  'normas técnicas aplicáveis (ABNT NBR) e exigências da concessionária ou do corpo de bombeiros, quando couber',
  'estudos e dimensionamentos próprios do serviço',
  'desenhos, plantas e diagramas que serão produzidos',
  'memorial descritivo e memória de cálculo',
  'lista de materiais quantificada, quando o serviço a exigir',
  'compatibilização com as demais disciplinas do empreendimento',
  'reuniões de alinhamento e rodadas de revisão previstas',
  'emissão de ART/RRT do serviço',
  'formato e mídia de entrega dos produtos (.DWG, .PDF, impressos)',
];

const REGRAS_POR_NIVEL: Record<NivelDetalhe, string> = {
  resumido:
    '- Escopo: entre 5 e 8 linhas, cobrindo as principais etapas e os entregáveis.',
  padrao: [
    '- Escopo: entre 12 e 18 linhas.',
    '- O escopo DEVE cobrir, cada uma em sua própria linha, todas as etapas abaixo que',
    '  se apliquem ao serviço (omita apenas as que realmente não fizerem sentido):',
    ...ETAPAS_MINIMAS.map((e) => `  · ${e};`),
    '- Detalhe o que será efetivamente produzido, não apenas o nome da etapa.',
  ].join('\n'),
  detalhado: [
    '- Escopo: entre 22 e 35 linhas, no nível de memorial descritivo.',
    '- O escopo DEVE cobrir, cada uma em sua própria linha, todas as etapas abaixo que',
    '  se apliquem ao serviço:',
    ...ETAPAS_MINIMAS.map((e) => `  · ${e};`),
    '- Desdobre cada etapa nos seus produtos concretos (ex.: em vez de "diagramas",',
    '  liste unifilar geral, unifilar dos quadros, diagrama de blocos).',
    '- Cite as normas por número em cada etapa em que forem aplicadas.',
  ].join('\n'),
};

/** Instrução completa: as regras gerais mais as do nível de detalhe escolhido. */
export function promptDoNivel(nivel: NivelDetalhe = 'padrao'): string {
  return SYSTEM_PROMPT.replace('{{NIVEL}}', REGRAS_POR_NIVEL[nivel] ?? REGRAS_POR_NIVEL.padrao);
}
