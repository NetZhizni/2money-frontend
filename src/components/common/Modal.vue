<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { t } from '../../i18n'
import { useModalTopmost } from '../../composables/useModalTopmost'

const props = withDefaults(
  defineProps<{ open: boolean; title?: string; wide?: boolean; width?: number; top?: boolean }>(),
  {},
)
const emit = defineEmits<{ close: [] }>()

// Keeps Tab navigation confined to whichever popup is actually on top (see
// useModalTopmost's doc comment) — the app behind it, and any Modal stacked
// underneath this one, are marked `inert` for as long as this isn't it.
const isTopmost = useModalTopmost(computed(() => props.open))

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const sheetRef = ref<HTMLElement | null>(null)

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null,
  )
}

// Wraps Tab/Shift+Tab at the edges of the sheet instead of letting focus run
// off into the (inert) rest of the document, so the popup behaves like a
// proper modal dialog even once it's the only thing left in tab order.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !sheetRef.value) return
  const focusable = getFocusable(sheetRef.value)
  if (!focusable.length) {
    e.preventDefault()
    sheetRef.value.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (e.shiftKey) {
    if (active === first || !sheetRef.value.contains(active)) {
      e.preventDefault()
      last.focus()
    }
  } else if (active === last || !sheetRef.value.contains(active)) {
    e.preventDefault()
    first.focus()
  }
}

let previouslyFocused: HTMLElement | null = null

// Moves focus into the sheet on open and restores it to whatever triggered
// the popup on close — only on genuine open/close, not when this Modal
// merely regains "topmost" after a stacked one above it closes (that would
// yank focus away from wherever it landed, e.g. back on the trigger button).
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null
      nextTick(() => {
        if (!sheetRef.value) return
        const [first] = getFocusable(sheetRef.value)
        ;(first ?? sheetRef.value).focus()
      })
    } else {
      // nextTick so this always runs after useModalTopmost's own watcher has
      // cleared `#app`'s `inert` (when this was the last open Modal) —
      // focus() on a still-inert ancestor is a silent no-op.
      const toFocus = previouslyFocused
      previouslyFocused = null
      nextTick(() => toFocus?.focus?.())
    }
  },
)

watch(
  computed(() => props.open && isTopmost.value),
  (trapActive) => {
    if (trapActive) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

// Swipe-down-to-dismiss on mobile — grabbable from the handle or the header,
// mirroring native bottom-sheet behavior. Body content keeps scrolling
// normally since the drag is only initiated from those two zones.
const dragOffset = ref(0)
const dragging = ref(false)
let startY = 0
const CLOSE_THRESHOLD = 90

function onTouchStart(e: TouchEvent) {
  dragging.value = true
  startY = e.touches[0].clientY
  dragOffset.value = 0
}
function onTouchMove(e: TouchEvent) {
  if (!dragging.value) return
  const delta = e.touches[0].clientY - startY
  dragOffset.value = Math.max(0, delta)
}
function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false
  if (dragOffset.value > CLOSE_THRESHOLD) {
    requestClose()
  }
  dragOffset.value = 0
}

// Visibility is fully owned by the caller via `open` — this component is
// meant to stay permanently mounted (see the popups store and its call
// sites), with only this backdrop's `v-if` toggling inside `<Transition>`.
// That's what makes the enter/leave animation play reliably: toggling a
// `v-if` at the *call site* instead would unmount this whole component (and
// its Teleported content) synchronously, skipping the leave transition
// entirely rather than playing it.
function requestClose() {
  emit('close')
}

// Merges the drag-to-dismiss offset with an optional fixed width override
// (used by compact popups like the period picker) into a single style object.
const sheetStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.width) style.maxWidth = `${props.width}px`
  if (dragOffset.value) style.transform = `translateY(${dragOffset.value}px)`
  return Object.keys(style).length ? style : undefined
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="backdrop"
        :class="{ top }"
        :inert="!isTopmost"
        @mousedown.self="requestClose"
      >
        <div
          ref="sheetRef"
          class="sheet"
          :class="{ wide, dragging }"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          :style="sheetStyle"
        >
          <div
            class="grabber"
            @touchstart="onTouchStart"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
            @touchcancel="onTouchEnd"
          />
          <header
            v-if="title"
            class="sheet-header"
            @touchstart="onTouchStart"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
            @touchcancel="onTouchEnd"
          >
            <h2>{{ title }}</h2>
            <button class="icon-btn" :aria-label="t('common.close')" @click="requestClose">✕</button>
          </header>
          <div class="sheet-body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  @include transition();
}

/* `top` is for popups mounted once in App.vue (the confirm dialog, the
   transaction form) that can be opened *while another page-local Modal is
   still open* (e.g. "delete?" over Settings, or the transaction form over
   Search) — both backdrops share this component's default z-index, so
   without this the one that stacks on top would depend on unpredictable
   Teleport ordering instead of always winning. */
.backdrop.top {
  z-index: 200;
}

@include tablet() {
  .backdrop {
    align-items: flex-end;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Desktop uses scale in/out instead of the mobile slide-up-from-bottom */
.modal-enter-from .sheet,
.modal-leave-to .sheet {
  transform: scale(0);
  opacity: 0;
}

.sheet {
  background: var(--surface);
  color: var(--text-primary);
  width: 100%;
  max-width: 480px;
  @include viewportHeight('max-height', 90);
  display: grid;
  grid-template-rows: auto auto 1fr;
  overflow: hidden;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 8px 20px 0;
  @include transition();
  touch-action: pan-y;
}

.sheet.dragging {
  transition: none;
}

.sheet.wide {
  max-width: 640px;
}

@include tablet() {
  .sheet {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  .grabber {
    display: block;
  }
  .modal-enter-from .sheet,
  .modal-leave-to .sheet {
    transform: translateY(100%);
  }
}

.grabber {
  display: none;
  grid-row: 1;
  width: 36px;
  height: 4px;
  background: var(--border);
  border-radius: var(--radius-pill);
  margin: 8px auto 12px;
  touch-action: none;
}

.sheet-header {
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  touch-action: none;
}

.sheet-body {
  grid-row: 3;
  min-height: 0;
  /* Per spec, a non-'visible' overflow-y forces overflow-x to 'auto' too, so
     any child that overflows horizontally (e.g. a grid row before the
     min-width fix) would silently grow a horizontal scrollbar here — the
     overflow(y) mixin pins overflow-x back to hidden to guard against that. */
  @include overflow(y);
  overscroll-behavior: contain;
  padding-bottom: 24px;
}

.sheet-header h2 {
  font-size: 17px;
  margin: 0;
}

.icon-btn {
  border: none;
  background: var(--surface-2);
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
</style>
