<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ title?: string; wide?: boolean; width?: number }>(), {})
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

// Closing plays a leave transition before the parent actually unmounts this
// component (via the `close` emit) — without this intermediate state the
// modal just vanished instantly on close while it nicely animated in on open.
const closing = ref(false)
function requestClose() {
  closing.value = true
}
function afterLeave() {
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
    <Transition name="modal" appear @after-leave="afterLeave">
      <div v-if="!closing" class="backdrop" @mousedown.self="requestClose">
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
  display: flex;
  flex-direction: column;
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
  flex-shrink: 0;
  width: 36px;
  height: 4px;
  background: var(--border);
  border-radius: var(--radius-pill);
  margin: 8px auto 12px;
  touch-action: none;
}

.sheet-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  touch-action: none;
}

.sheet-body {
  flex: 1 1 auto;
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
