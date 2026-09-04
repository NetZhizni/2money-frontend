import type { MessageKey } from '../i18n'

/**
 * Single source of truth for the main navigation tabs — used by both
 * BottomNav (mobile) and SideNav (desktop).
 *
 * `hasPeriod` marks tabs whose page is wrapped in PeriodPageView (i.e. shows
 * the period switcher) — repeat-clicking those tabs cycles the period
 * instead of doing nothing. Keep this in sync with router/index.ts.
 */
export const NAV_TABS: Array<{ to: string; labelKey: MessageKey; icon: string; hasPeriod?: boolean }> = [
  { to: '/accounts', labelKey: 'layout.nav.accounts', icon: 'mdiWalletOutline' },
  { to: '/categories', labelKey: 'layout.nav.categories', icon: 'mdiChartDonut', hasPeriod: true },
  { to: '/operations', labelKey: 'layout.nav.operations', icon: 'mdiNotebookOutline', hasPeriod: true },
  { to: '/overview', labelKey: 'layout.nav.overview', icon: 'mdiFinance', hasPeriod: true },
]
