import { ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import { NAV_TABS } from '../utils/navTabs'

/**
 * Which way the top-level page (see App.vue's <RouterView>) should slide when
 * the route changes — driven by tab order in navTabs.ts rather than browser
 * history, so tapping a tab always animates toward *that tab's* position
 * (e.g. Operations → Accounts slides back even though it's a forward
 * navigation history-wise). The actual axis is a CSS media query away from
 * this, not decided here: App.vue slides horizontally under the `laptop()`
 * breakpoint (BottomNav's tabs run left→right) and vertically above it
 * (SideNav's tabs run top→bottom).
 */
export type PageTransitionName = 'page-forward' | 'page-back'

export const pageTransitionName = ref<PageTransitionName>('page-forward')

function tabIndex(path: string): number {
  return NAV_TABS.findIndex((tab) => tab.to === path)
}

/**
 * Call from router/index.ts's beforeEach, before the navigation resolves —
 * App.vue's <Transition name="pageTransitionName"> reads the ref while
 * picking enter/leave classes for the incoming page, so it has to be set
 * before that page mounts.
 *
 * Routes outside the tab bar (e.g. /admin, reached from SettingsModal) have
 * no position to compare — treated as "further along" than any tab, so
 * going there slides forward and coming back from there slides back.
 */
export function updatePageTransition(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
) {
  const toIndex = tabIndex(to.path)
  const fromIndex = tabIndex(from.path)
  pageTransitionName.value =
    toIndex === -1 || (fromIndex !== -1 && toIndex >= fromIndex) ? 'page-forward' : 'page-back'
}
