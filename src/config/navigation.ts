import type { PermissionCode } from '@/config/permissions';

export type NavItem = {
  label: string;
  href: string;
  icon: string; // nome do ícone lucide (resolvido no componente)
  permission: PermissionCode | null; // null = visível a qualquer autenticado
  /** Módulo previsto, ainda não implementado: aparece no menu mas não navega. */
  comingSoon?: boolean;
  /** Subitem: recuado sob o item anterior. */
  child?: boolean;
};

/**
 * Permissões que caracterizam trabalho de escritório — quem tem qualquer uma
 * delas usa o dashboard como página inicial. Quem não tem nenhuma (equipe de
 * campo com acesso só ao RDO, por exemplo) começa no primeiro módulo que pode
 * ver, e o dashboard não expõe indicadores da operação a quem não é de dentro.
 */
const PERMISSOES_DE_ESCRITORIO = [
  'client:read', 'opportunity:read', 'budget:read', 'contract:read',
  'project:read', 'equipment:read', 'finance:read', 'invoice:read',
  'report:read', 'user:manage', 'settings:manage',
] as const;

export function temVisaoDeEscritorio(permissions: ReadonlySet<string>): boolean {
  return PERMISSOES_DE_ESCRITORIO.some((p) => permissions.has(p));
}

/** Onde cada pessoa começa: dashboard para o escritório, o próprio módulo para o resto. */
export function paginaInicial(permissions: ReadonlySet<string>): string {
  if (temVisaoDeEscritorio(permissions)) return '/dashboard';
  const item = NAV_ITEMS.find((i) => !i.comingSoon && i.permission && permissions.has(i.permission));
  return item?.href ?? '/dashboard';
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', permission: null },
  { label: 'Clientes', href: '/clientes', icon: 'Users', permission: 'client:read' },
  { label: 'CRM / Pipeline', href: '/crm', icon: 'KanbanSquare', permission: 'opportunity:read' },
  { label: 'Orçamentos', href: '/orcamentos', icon: 'Calculator', permission: 'budget:read' },
  { label: 'Follow-up', href: '/orcamentos/followup', icon: 'Send', permission: 'proposal:read', child: true },
  { label: 'Contratos', href: '/contratos', icon: 'FileSignature', permission: 'contract:read' },
  { label: 'Projetos', href: '/projetos', icon: 'FolderKanban', permission: 'project:read' },
  { label: 'ART / RRT', href: '/art', icon: 'Stamp', permission: 'project:read', child: true },
  { label: 'Obras (RDO)', href: '/obra', icon: 'HardHat', permission: 'diary:read' },
  { label: 'Equipamentos', href: '/equipamentos', icon: 'Wrench', permission: 'equipment:read' },
  { label: 'Financeiro', href: '/financeiro', icon: 'Wallet', permission: 'finance:read' },
  { label: 'A receber', href: '/financeiro/receber', icon: 'ArrowDownCircle', permission: 'finance:read', child: true },
  { label: 'A pagar', href: '/financeiro/pagar', icon: 'ArrowUpCircle', permission: 'finance:read', child: true },
  { label: 'Cobrança', href: '/financeiro/cobranca', icon: 'BellRing', permission: 'finance:read', child: true },
  { label: 'Conciliação', href: '/financeiro/conciliacao', icon: 'Scale', permission: 'finance:read', child: true },
  { label: 'Notas Fiscais', href: '/financeiro/notas', icon: 'ReceiptText', permission: 'invoice:read' },
  { label: 'Relatórios', href: '/relatorios', icon: 'BarChart3', permission: 'report:read' },
  { label: 'Usuários', href: '/usuarios', icon: 'UserCog', permission: 'user:manage' },
  { label: 'Configurações', href: '/configuracoes', icon: 'Settings', permission: 'settings:manage' },
];
