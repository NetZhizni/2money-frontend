<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{ open: boolean; title?: string; wide?: boolean; width?: number; top?: boolean }>(),
  {},
)
const emit = defineEmits<{ close: [] }>()

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
      <div v-if="open" class="backdrop" :class="{ top }" @mousedown.self="requestClose">
        <div
          class="sheet"
          :class="{ wide, dragging }"
          role="dialog"
          aria-modal="true"
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
            <button class="icon-btn" aria-label="Закрити" @click="requestClose">✕</button>
          </header>
          <div class="sheet-body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
  transition: opacity 0.2s ease-in-out;
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

@media (min-width: 640px) {
  .backdrop {
    align-items: center;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .sheet,
.modal-leave-to .sheet {
  transform: translateY(100%);
  opacity: 0;
}

.sheet {
  background: var(--surface);
  color: var(--text-primary);
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  display: grid;
  grid-template-rows: auto auto 1fr;
  overflow: hidden;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-md);
  padding: 8px 20px 0;
  transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease;
  touch-action: pan-y;
}

.sheet.dragging {
  transition: none;
}

.sheet.wide {
  max-width: 640px;
}

@media (min-width: 640px) {
  .sheet {
    border-radius: var(--radius-lg);
    transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
  }
  .grabber {
    display: none;
  }
  /* Desktop uses scale in/out instead of the mobile slide-up-from-bottom */
  .modal-enter-from .sheet,
  .modal-leave-to .sheet {
    transform: scale(0);
  }
}

.grabber {
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
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Per spec, a non-'visible' overflow-y forces overflow-x to 'auto' too,
     so any child that overflows horizontally (e.g. a grid row before the
     min-width fix) would silently grow a horizontal scrollbar here. */
  overflow-x: hidden;
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
