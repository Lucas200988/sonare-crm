// Biblioteca de modelos padrão de escopo, extraída dos modelos oficiais de
// proposta da SONARE (pasta "Modelo Orçamento" do drive Z:).
// Aplicáveis com um clique no editor de orçamento; também servem de fallback
// quando a geração por IA está desativada.

export type ScopeTemplate = {
  /** código do serviço no catálogo (ServiceCatalog.code) ao qual o modelo se aplica */
  serviceCode: string;
  label: string;
  scope: string;
  premises: string;
  exclusions: string;
  executionDeadline: string;
  items: Array<{ description: string; unit: string; quantity: string }>;
};

const PREMISSAS_LAUDO = [
  '- A CONTRATANTE providenciará a liberação de acesso a todas as áreas a serem inspecionadas;',
  '- A execução dos trabalhos será acompanhada por representante da CONTRATANTE;',
  '- Serão disponibilizados os documentos, projetos e laudos existentes da edificação;',
  '- O fornecimento de água potável e energia elétrica no local é de responsabilidade da CONTRATANTE;',
  '- Está prevista uma visita técnica ao local para levantamento de campo.',
].join('\n');

const EXCLUSOES_LAUDO = [
  '- Execução das correções e adequações apontadas no laudo;',
  '- Fornecimento de materiais e equipamentos de substituição;',
  '- Taxas e emolumentos cobrados por órgãos públicos ou concessionárias;',
  '- Projeto as built;',
  '- Vias impressas adicionais além da prevista.',
].join('\n');

const PREMISSAS_PROJETO = [
  '- A CONTRATANTE fornecerá o projeto arquitetônico atualizado em formato editável (.DWG);',
  '- Serão disponibilizados os dados de entrada necessários (demanda, cargas, padrão de entrada);',
  '- As definições e aprovações do cliente serão feitas nos prazos acordados em reunião;',
  '- Alterações de escopo após o aceite serão tratadas como aditivo.',
].join('\n');

const EXCLUSOES_PROJETO = [
  '- Execução da obra e fornecimento de materiais;',
  '- Taxas de aprovação em órgãos públicos e concessionárias;',
  '- Levantamento topográfico e sondagem;',
  '- Impressões e cópias plotadas;',
  '- Acompanhamento diário de obra (fiscalização é serviço à parte).',
].join('\n');

export const SCOPE_TEMPLATES: ScopeTemplate[] = [
  {
    serviceCode: 'SRV-015',
    label: 'Laudo técnico de SPDA',
    scope: [
      '- Levantamento de documentações, estudos e desenhos existentes;',
      '- Inspeção visual de todo o sistema (captação, descidas e aterramento);',
      '- Verificação da deterioração e corrosão dos captores, condutores de descida e conexões;',
      '- Verificação da condição das equipotencializações;',
      '- Verificação da corrosão dos eletrodos de aterramento;',
      '- Verificação da integridade física dos condutores do eletrodo de aterramento;',
      '- Realização de medições ôhmicas e de continuidade;',
      '- Apresentação das não conformidades conforme ABNT NBR 5419:2015;',
      '- Elaboração de laudo fotográfico da inspeção com indicações e recomendações de adequações;',
      '- Apontamento do grau e análise de risco de cada edificação;',
      '- Utilização de equipamentos com laudo de aferição válido e rastreável;',
      '- Emissão de ART do laudo.',
    ].join('\n'),
    premises: PREMISSAS_LAUDO,
    exclusions: EXCLUSOES_LAUDO,
    executionDeadline: '- 20 dias corridos após a visita técnica.',
    items: [
      { description: 'Inspeção e medições do sistema de SPDA', unit: 'vb', quantity: '1' },
      { description: 'Elaboração de laudo técnico de SPDA conforme NBR 5419', unit: 'un', quantity: '1' },
      { description: 'Emissão de ART', unit: 'un', quantity: '1' },
    ],
  },
  {
    serviceCode: 'SRV-019',
    label: 'Laudo das instalações elétricas (NR-10 / PIE)',
    scope: [
      '- Elaboração de laudo das instalações elétricas de acordo com a NR-10, para composição do PIE (Prontuário das Instalações Elétricas);',
      '- Análises segundo ABNT NBR 5410, ABNT NBR 14039 e NR-10, visando à segurança dos trabalhadores que interagem com eletricidade;',
      '- Análise de possíveis falhas de projeto e execução, indicando necessidade de correções e manutenções;',
      '- Entrevista com os responsáveis identificando áreas de manutenção constante, queima de lâmpadas e equipamentos;',
      '- Realização de medições de tensão e corrente;',
      '- Laudo de termografia dos quadros elétricos com foto real e termográfica para identificação de pontos quentes;',
      '- Elaboração de laudo fotográfico com indicações e recomendações de adequações;',
      '- Apontamento do grau e análise de risco para subsidiar as adequações;',
      '- Utilização de equipamentos com laudo de aferição válido e rastreável;',
      '- Emissão de ART do laudo.',
    ].join('\n'),
    premises: PREMISSAS_LAUDO,
    exclusions: EXCLUSOES_LAUDO,
    executionDeadline: '- 20 dias corridos após a visita técnica.',
    items: [
      { description: 'Inspeção e ensaios das instalações elétricas', unit: 'vb', quantity: '1' },
      { description: 'Termografia de quadros elétricos', unit: 'un', quantity: '1' },
      { description: 'Elaboração de laudo técnico + ART', unit: 'un', quantity: '1' },
    ],
  },
  {
    serviceCode: 'SRV-001',
    label: 'Projeto elétrico',
    scope: [
      '- Levantamento de dados de campo e análise do projeto arquitetônico;',
      '- Dimensionamento de cargas, quadros de distribuição e circuitos terminais;',
      '- Dimensionamento de condutores, eletrodutos e dispositivos de proteção conforme ABNT NBR 5410;',
      '- Elaboração de diagramas unifilares e quadros de cargas;',
      '- Definição do padrão de entrada de energia conforme normas da concessionária local;',
      '- Detalhamento de aterramento e equipotencialização;',
      '- Memorial descritivo e memória de cálculo;',
      '- Lista de materiais quantificada;',
      '- Compatibilização com as demais disciplinas do empreendimento;',
      '- Emissão de ART do projeto;',
      '- Entrega em mídia digital nos formatos .DWG e .PDF.',
    ].join('\n'),
    premises: PREMISSAS_PROJETO,
    exclusions: EXCLUSOES_PROJETO,
    executionDeadline: '- 30 dias corridos após o recebimento do projeto arquitetônico definitivo.',
    items: [
      { description: 'Projeto elétrico completo (plantas, diagramas e detalhes)', unit: 'vb', quantity: '1' },
      { description: 'Memorial descritivo e memória de cálculo', unit: 'un', quantity: '1' },
      { description: 'Emissão de ART', unit: 'un', quantity: '1' },
    ],
  },
  {
    serviceCode: 'SRV-010',
    label: 'Projeto de energia solar fotovoltaica',
    scope: [
      '- Análise da conta de energia e do histórico de consumo da unidade consumidora;',
      '- Dimensionamento do sistema fotovoltaico e definição da potência de geração;',
      '- Estudo de sombreamento e definição do arranjo dos módulos;',
      '- Dimensionamento de inversores, string box, cabeamento e proteções CC/CA;',
      '- Análise estrutural da cobertura para fixação dos módulos;',
      '- Elaboração de diagramas unifilares e plantas de instalação;',
      '- Memorial descritivo e memória de cálculo do sistema;',
      '- Elaboração e protocolo do dossiê de acesso junto à concessionária;',
      '- Acompanhamento do processo de homologação até o parecer de acesso;',
      '- Emissão de ART do projeto;',
      '- Entrega em mídia digital nos formatos .DWG e .PDF.',
    ].join('\n'),
    premises: [
      PREMISSAS_PROJETO,
      '- A CONTRATANTE fornecerá cópia da conta de energia e dados do titular da unidade consumidora.',
    ].join('\n'),
    exclusions: [
      EXCLUSOES_PROJETO,
      '- Fornecimento e instalação dos módulos, inversores e estruturas;',
      '- Adequação do padrão de entrada exigida pela concessionária.',
    ].join('\n'),
    executionDeadline: '- 20 dias corridos para o projeto; homologação sujeita ao prazo da concessionária.',
    items: [
      { description: 'Projeto de sistema fotovoltaico', unit: 'vb', quantity: '1' },
      { description: 'Dossiê de acesso e homologação junto à concessionária', unit: 'un', quantity: '1' },
      { description: 'Emissão de ART', unit: 'un', quantity: '1' },
    ],
  },
  {
    serviceCode: 'SRV-018',
    label: 'PSCIP / PPCI — projeto de prevenção contra incêndio',
    scope: [
      '- Análise da edificação e enquadramento conforme as Instruções Técnicas do Corpo de Bombeiros;',
      '- Definição das medidas de segurança contra incêndio e pânico exigidas;',
      '- Dimensionamento do sistema de proteção por extintores;',
      '- Dimensionamento do sistema de hidrantes e reserva técnica de incêndio;',
      '- Projeto de iluminação de emergência, sinalização e saídas de emergência;',
      '- Elaboração de plantas, cortes e detalhes construtivos;',
      '- Memorial descritivo conforme exigências do Corpo de Bombeiros;',
      '- Protocolo do processo e acompanhamento até a aprovação;',
      '- Emissão de ART do projeto.',
    ].join('\n'),
    premises: PREMISSAS_PROJETO,
    exclusions: [
      EXCLUSOES_PROJETO,
      '- Fornecimento e instalação de extintores, hidrantes e sinalização;',
      '- Vistoria do Corpo de Bombeiros para emissão do AVCB.',
    ].join('\n'),
    executionDeadline: '- 30 dias corridos para elaboração; aprovação sujeita ao prazo do Corpo de Bombeiros.',
    items: [
      { description: 'Projeto de prevenção e combate a incêndio (PSCIP)', unit: 'vb', quantity: '1' },
      { description: 'Protocolo e acompanhamento junto ao Corpo de Bombeiros', unit: 'un', quantity: '1' },
      { description: 'Emissão de ART', unit: 'un', quantity: '1' },
    ],
  },
  {
    serviceCode: 'SRV-012',
    label: 'Projeto de subestação',
    scope: [
      '- Levantamento de campo e análise da demanda contratada;',
      '- Dimensionamento do transformador e dos equipamentos de manobra e proteção;',
      '- Elaboração de diagrama unifilar e diagrama funcional;',
      '- Detalhamento de malha de aterramento e sistema de proteção;',
      '- Projeto civil da alvenaria e do abrigo da subestação, quando aplicável;',
      '- Estudo de seletividade e coordenação da proteção;',
      '- Memorial descritivo, memória de cálculo e lista de materiais;',
      '- Elaboração e protocolo do processo junto à concessionária;',
      '- Acompanhamento até a aprovação e liberação da energização;',
      '- Emissão de ART do projeto.',
    ].join('\n'),
    premises: PREMISSAS_PROJETO,
    exclusions: [
      EXCLUSOES_PROJETO,
      '- Fornecimento e montagem dos equipamentos da subestação;',
      '- Comissionamento e ensaios de energização.',
    ].join('\n'),
    executionDeadline: '- 30 dias corridos; aprovação sujeita ao prazo da concessionária.',
    items: [
      { description: 'Projeto de subestação (elétrico e civil)', unit: 'vb', quantity: '1' },
      { description: 'Protocolo e acompanhamento junto à concessionária', unit: 'un', quantity: '1' },
      { description: 'Emissão de ART', unit: 'un', quantity: '1' },
    ],
  },
];

export function findTemplate(serviceCode: string): ScopeTemplate | undefined {
  return SCOPE_TEMPLATES.find((t) => t.serviceCode === serviceCode);
}
