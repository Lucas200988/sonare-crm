import type { PermissionCode } from '@/config/permissions';

export type NavItem = {
  label: string;
  href: string;
  icon: string; // nome do ícone lucide (resolvido no componente)
  permission: PermissionCode | null; // null = visível a qualquer autenticado
  /** Módulo previsto, ainda não implementado: aparece no menu mas não navega. */
  comingSoon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', permission: null },
  { label: 'Clientes', href: '/clientes', icon: 'Users', permission: 'client:read' },
  { label: 'CRM / Pipeline', href: '/crm', icon: 'KanbanSquare', permission: 'opportunity:read' },
  { label: 'Orçamentos', href: '/orcamentos', icon: 'Calculator', permission: 'budget:read' },
  { label: 'Contratos', href: '/contratos', icon: 'FileSignature', permission: 'contract:read' },
  { label: 'Projetos', href: '/projetos', icon: 'FolderKanban', permission: 'project:read', comingSoon: true },
  { label: 'Financeiro', href: '/financeiro', icon: 'Wallet', permission: 'finance:read', comingSoon: true },
  { label: 'Notas Fiscais', href: '/notas-fiscais', icon: 'ReceiptText', permission: 'invoice:read', comingSoon: true },
  { label: 'Relatórios', href: '/relatorios', icon: 'BarChart3', permission: 'report:read', comingSoon: true },
  { label: 'Usuários', href: '/usuarios', icon: 'UserCog', permission: 'user:manage' },
  { label: 'Configurações', href: '/configuracoes', icon: 'Settings', permission: 'settings:manage' },
];
