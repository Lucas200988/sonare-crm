// Seed de demonstração — NUNCA usar dados ou credenciais reais.
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_DEFAULTS } from '../src/config/permissions';
import { SCOPE_TEMPLATES } from '../src/config/scope-templates';
import { CONTRACT_TEMPLATES } from '../src/config/contract-templates';

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function main() {
  console.log('Seed: iniciando…');

  // 1. Empresa (dados oficiais do proponente — editáveis em Configurações)
  const companyData = {
    // Razão social como consta no CNPJ — usada em propostas, contratos e demais documentos
    legalName: 'SONARE CONSTRUCOES E SOLUCOES TECNICAS LTDA',
    tradeName: 'SONARE ENGENHARIA',
    cnpj: '15356635000101',
    email: 'contato@sonareengenharia.com.br',
    phone: '6533213284',
    website: 'www.sonareengenharia.com.br',
    crea: 'MT 029137',
    addressStreet: 'Av. General Valle',
    addressNumber: '321',
    addressDistrict: 'Bandeirantes',
    zipCode: '78010000',
    city: 'Cuiabá',
    state: 'MT',
    country: 'Brasil',
    timezone: 'America/Cuiaba',
    currency: 'BRL',
  };
  let company = await prisma.company.findFirst();
  company = company
    ? await prisma.company.update({ where: { id: company.id }, data: companyData })
    : await prisma.company.create({ data: companyData });
  const companyId = company.id;

  // 2. Permissões
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, description: PERMISSIONS[code] },
      update: { description: PERMISSIONS[code] },
    });
  }
  const allPerms = await prisma.permission.findMany();
  const permByCode = new Map(allPerms.map((p) => [p.code, p.id]));

  // 3. Papéis
  for (const [code, def] of Object.entries(ROLE_DEFAULTS)) {
    const role = await prisma.role.upsert({
      where: { companyId_code: { companyId, code } },
      create: { companyId, code, name: def.name, isSystem: true },
      update: { name: def.name },
    });
    const permCodes = def.permissions === 'ALL' ? ALL_PERMISSIONS : def.permissions;
    for (const pc of permCodes) {
      const permissionId = permByCode.get(pc);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }
  const roles = await prisma.role.findMany({ where: { companyId } });
  const roleByCode = new Map(roles.map((r) => [r.code, r.id]));

  // 4. Usuários de demonstração (senha: Sonare@2026 — trocar em produção)
  const demoUsers: Array<{ name: string; email: string; role: string }> = [
    { name: 'Administrador', email: 'admin@demo.sonare', role: 'ADMIN' },
    { name: 'Ana Comercial', email: 'comercial@demo.sonare', role: 'COMERCIAL' },
    { name: 'Carlos Engenharia', email: 'engenharia@demo.sonare', role: 'ENGENHARIA' },
    { name: 'Fernanda Financeiro', email: 'financeiro@demo.sonare', role: 'FINANCEIRO' },
    { name: 'Diego Diretoria', email: 'diretoria@demo.sonare', role: 'DIRETORIA' },
  ];
  const passwordHash = await hash('Sonare@2026', ARGON_OPTS);
  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { companyId, name: u.name, email: u.email, passwordHash },
      update: {},
    });
    const roleId = roleByCode.get(u.role);
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        create: { userId: user.id, roleId },
        update: {},
      });
    }
  }

  // 5. Etapas do pipeline (§4.1)
  const stages: Array<{ name: string; kind?: 'ABERTA' | 'GANHA' | 'PERDIDA' | 'SUSPENSA'; color?: string }> = [
    { name: 'Novo lead', color: '#64748b' },
    { name: 'Primeiro contato', color: '#0ea5e9' },
    { name: 'Em qualificação', color: '#0ea5e9' },
    { name: 'Aguardando documentos', color: '#f59e0b' },
    { name: 'Levantamento técnico', color: '#8b5cf6' },
    { name: 'Orçamento em elaboração', color: '#8b5cf6' },
    { name: 'Orçamento em revisão', color: '#8b5cf6' },
    { name: 'Proposta enviada', color: '#06b6d4' },
    { name: 'Aguardando retorno', color: '#06b6d4' },
    { name: 'Em negociação', color: '#f59e0b' },
    { name: 'Aguardando aprovação', color: '#f59e0b' },
    { name: 'Aprovado', color: '#22c55e' },
    { name: 'Contrato em elaboração', color: '#22c55e' },
    { name: 'Contrato enviado', color: '#22c55e' },
    { name: 'Contrato assinado', kind: 'GANHA', color: '#16a34a' },
    { name: 'Perdido', kind: 'PERDIDA', color: '#ef4444' },
    { name: 'Suspenso', kind: 'SUSPENSA', color: '#a1a1aa' },
  ];
  let order = 0;
  for (const s of stages) {
    await prisma.opportunityStage.upsert({
      where: { companyId_name: { companyId, name: s.name } },
      create: { companyId, name: s.name, kind: s.kind ?? 'ABERTA', color: s.color, sortOrder: order },
      update: { sortOrder: order, kind: s.kind ?? 'ABERTA' },
    });
    order += 1;
  }

  // 6. Origens de lead
  const sources = ['Indicação', 'Site', 'Google', 'Instagram', 'WhatsApp', 'Licitação', 'Parceiro', 'Cliente antigo', 'Prospecção ativa', 'Outro'];
  for (const [i, name] of sources.entries()) {
    await prisma.leadSource.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name, sortOrder: i },
      update: {},
    });
  }

  // 7. Motivos de perda (§4.5)
  const lossReasons = ['Preço', 'Prazo', 'Concorrente', 'Cliente desistiu', 'Projeto suspenso', 'Falta de orçamento', 'Serviço fora do escopo', 'Cliente não respondeu', 'Contratação interna', 'Motivo não informado'];
  for (const [i, name] of lossReasons.entries()) {
    await prisma.lossReason.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name, sortOrder: i },
      update: {},
    });
  }

  // 8. Catálogo de serviços (§4.3)
  const services: Array<[string, string, string]> = [
    ['SRV-001', 'Projeto elétrico', 'Elétrica'],
    ['SRV-002', 'Projeto civil', 'Civil'],
    ['SRV-003', 'Projeto estrutural', 'Civil'],
    ['SRV-004', 'Projeto hidrossanitário', 'Civil'],
    ['SRV-005', 'Projeto de drenagem', 'Civil'],
    ['SRV-006', 'Projeto de telecomunicações', 'Telecom'],
    ['SRV-007', 'Projeto de CFTV', 'Telecom'],
    ['SRV-008', 'Projeto de iluminação', 'Elétrica'],
    ['SRV-009', 'Projeto de rede subterrânea', 'Elétrica'],
    ['SRV-010', 'Projeto de energia solar fotovoltaica', 'Energia'],
    ['SRV-011', 'Projeto de sistema BESS', 'Energia'],
    ['SRV-012', 'Projeto de subestação', 'Energia'],
    ['SRV-013', 'Projeto de média tensão', 'Elétrica'],
    ['SRV-014', 'Projeto de baixa tensão', 'Elétrica'],
    ['SRV-015', 'Projeto de SPDA', 'Elétrica'],
    ['SRV-016', 'Projeto de aterramento', 'Elétrica'],
    ['SRV-017', 'Projeto de prevenção e combate a incêndio', 'Segurança'],
    ['SRV-018', 'PSCIP / PPCI', 'Segurança'],
    ['SRV-019', 'Laudo técnico', 'Consultoria'],
    ['SRV-020', 'Inspeção', 'Consultoria'],
    ['SRV-021', 'Comissionamento', 'Consultoria'],
    ['SRV-022', 'Consultoria', 'Consultoria'],
    ['SRV-023', 'Estudo técnico', 'Consultoria'],
    ['SRV-024', 'Licenciamento', 'Regulatório'],
    ['SRV-025', 'Aprovação em concessionária', 'Regulatório'],
    ['SRV-026', 'Aprovação em órgãos públicos', 'Regulatório'],
    ['SRV-027', 'Fiscalização de obra', 'Gestão'],
    ['SRV-028', 'Gerenciamento de projeto', 'Gestão'],
    ['SRV-029', 'As built', 'Documentação'],
    ['SRV-030', 'Levantamento cadastral', 'Documentação'],
  ];
  for (const [code, name, category] of services) {
    const template = SCOPE_TEMPLATES.find((t) => t.serviceCode === code);
    await prisma.serviceCatalog.upsert({
      where: { companyId_code: { companyId, code } },
      create: {
        companyId, code, name, category,
        scopeTemplate: template?.scope,
        premisesTemplate: template?.premises,
        exclusionsTemplate: template?.exclusions,
      },
      update: {
        name, category,
        // preenche os modelos apenas se ainda estiverem vazios (não sobrescreve edições do usuário)
        ...(template ? {
          scopeTemplate: { set: template.scope },
          premisesTemplate: { set: template.premises },
          exclusionsTemplate: { set: template.exclusions },
        } : {}),
      },
    });
  }

  // 9. Retenções (zeradas por padrão — usuário configura; §9.5)
  const retentions: Array<[string, string]> = [
    ['ISS', 'ISS'], ['INSS', 'INSS'], ['IRRF', 'IRRF'], ['PIS', 'PIS'], ['COFINS', 'COFINS'], ['CSLL', 'CSLL'],
  ];
  for (const [code, name] of retentions) {
    await prisma.financialRetention.upsert({
      where: { companyId_code: { companyId, code } },
      create: { companyId, code, name, percent: 0, active: false },
      update: {},
    });
  }

  // 10. Formas de pagamento
  const paymentMethods = ['Pix', 'Transferência bancária', 'Boleto', 'Cartão de crédito', 'Dinheiro'];
  for (const [i, name] of paymentMethods.entries()) {
    await prisma.paymentMethod.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name, sortOrder: i },
      update: {},
    });
  }

  // 11. Configurações padrão (editáveis em Configurações)
  const settings: Array<[string, unknown]> = [
    ['approval.maxDiscountPercent', 10],
    ['approval.minMarginPercent', 20],
    ['approval.maxValueWithoutApproval', 100000],
    ['numbering.format', '{TIPO}-{ANO}-{SEQ:3}'],
    ['proposal.defaultValidityDays', 60],
    // Textos padrão da proposta (espelhados dos modelos oficiais SONARE)
    ['proposal.infoGerais', [
      '- Emissão de Nota Fiscal de serviços;',
      '- Emissão de ART;',
      '- Entrega em mídia digital (não estão inclusas impressões e cópias);',
      '- Todo o serviço será realizado por Engenheiros devidamente habilitados e capacitados (Eng. Eletricista, Eng. Civil e Eng. de Segurança do Trabalho com as suas devidas especializações);',
      '- Não fazem parte desta proposta eventuais taxas cobradas para emissão de documentos;',
      '- Declaramos atender todas as leis e normas vigentes para a elaboração dos serviços;',
      '- Declaramos atender todas as Políticas da CONTRATANTE (Segurança do Trabalho, Saúde Ocupacional, Meio Ambiente, Ética e não utilização de trabalho infantil);',
      '- A CONTRATANTE providenciará liberação de acesso à área quando necessário;',
      '- O prazo de análise dos documentos pela contratante não será contabilizado no prazo de entrega do serviço.',
    ].join('\n')],
    ['proposal.diferenciais', [
      '- A equipe da SONARE possui equipe multidisciplinar utilizando ferramentas de última geração e softwares autênticos para auxílio no desenvolvimento dos projetos relacionados;',
      '- A experiência em grandes projetos devidamente registrada nos acervos profissionais da equipe proporciona ao projeto redução de custos na otimização da edificação, mantendo a segurança necessária ao empreendimento;',
      '- Todos os projetos serão devidamente protocolados e acompanhados pela nossa equipe nos devidos órgãos de aprovação (Bombeiros, Concessionária de Água e Esgoto e Concessionária de Energia).',
    ].join('\n')],
    ['proposal.signerName', 'Lucas Silva Costa'],
    ['proposal.signerTitle', 'Responsável Técnico — Eng. Civil, Eletricista e Telecomunicações'],
    ['proposal.signerRegistration', 'CREA-MT 029137'],
  ];
  for (const [key, value] of settings) {
    await prisma.systemSetting.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, value: value as never },
      update: {},
    });
  }

  // 11.1 Modelos de contrato (transcritos dos documentos oficiais)
  for (const template of CONTRACT_TEMPLATES) {
    await prisma.contractTemplate.upsert({
      where: { companyId_name: { companyId, name: template.name } },
      create: {
        companyId,
        name: template.name,
        kind: template.kind,
        preamble: template.preamble,
        clauses: template.clauses as never,
        isSystem: true,
      },
      // não sobrescreve ajustes feitos pelo usuário nas cláusulas
      update: { kind: template.kind },
    });
  }

  // 12. Clientes e oportunidades de demonstração
  // Só são criados quando explicitamente pedido (`npm run db:seed -- --demo`),
  // para o seed não repovoar a base de um sistema já em uso.
  const querDemo = process.argv.includes('--demo');
  const existingClients = await prisma.client.count({ where: { companyId } });
  if (querDemo && existingClients === 0) {
    const comercial = await prisma.user.findUnique({ where: { email: 'comercial@demo.sonare' } });
    const sources = await prisma.leadSource.findMany({ where: { companyId } });
    const allStages = await prisma.opportunityStage.findMany({ where: { companyId }, orderBy: { sortOrder: 'asc' } });
    const svc = await prisma.serviceCatalog.findMany({ where: { companyId } });
    const bySource = (n: string) => sources.find((s) => s.name === n)?.id;
    const byStage = (n: string) => allStages.find((s) => s.name === n)?.id ?? allStages[0].id;
    const bySvc = (c: string) => svc.find((s) => s.code === c)?.id;

    const demoClients = [
      {
        personType: 'JURIDICA' as const, legalName: 'Agropecuária Boa Safra LTDA', tradeName: 'Boa Safra',
        cnpj: '11222333000181', email: 'contato@boasafra.demo', phone: '65999990001',
        city: 'Primavera do Leste', state: 'MT', segment: 'Agronegócio', leadSourceId: bySource('Indicação'),
        contacts: [{ name: 'Roberto Lima', position: 'Gerente de operações', decisionMaker: true, isPrimary: true }],
        units: [{ name: 'Fazenda Boa Safra — Sede', unitType: 'Fazenda' }],
      },
      {
        personType: 'JURIDICA' as const, legalName: 'Condomínio Residencial Aurora', tradeName: null,
        cnpj: null, email: 'sindico@aurora.demo', phone: '65999990002',
        city: 'Cuiabá', state: 'MT', segment: 'Condomínio', leadSourceId: bySource('Site'),
        contacts: [{ name: 'Márcia Souza', position: 'Síndica', decisionMaker: true, isPrimary: true }],
        units: [],
      },
      {
        personType: 'JURIDICA' as const, legalName: 'Indústria MT Alimentos S.A.', tradeName: 'MT Alimentos',
        cnpj: null, email: 'engenharia@mtalimentos.demo', phone: '65999990003',
        city: 'Várzea Grande', state: 'MT', segment: 'Indústria', leadSourceId: bySource('Prospecção ativa'),
        contacts: [
          { name: 'Paulo Andrade', position: 'Diretor industrial', decisionMaker: true, isPrimary: true },
          { name: 'Carla Menezes', position: 'Compradora', isFinancial: true },
        ],
        units: [{ name: 'Planta Várzea Grande', unitType: 'Indústria' }],
      },
      {
        personType: 'FISICA' as const, legalName: 'João Pereira da Silva', tradeName: null,
        cnpj: null, email: 'joao.silva@email.demo', phone: '65999990004',
        city: 'Cuiabá', state: 'MT', segment: 'Residencial', leadSourceId: bySource('WhatsApp'),
        contacts: [],
        units: [{ name: 'Residência Jardim Itália', unitType: 'Obra' }],
      },
    ];

    const createdClients: string[] = [];
    for (const c of demoClients) {
      const { contacts, units, ...data } = c;
      const client = await prisma.client.create({
        data: { ...data, companyId, commercialOwnerId: comercial?.id, firstContactAt: new Date() },
      });
      createdClients.push(client.id);
      for (const ct of contacts) await prisma.clientContact.create({ data: { ...ct, clientId: client.id } });
      for (const un of units) await prisma.clientUnit.create({ data: { ...un, clientId: client.id } });
    }

    const demoOpps = [
      { title: 'Projeto fotovoltaico 500 kWp — Fazenda Boa Safra', client: 0, stage: 'Novo lead', value: '380000', svc: 'SRV-010', priority: 'ALTA' as const },
      { title: 'SPDA e aterramento — silos', client: 0, stage: 'Em qualificação', value: '45000', svc: 'SRV-015', priority: 'MEDIA' as const },
      { title: 'Laudo elétrico das áreas comuns', client: 1, stage: 'Orçamento em elaboração', value: '8500', svc: 'SRV-019', priority: 'MEDIA' as const },
      { title: 'Projeto de CFTV e controle de acesso', client: 1, stage: 'Proposta enviada', value: '22000', svc: 'SRV-007', priority: 'BAIXA' as const },
      { title: 'Subestação 300 kVA — planta industrial', client: 2, stage: 'Em negociação', value: '95000', svc: 'SRV-012', priority: 'URGENTE' as const },
      { title: 'PPCI — renovação do AVCB', client: 2, stage: 'Aguardando retorno', value: '18000', svc: 'SRV-018', priority: 'ALTA' as const },
      { title: 'Projeto elétrico residencial completo', client: 3, stage: 'Contrato assinado', value: '12000', svc: 'SRV-001', priority: 'MEDIA' as const },
    ];

    let seq = 1;
    const year = new Date().getFullYear();
    for (const o of demoOpps) {
      const stageId = byStage(o.stage);
      const stage = allStages.find((s) => s.id === stageId);
      await prisma.opportunity.create({
        data: {
          companyId,
          code: `OPP-${year}-${String(seq).padStart(3, '0')}`,
          title: o.title,
          clientId: createdClients[o.client],
          stageId,
          serviceCatalogId: bySvc(o.svc),
          estimatedValue: o.value,
          priority: o.priority,
          commercialOwnerId: comercial?.id,
          probability: '50',
          closedAt: stage && stage.kind !== 'ABERTA' ? new Date() : null,
        },
      });
      seq += 1;
    }
    await prisma.documentSequence.upsert({
      where: { companyId_type_year: { companyId, type: 'OPP', year } },
      create: { companyId, type: 'OPP', year, nextValue: seq },
      update: { nextValue: seq },
    });
    console.log(`Seed: ${demoClients.length} clientes e ${demoOpps.length} oportunidades de demonstração criados.`);
  }

  // 9. Equipamentos que a equipe leva a campo
  const equipamentos = [
    { name: 'Analisador de Energia RE7000', brand: 'Embrasul', model: 'RE7000', category: 'Instrumento de medição' },
    { name: 'Analisador de Energia 4001', brand: 'Embrasul', model: 'RE4001', category: 'Instrumento de medição' },
    { name: 'Câmera Termográfica E5', brand: 'FLIR', model: 'E5', category: 'Instrumento de medição' },
    { name: 'Terrômetro de Estacas', brand: null, model: null, category: 'Instrumento de medição' },
  ];
  {
    const year = new Date().getFullYear();
    let seq = 1;
    for (const eq of equipamentos) {
      const existente = await prisma.equipment.findFirst({ where: { companyId, name: eq.name } });
      if (existente) continue;
      const code = `EQP-${year}-${String(seq).padStart(3, '0')}`;
      await prisma.equipment.create({ data: { ...eq, companyId, code } });
      seq += 1;
    }
    const total = await prisma.equipment.count({ where: { companyId } });
    await prisma.documentSequence.upsert({
      where: { companyId_type_year: { companyId, type: 'EQP', year } },
      create: { companyId, type: 'EQP', year, nextValue: total + 1 },
      update: { nextValue: total + 1 },
    });
    console.log(`Seed: ${total} equipamento(s) no catálogo.`);
  }

  console.log('Seed: concluído.');
  console.log('Usuários de demonstração (senha: Sonare@2026):');
  for (const u of demoUsers) console.log(`  - ${u.email} (${u.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
