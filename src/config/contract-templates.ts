// Modelos de contrato transcritos dos documentos oficiais da SONARE
// (pasta "Modelo de Contratos" do drive Z:).
//
// A numeração das cláusulas é gerada automaticamente na renderização:
// cada seção vira "CLÁUSULA PRIMEIRA — DO OBJETO" e cada parágrafo vira 1.1, 1.2…
// Variáveis são escritas como {{caminho}} e resolvidas com os dados do contrato.

export type TemplateClause = {
  title: string;
  paragraphs: string[];
  /** Itens em lista romana (I, II, III…) exibidos após os parágrafos. */
  items?: string[];
};

export type ContractTemplateSeed = {
  name: string;
  kind: 'PROJETO' | 'LAUDO' | 'EMPREITADA';
  documentTitle: string;
  preamble: string;
  clauses: TemplateClause[];
};

// --- Blocos reaproveitados entre os modelos ---------------------------------

const PREAMBULO =
  'As partes contraentes têm entre si, justo e contratado, o presente instrumento, nas condições e termos descritos adiante, que reciprocamente aceitam e outorgam.';

const CLAUSULA_RESCISAO: TemplateClause = {
  title: 'DA RESCISÃO',
  paragraphs: [
    'O contrato pode ser denunciado, por quaisquer das partes, a qualquer tempo, desde que o faça com antecedência mínima de 15 (quinze) dias.',
    'A rescisão, com ou sem justa causa, não retira da CONTRATADA, em nenhuma hipótese, o direito ao recebimento pelos serviços já prestados e/ou concluídos, mas nos casos de rescisão por justa causa a sujeita ao pagamento de perdas e danos.',
  ],
};

const CLAUSULA_PENALIDADES: TemplateClause = {
  title: 'DAS PENALIDADES',
  paragraphs: [
    'Quaisquer das partes contratantes que violar este contrato ou quaisquer das obrigações assumidas será penalizada com multa de caráter penal de 10% (dez por cento) sobre o valor total do contrato, devida sempre por inteiro, à vista e imediatamente após o cometimento da infração, devendo ser corrigida pelo índice de correção e juros de mora aplicado às parcelas do contrato.',
    'Em caso de judicialização deste contrato, as partes estabelecem a quantia de 20% (vinte por cento) sobre o valor total do contrato, a título de honorários advocatícios, devidos pela parte sucumbente aos patronos da causa.',
  ],
};

const CLAUSULA_FORO: TemplateClause = {
  title: 'DO FORO',
  paragraphs: [
    'Fica eleito o foro da Comarca de {{contrato.foro}} para dirimir as questões oriundas do presente instrumento, com renúncia a qualquer outro, por mais privilegiado que seja.',
  ],
};

const DISPOSICOES_COMUNS = [
  'A mera tolerância, pelas partes, ao descumprimento de qualquer dos termos ajustados neste contrato não poderá ser interpretada como renúncia ou desistência dos direitos e deveres aqui firmados.',
  'A morte ou a extinção de qualquer dos contratantes obriga seus herdeiros, espólio, sucessores e/ou incorporadores ao fiel cumprimento dos termos deste contrato.',
  'Eventuais alterações deste contrato deverão ser realizadas por meio de aditivo escrito, devidamente assinado pelas partes e por 02 (duas) testemunhas.',
  'Este instrumento de contrato, assinado por duas testemunhas, é aceito e reciprocamente outorgado pelas partes contratantes como título executivo extrajudicial.',
  'Os valores contidos neste contrato, tanto a título de preço e pagamento como de multa, serão corrigidos, em caso de execução, pelo Índice Geral de Preços de Mercado adicionado de 1% (IGP-M + 1), bem como acrescidos de multa de 2% e juros de mora de 1% ao mês sobre o valor do débito.',
];

const CLAUSULA_PRECO: TemplateClause = {
  title: 'DO PREÇO E PAGAMENTO',
  paragraphs: [
    'O valor total deste contrato é de {{contrato.valorTotal}} ({{contrato.valorPorExtenso}}), que deverá ser pago da seguinte maneira:',
    '{{contrato.formaPagamento}}',
    'O pagamento será feito nas datas de vencimento convencionadas na cláusula anterior, mediante {{empresa.dadosPagamento}}.',
    'A CONTRATANTE deverá encaminhar cópia do comprovante de transferência à CONTRATADA.',
    'A quitação de débitos em aberto não dá quitação aos débitos anteriores, nem purga a mora de outros débitos além do quitado.',
  ],
};

// --- Modelos ----------------------------------------------------------------

export const CONTRACT_TEMPLATES: ContractTemplateSeed[] = [
  {
    name: 'Elaboração de projeto de engenharia',
    kind: 'PROJETO',
    documentTitle: 'CONTRATO DE ELABORAÇÃO DE PROJETO DE ENGENHARIA',
    preamble: PREAMBULO,
    clauses: [
      {
        title: 'DO OBJETO',
        paragraphs: [
          'A CONTRATADA produzirá, em acordo com as normas técnicas aplicáveis e com as especificações do ANEXO I, o seguinte objeto: {{contrato.objeto}}.',
          'A CONTRATANTE, desde já, reconhece que é a dona da obra e que a CONTRATADA é sua projetista, não havendo laços ou vínculos de subordinação entre ambas, sendo garantida apenas a entrega do projeto.',
          'O projeto poderá sofrer até {{contrato.revisoesIncluidas}} revisões, em acordo com a especificação da CONTRATANTE.',
          'Após o término das revisões incluídas na cláusula anterior, será cobrada a taxa de {{contrato.valorRevisaoExcedente}} para cada nova revisão excedente.',
        ],
      },
      {
        title: 'DA EXECUÇÃO E PRAZO',
        paragraphs: [
          'O projeto seguirá as especificações fornecidas pela CONTRATANTE, com suas intenções e necessidades, nos termos do ANEXO I deste instrumento, e será executado no prazo de {{contrato.prazoExecucao}}.',
          'A CONTRATADA fornecerá, ao final, os arquivos dos projetos nos formatos {{contrato.formatosEntrega}}.',
        ],
      },
      CLAUSULA_PRECO,
      {
        title: 'DAS OBRIGAÇÕES DAS PARTES',
        paragraphs: ['São obrigações da CONTRATADA:'],
        items: [
          'Entregar, na forma e prazo ajustados, o projeto, seguindo as especificações do ANEXO I;',
          'Respeitar e se responsabilizar pelas normas técnicas, trabalhistas e de segurança aplicáveis à espécie de serviço e trabalho prestado.',
        ],
      },
      {
        title: 'DAS OBRIGAÇÕES DA CONTRATANTE',
        paragraphs: ['São obrigações da CONTRATANTE:'],
        items: [
          'Fornecer todas as informações necessárias à confecção do projeto, inclusive especificando os detalhes relevantes;',
          'Efetuar o pagamento nas datas e formas ajustadas neste contrato.',
        ],
      },
      {
        title: 'DA RESPONSABILIDADE TÉCNICA E DE AUTORIA',
        paragraphs: [
          'Reservam-se os direitos de autoria do projeto exclusivamente à CONTRATADA.',
          'As alterações do projeto ou plano original só poderão ser feitas pela CONTRATADA, de acordo com os desejos e instruções da CONTRATANTE, ressalvada em todos os casos a liberdade profissional sobre a sua realização.',
          'Caso a CONTRATADA apenas elabore o projeto, mas não o execute, estará isenta de todas as responsabilidades além daquelas exclusivamente oriundas de defeitos de projeto, ressalvados os casos em que o projeto não tenha sido executado nos exatos termos em que foi formulado.',
          'A CONTRATANTE se obriga a seguir o projeto da obra de modo estrito e sem variações, sob pena de isentar a CONTRATADA de toda e qualquer responsabilidade técnica.',
          'Caso a CONTRATANTE escolha realizar modificações no projeto, poderá solicitar à CONTRATADA que as transfira para o projeto, mediante anuência desta e do pagamento do valor previsto na cláusula de revisões excedentes.',
        ],
      },
      CLAUSULA_RESCISAO,
      CLAUSULA_PENALIDADES,
      {
        title: 'DAS DISPOSIÇÕES GERAIS',
        paragraphs: [
          ...DISPOSICOES_COMUNS,
          'O contrato se extingue automaticamente pela entrega do projeto, por resilição unilateral de qualquer das partes, com ou sem justa causa, ou pelo perecimento do bem onde a obra está lotada.',
          'Incluem-se no preço deste instrumento as taxas referentes à emissão de ARTs sobre os projetos, não compreendendo quaisquer outras taxas exigidas por terceiros, tais como taxas de aprovação de projetos e emissão de alvará ou similares, que deverão ser custeadas integralmente pela CONTRATANTE.',
        ],
      },
      CLAUSULA_FORO,
    ],
  },

  {
    name: 'Elaboração de laudo de engenharia',
    kind: 'LAUDO',
    documentTitle: 'CONTRATO DE ELABORAÇÃO DE LAUDO DE ENGENHARIA',
    preamble: PREAMBULO,
    clauses: [
      {
        title: 'DO OBJETO',
        paragraphs: [
          'A CONTRATADA produzirá, em acordo com as normas técnicas aplicáveis e com as especificações do ANEXO I, o seguinte objeto: {{contrato.objeto}}.',
          'A CONTRATANTE, desde já, reconhece que é a proprietária do local e que a CONTRATADA é sua consultora, não havendo laços ou vínculos de subordinação entre ambas, sendo garantida apenas a entrega do laudo.',
          'O laudo poderá sofrer até {{contrato.revisoesIncluidas}} revisões, em acordo com a especificação da CONTRATANTE.',
          'Após o término das revisões incluídas na cláusula anterior, será cobrada a taxa de {{contrato.valorRevisaoExcedente}} para cada nova revisão excedente.',
        ],
      },
      {
        title: 'DA EXECUÇÃO E PRAZO',
        paragraphs: [
          'O laudo seguirá as especificações fornecidas pela CONTRATANTE, com suas intenções e necessidades, nos termos do ANEXO I deste instrumento, e será executado no prazo de {{contrato.prazoExecucao}}.',
          'A CONTRATADA fornecerá, ao final, os arquivos nos formatos {{contrato.formatosEntrega}}.',
        ],
      },
      CLAUSULA_PRECO,
      {
        title: 'DAS OBRIGAÇÕES DAS PARTES',
        paragraphs: ['São obrigações da CONTRATADA:'],
        items: [
          'Entregar, na forma e prazo ajustados, o laudo, seguindo as especificações do ANEXO I;',
          'Respeitar e se responsabilizar pelas normas técnicas, trabalhistas e de segurança aplicáveis à espécie de serviço e trabalho prestado.',
        ],
      },
      {
        title: 'DAS OBRIGAÇÕES DA CONTRATANTE',
        paragraphs: ['São obrigações da CONTRATANTE:'],
        items: [
          'Fornecer todas as informações necessárias à confecção do laudo, inclusive especificando os detalhes relevantes;',
          'Efetuar o pagamento nas datas e formas ajustadas neste contrato.',
        ],
      },
      {
        title: 'DA RESPONSABILIDADE TÉCNICA E DE AUTORIA',
        paragraphs: [
          'Reservam-se os direitos de autoria do laudo exclusivamente à CONTRATADA.',
          'As alterações do laudo original só poderão ser feitas pela CONTRATADA, de acordo com os desejos e instruções da CONTRATANTE, ressalvada em todos os casos a liberdade profissional sobre a sua realização.',
          'A CONTRATADA estará isenta de responsabilidades além daquelas exclusivamente oriundas de defeitos do laudo, ressalvados os casos em que as recomendações não tenham sido executadas nos exatos termos em que foram formuladas.',
          'A CONTRATANTE se obriga a seguir as recomendações do laudo de modo estrito e sem variações, sob pena de isentar a CONTRATADA de toda e qualquer responsabilidade técnica.',
        ],
      },
      CLAUSULA_RESCISAO,
      CLAUSULA_PENALIDADES,
      {
        title: 'DAS DISPOSIÇÕES GERAIS',
        paragraphs: [
          ...DISPOSICOES_COMUNS,
          'O contrato se extingue automaticamente pela entrega do laudo, por resilição unilateral de qualquer das partes, com ou sem justa causa.',
          'Incluem-se no preço deste instrumento as taxas referentes à emissão de ARTs, não compreendendo quaisquer outras taxas exigidas por terceiros, que deverão ser custeadas integralmente pela CONTRATANTE.',
        ],
      },
      CLAUSULA_FORO,
    ],
  },

  {
    name: 'Empreitada com fornecimento de mão de obra e/ou materiais',
    kind: 'EMPREITADA',
    documentTitle: 'CONTRATO DE EMPREITADA COM FORNECIMENTO DE MÃO DE OBRA E/OU MATERIAIS',
    preamble:
      'As partes contraentes têm entre si, justo e contratado, a empreitada de obra privada, nas condições e termos descritos adiante, que reciprocamente aceitam e outorgam.',
    clauses: [
      {
        title: 'DO OBJETO',
        paragraphs: [
          'Realizar-se-á a execução de obra de engenharia, no regime de empreitada, tendo por obrigação da CONTRATADA o fornecimento de mão de obra e dos materiais necessários, cuja lista está descrita no ANEXO I que acompanha este termo.',
          'A CONTRATANTE, desde já, reconhece que é a dona da obra e que a CONTRATADA é sua empreiteira, não havendo laços ou vínculos de subordinação entre ambas, sendo garantida apenas a entrega do resultado, em conformidade com o cronograma físico-financeiro e o projeto da obra contratada.',
          'Não sendo o caso de fornecimento de materiais, a CONTRATADA se obriga a enviar relatórios de solicitação, com previsão de data limite para que os materiais estejam no canteiro de obras.',
          'Os atrasos de envio e de disponibilidade dos materiais não contemplados neste contrato que derem causa a atrasos na execução da obra serão de inteira responsabilidade da CONTRATANTE, não podendo eventuais perdas e danos ser cobradas da CONTRATADA, ainda que subsidiariamente.',
          'A realização da empreitada seguirá as seguintes especificações: {{contrato.objeto}}.',
        ],
      },
      {
        title: 'DO LOCAL DE EXECUÇÃO E PRAZO',
        paragraphs: [
          'A empreitada contratada será realizada em {{contrato.localExecucao}}, com prazo de duração previsto de {{contrato.prazoExecucao}}.',
          'O prazo de duração previsto na cláusula anterior não considera atrasos decorrentes de intempéries climáticas, interferências do Poder Público sobre a obra ou área de obra e/ou situações de caso fortuito ou força maior que afetem o ramo da construção civil como um todo na área de execução da obra.',
          'As obras serão executadas pela CONTRATADA, prestando pessoalmente os serviços, sendo-lhe facultada a contratação de ajudantes, cujo vínculo se dará exclusivamente com esta, que responderá pelo pagamento dos salários bem como por todos os encargos decorrentes da contratação.',
        ],
      },
      {
        ...CLAUSULA_PRECO,
        paragraphs: [
          ...CLAUSULA_PRECO.paragraphs,
          'Em sendo o caso de pagamento por medição, serão consideradas as medições e valores em acordo com o cronograma físico-financeiro da obra, conforme consta no ANEXO II deste contrato.',
          'A CONTRATADA notificará a CONTRATANTE sobre a parcela de medição cumprida, anexando planilhas com a apuração dos valores devidos, devendo a CONTRATANTE proceder ao pagamento no prazo de até 03 (três) dias úteis, sob pena de paralisação da obra e aplicação da multa prevista na cláusula de penalidades.',
          'O inadimplemento de parcelas ou de pagamentos baseados em medição autoriza a CONTRATADA a paralisar a obra até a regularização das pendências, sem prejuízo da aplicação das multas cabíveis.',
        ],
      },
      {
        title: 'DAS OBRIGAÇÕES DA CONTRATADA',
        paragraphs: ['São obrigações da CONTRATADA:'],
        items: [
          'Entregar, na forma e prazo ajustados, a obra descrita neste contrato;',
          'Cumprir à risca o disposto nos projetos, devendo comunicar à CONTRATANTE sobre a necessidade de eventuais mudanças e adequações;',
          'Respeitar e se responsabilizar pelas normas técnicas, trabalhistas e de segurança aplicáveis à espécie de serviço e trabalho prestado;',
          'Fornecer todos os itens descritos na cláusula do objeto, na forma e prazo ajustados;',
          'Responsabilizar-se pelos atos e omissões praticados por seus subordinados, bem como por quaisquer danos que eles venham a sofrer ou causar à CONTRATANTE ou a terceiros;',
          'Arcar com as despesas de natureza trabalhista, inclusive encargos fiscais e previdenciários, bem como com as despesas de natureza tributária decorrentes dos serviços especificados neste contrato;',
          'Reparar os defeitos e as desconformidades eventualmente apuradas durante e por ocasião da obra;',
          'Executar os serviços com profissionais devidamente habilitados e com materiais e equipamentos de boa qualidade.',
        ],
      },
      {
        title: 'DAS OBRIGAÇÕES DA CONTRATANTE',
        paragraphs: ['São obrigações da CONTRATANTE:'],
        items: [
          'Fornecer todas as informações necessárias à realização da obra, inclusive especificando os detalhes e a forma de como ela deve ser entregue;',
          'Efetuar o pagamento nas datas e formas ajustadas neste contrato;',
          'Comunicar à CONTRATADA sobre eventuais reclamações contra seus subordinados, danos por eles causados e mudanças necessárias;',
          'Receber a obra, quando ausentes os motivos de recusa por justa causa.',
        ],
      },
      {
        title: 'DO ACOMPANHAMENTO E DA ENTREGA DA OBRA',
        paragraphs: [
          'A CONTRATADA se obriga a seguir o projeto da obra para a qual foi contratada de modo estrito e sem variações.',
          'Caso se constate a necessidade de pequenas variações para o andamento da obra, a CONTRATADA comunicará imediatamente à CONTRATANTE, que deverá manifestar sua concordância ou discordância por escrito no prazo improrrogável de quarenta e oito horas.',
          'O silêncio da CONTRATANTE sobre a comunicação pelo prazo de quarenta e oito horas será interpretado como anuência tácita e renúncia ao direito que lhe confere o art. 615 do Código Civil brasileiro.',
          'Caso a modificação necessária seja de grandes proporções, a CONTRATANTE deverá manifestar sua anuência expressamente no prazo de 72 (setenta e duas) horas, sob pena de paralisação da obra.',
          'Fica autorizada a CONTRATADA a pausar as atividades na obra até que a anuência ou qualquer outra solução adotada lhe seja comunicada pela CONTRATANTE, sem que isso lhe importe penalização nos termos do contrato.',
          'Em todos os casos, correrão por conta da CONTRATANTE os ajustes de preço e valores causados por modificações de projeto, salvo nos casos em que a culpa for da CONTRATADA.',
          'A CONTRATANTE poderá visitar o canteiro de obras a qualquer tempo, mas precisará solicitar à CONTRATADA, com 24 (vinte e quatro) horas de antecedência, caso deseje uma visita guiada pelo profissional técnico responsável.',
          'Findada a obra, deverá a CONTRATANTE recebê-la no prazo de 48 (quarenta e oito) horas; caso constate justos motivos para não recebê-la, deverá apontá-los por escrito à CONTRATADA dentro do mesmo prazo, sob pena de se considerar a obra tacitamente recebida.',
        ],
      },
      {
        title: 'DAS HIPÓTESES DE SUSPENSÃO DA OBRA',
        paragraphs: ['A CONTRATADA poderá suspender a execução da obra sem incorrer em penalidades nos seguintes casos:'],
        items: [
          'Por motivos de caso fortuito ou força maior;',
          'Se, no decorrer dos serviços, se manifestarem dificuldades imprevisíveis de execução, resultantes de causas geológicas ou hídricas, ou outras semelhantes, de modo que torne a empreitada excessivamente onerosa, e a dona da obra se opuser ao reajuste do preço;',
          'Se as modificações exigidas pela dona da obra, por seu vulto e natureza, forem desproporcionais ao projeto aprovado, ainda que se disponha a arcar com o acréscimo de preço.',
        ],
      },
      {
        ...CLAUSULA_RESCISAO,
        paragraphs: [
          ...CLAUSULA_RESCISAO.paragraphs,
          'Se for o desejo da CONTRATANTE fazer uso do direito que lhe confere o art. 623 do Código Civil brasileiro, estabelecem as partes que a indenização razoável a que o artigo faz menção será de 20% (vinte por cento) sobre o valor total deste contrato, devida à vista e com vencimento na data da comunicação à CONTRATADA.',
          'O mesmo percentual será devido em caso de rescisão unilateral injustificada.',
        ],
      },
      CLAUSULA_PENALIDADES,
      {
        title: 'DAS DISPOSIÇÕES GERAIS',
        paragraphs: [
          'O risco pelo perecimento de materiais corre por conta da CONTRATADA, salvo se a CONTRATANTE estiver em mora para receber a obra.',
          'Versando este contrato apenas do fornecimento, pela CONTRATADA, de mão de obra, todos os riscos a que não der causa correrão por conta da CONTRATANTE.',
          'A CONTRATADA se responsabilizará pela obra pelo prazo de cinco anos, contados após o término dos serviços e a entrega, isentando-se em caso de mau uso por parte da CONTRATANTE.',
          'Apurado qualquer defeito no prazo descrito na cláusula anterior, caso a CONTRATANTE opte por outra empresa para realizar os reparos, renunciará tacitamente aos direitos que possui, inclusive os do art. 618 do Código Civil brasileiro, isentando a CONTRATADA de quaisquer responsabilidades decorrentes dos reparos realizados; o disposto não se aplica a reparos de pequena monta, como pinturas, rebocos e/ou pequenas manutenções.',
          'Nos casos em que o cenário econômico da construção civil sofrer mudanças repentinas e imprevisíveis, a CONTRATADA poderá realizar revisão nos preços orçados inicialmente, propondo o devido reajuste; caso a CONTRATANTE não aceite as mudanças, pagará à CONTRATADA o equivalente pela execução da obra no estado em que se encontra, sendo rescindido o contrato sem ônus ou penalidades para quaisquer das partes.',
          'Nenhum dos contratantes poderá transferir os direitos oriundos deste contrato, quaisquer que sejam, a outrem sem a concordância da outra parte.',
          'O contrato se extingue automaticamente pela entrega da obra, por resilição unilateral de qualquer das partes, com ou sem justa causa, ou pelo perecimento do bem onde a obra está lotada.',
          ...DISPOSICOES_COMUNS,
        ],
      },
      CLAUSULA_FORO,
    ],
  },
];

/** Variáveis disponíveis nos modelos, exibidas na tela de edição. */
export const TEMPLATE_VARIABLES: Array<{ key: string; description: string }> = [
  { key: '{{contrato.objeto}}', description: 'Objeto do contrato (vem do escopo do orçamento)' },
  { key: '{{contrato.valorTotal}}', description: 'Valor total em reais' },
  { key: '{{contrato.valorPorExtenso}}', description: 'Valor total por extenso' },
  { key: '{{contrato.formaPagamento}}', description: 'Condições de pagamento / parcelas' },
  { key: '{{contrato.prazoExecucao}}', description: 'Prazo de execução' },
  { key: '{{contrato.formatosEntrega}}', description: 'Formatos de entrega (PDF, DWG…)' },
  { key: '{{contrato.localExecucao}}', description: 'Endereço da obra ou unidade' },
  { key: '{{contrato.revisoesIncluidas}}', description: 'Quantidade de revisões inclusas' },
  { key: '{{contrato.valorRevisaoExcedente}}', description: 'Taxa por revisão excedente' },
  { key: '{{contrato.foro}}', description: 'Comarca do foro eleito' },
  { key: '{{cliente.razaoSocial}}', description: 'Razão social / nome do cliente' },
  { key: '{{cliente.documento}}', description: 'CNPJ ou CPF do cliente' },
  { key: '{{cliente.endereco}}', description: 'Endereço completo do cliente' },
  { key: '{{empresa.razaoSocial}}', description: 'Razão social da SONARE' },
  { key: '{{empresa.dadosPagamento}}', description: 'Forma de recebimento (Pix/conta)' },
];
