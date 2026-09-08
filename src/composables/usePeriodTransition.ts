export type PeriodTransitionDirection = 'next' | 'prev'

/**
 * PeriodPageView.vue owns the period slide animation (it holds the actual DOM
 * node that gets transformed) and already runs it around its own chevron/
 * swipe navigation. BottomNav.vue/SideNav.vue need that same animation when
 * double-tapping the active tab jumps the period back to "today" — but they
 * live in App.vue's shell, a sibling of PeriodPageView.vue (mounted inside
 * `<RouterView>`), so there's no prop/emit path between them. This tiny
 * module-level registry bridges the gap without pulling in an event-bus
 * dependency: PeriodPageView.vue registers its slide runner on mount, and
 * whoever wants a transition (only reachable while it's on screen — `tab.to`
 * always resolves to a route rendered inside PeriodPageView.vue) calls
 * `requestPeriodTransition`.
 */
type Navigator = (direction: PeriodTransitionDirection, mutate: () => void) => void | Promise<void>

let activeNavigator: Navigator | null = null

/** Called by PeriodPageView.vue on mount; returns the matching unregister for onUnmounted. */
export function registerPeriodNavigator(fn: Navigator): () => void {
  activeNavigator = fn
  return () => {
    if (activeNavigator === fn) activeNavigator = null
  }
}

/** Runs `mutate` (the actual store change) around the registered slide animation, sliding the given direction. Falls back to an instant, unanimated `mutate()` if nothing is registered (defensive only — shouldn't happen for a `hasPeriod` tab). */
export function requestPeriodTransition(direction: PeriodTransitionDirection, mutate: () => void) {
  if (activeNavigator) activeNavigator(direction, mutate)
  else mutate()
}
