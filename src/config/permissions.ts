// Catálogo central de permissões (formato recurso:ação) e papéis padrão.
// O seed materializa isto no banco; a checagem em runtime usa o banco,
// permitindo que o administrador ajuste papéis sem alterar código.

export const PERMISSIONS = {
  // Administração
  'settings:manage': 'Gerenciar configurações da empresa',
  'user:manage': 'Gerenciar usuários e permissões',
  'audit:read': 'Consultar auditoria',
  'import:manage': 'Executar importações',

  // Clientes
  'client:read': 'Consultar clientes',
  'client:write': 'Cadastrar e editar clientes',
  'client:delete': 'Excluir (logicamente) clientes',

  // CRM
  'opportunity:read': 'Consultar oportunidades',
  'opportunity:write': 'Criar e editar oportunidades',
  'opportunity:delete': 'Excluir oportunidades',
  'activity:write': 'Registrar atividades comerciais',

  // Orçamentos e propostas
  'budget:read': 'Consultar orçamentos',
  'budget:write': 'Criar e editar orçamentos',
  'budget:approve': 'Aprovar orçamentos (regras internas)',
  'proposal:read': 'Consultar propostas',
  'proposal:write': 'Gerar e enviar propostas',

  // Contratos
  'contract:read': 'Consultar contratos',
  'contract:write': 'Criar e editar contratos',
  'contract:sign': 'Registrar assinaturas',

  // Projetos
  'project:read': 'Consultar projetos',
  'project:write': 'Criar e editar projetos',
  'task:read': 'Consultar tarefas',
  'task:write': 'Criar e editar tarefas',
  'deliverable:write': 'Gerenciar entregáveis e revisões',
  'timeentry:write': 'Apontar horas',
  'timeentry:approve': 'Aprovar apontamentos',
  'techresp:write': 'Gerenciar ART/RRT',

  // Equipamentos
  'equipment:read': 'Consultar equipamentos',
  'equipment:write': 'Cadastrar equipamentos e registrar saídas e devoluções',

  // Financeiro
  'finance:read': 'Consultar financeiro',
  'finance:write': 'Gerenciar parcelas e recebimentos',
  'invoice:read': 'Consultar notas fiscais',
  'invoice:write': 'Registrar notas fiscais',
  'collection:write': 'Executar fluxo de cobrança',

  // Relatórios e dashboards
  'report:read': 'Consultar relatórios',
  'dashboard:read': 'Ver dashboards gerenciais',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export const ROLE_DEFAULTS: Record<string, { name: string; permissions: PermissionCode[] | 'ALL' }> = {
  ADMIN: { name: 'Administrador', permissions: 'ALL' },
  COMERCIAL: {
    name: 'Comercial',
    permissions: [
      'client:read', 'client:write',
      'opportunity:read', 'opportunity:write', 'activity:write',
      'budget:read', 'budget:write',
      'proposal:read', 'proposal:write',
      'contract:read',
      'project:read',
      'equipment:read',
      'dashboard:read', 'report:read',
    ],
  },
  ENGENHARIA: {
    name: 'Engenharia',
    permissions: [
      'client:read',
      'contract:read',
      'project:read', 'project:write',
      'task:read', 'task:write',
      'deliverable:write',
      'timeentry:write',
      'techresp:write',
      'equipment:read', 'equipment:write',
      'dashboard:read',
    ],
  },
  FINANCEIRO: {
    name: 'Financeiro',
    permissions: [
      'client:read',
      'contract:read',
      'project:read',
      'equipment:read',
      'finance:read', 'finance:write',
      'invoice:read', 'invoice:write',
      'collection:write',
      'report:read', 'dashboard:read',
    ],
  },
  DIRETORIA: {
    name: 'Diretoria',
    permissions: [
      'client:read', 'opportunity:read', 'budget:read', 'budget:approve',
      'proposal:read', 'contract:read', 'contract:write', 'contract:sign',
      'project:read', 'task:read', 'timeentry:approve',
      'equipment:read',
      'finance:read', 'invoice:read',
      'report:read', 'dashboard:read', 'audit:read',
    ],
  },
  EXTERNO: {
    name: 'Colaborador externo',
    permissions: ['task:read', 'task:write', 'timeentry:write'],
  },
  CLIENTE: {
    name: 'Cliente (portal futuro)',
    permissions: [],
  },
};
