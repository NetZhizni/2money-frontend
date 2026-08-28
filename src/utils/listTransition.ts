/**
 * `<TransitionGroup>` support for lists whose container is a flex or grid
 * layout (e.g. AccountsView's `.list`, CategoriesDataView's `.grid`).
 *
 * The `*-leave-active` class takes a leaving item out of flow with
 * `position: absolute` so the remaining items can slide into its place, but
 * flex/grid containers don't preserve an abspos child's static position the
 * way plain block layout does — left unpinned, the leaving item snaps to the
 * container's top-left corner instead of fading out where it actually was.
 *
 * Pinning the item's rect via inline `top`/`left`/`width`/`height` (which
 * win over the class's implicit `top`/`left: auto`) fixes that — but only if
 * the rect is captured before anything moves. Vue processes a batch of
 * simultaneous removals (e.g. switching a tab/filter swaps the whole list)
 * one item at a time within the same patch: by the time the second, third,
 * etc. leaving item is measured, the earlier ones have already left the
 * flow, so a live `getBoundingClientRect()` at that point reflects the
 * partially-collapsed layout rather than where the item actually was.
 *
 * `snapshotListRects` takes that measurement for every current child up
 * front, in the component's `onBeforeUpdate` — before Vue has touched the
 * DOM at all — and `pinLeavingRect` consults that snapshot instead of
 * re-measuring live.
 */

const rectSnapshot = new WeakMap<Element, DOMRect>()
let containerSnapshot: { el: Element; rect: DOMRect } | null = null

/** Call from the list's `onBeforeUpdate`, passing the TransitionGroup's rendered container element (e.g. `groupRef.value?.$el`). */
export function snapshotListRects(container: Element | null | undefined) {
  if (!container) return
  containerSnapshot = { el: container, rect: container.getBoundingClientRect() }
  for (const child of container.children) {
    rectSnapshot.set(child, child.getBoundingClientRect())
  }
}

/** Bind as `@before-leave` on the `<TransitionGroup>`. */
export function pinLeavingRect(el: Element) {
  const node = el as HTMLElement
  const parent = node.offsetParent as HTMLElement | null
  const rect = rectSnapshot.get(node) ?? node.getBoundingClientRect()
  const parentRect = parent && containerSnapshot?.el === parent ? containerSnapshot.rect : parent?.getBoundingClientRect()
  node.style.position = 'absolute'
  node.style.top = `${rect.top - (parentRect?.top ?? 0)}px`
  node.style.left = `${rect.left - (parentRect?.left ?? 0)}px`
  node.style.width = `${rect.width}px`
  node.style.height = `${rect.height}px`
}
