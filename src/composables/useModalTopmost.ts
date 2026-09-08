import { computed, onBeforeUnmount, watch, type ComputedRef, type Ref } from 'vue'

// Module-level (one shared stack for the whole app, not per-component): the
// ids of every Modal currently open, in the order they were opened. Every
// Modal is Teleported to <body>, so DOM order can't tell us which one was
// opened last — this can.
const openIds: symbol[] = []

function setAppInert(inert: boolean) {
  // The Vue app root — everything a Modal isn't. Marking it `inert` while
  // any popup is open removes it (and every button in it) from Tab order
  // entirely, so focus can no longer wander behind an open popup and
  // trigger another one from there.
  const app = document.getElementById('app')
  if (app) app.inert = inert
}

/**
 * Registers a Modal's `open` state with the shared stack and reports
 * whether it's the topmost (most recently opened) one. Modal.vue uses this
 * to keep `tabindex`/Tab navigation confined to whichever popup is actually
 * on top: the app root goes `inert` as soon as anything is open, and if a
 * second Modal opens over a first (e.g. a confirm dialog over a page-local
 * modal), the first is marked `inert` too until the one above it closes.
 */
export function useModalTopmost(open: Ref<boolean> | ComputedRef<boolean>) {
  const id = Symbol('modal')

  watch(
    open,
    (isOpen) => {
      const idx = openIds.indexOf(id)
      if (isOpen && idx === -1) openIds.push(id)
      else if (!isOpen && idx !== -1) openIds.splice(idx, 1)
      setAppInert(openIds.length > 0)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    const idx = openIds.indexOf(id)
    if (idx === -1) return
    openIds.splice(idx, 1)
    setAppInert(openIds.length > 0)
  })

  return computed(() => openIds.length > 0 && openIds[openIds.length - 1] === id)
}
