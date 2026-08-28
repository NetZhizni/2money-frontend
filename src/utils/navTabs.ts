/**
 * Single source of truth for the main navigation tabs — used by both
 * BottomNav (mobile) and SideNav (desktop).
 */
export const NAV_TABS: Array<{ to: string; label: string; icon: string }> = [
  { to: '/accounts', label: 'Рахунки', icon: 'mdiWalletOutline' },
  { to: '/categories', label: 'Категорії', icon: 'mdiChartDonut' },
  { to: '/operations', label: 'Операції', icon: 'mdiNotebookOutline' },
  { to: '/overview', label: 'Огляд', icon: 'mdiFinance' },
]
