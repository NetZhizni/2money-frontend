<script setup lang="ts">
import { computed, ref, useSlots, watch } from 'vue'

/**
 * Single-select segmented switch (theme, account type, expense/income kind,
 * etc.) — used everywhere a fixed, short list of mutually-exclusive options
 * needs a pill-style toggle. Distinct from the plain `.segmented` global
 * class in style.scss, which stays in place for the one remaining
 * *multi*-select control (OperationsFilterModal.vue's type filter, where
 * several options can be active at once and a single sliding indicator
 * wouldn't make sense).
 */
export interface SegmentedOption {
  value: string
  label: string
  disabled?: boolean
}

const props = defineProps<{ modelValue: string; options: SegmentedOption[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const slots = useSlots()

// Two root nodes below (the switch itself, and the optional content panel)
// mean Vue won't auto-inherit attrs onto either — bind them by hand onto the
// switch, which is where callers' extra classes (.tabs, .view-toggle, …)
// used to land directly on the old plain `<div class="segmented …">`.
defineOptions({ inheritAttrs: false })

const activeIndex = computed(() => props.options.findIndex((o) => o.value === props.modelValue))

function select(opt: SegmentedOption) {
  if (props.disabled || opt.disabled || opt.value === props.modelValue) return
  emit('update:modelValue', opt.value)
}

// ---------- Slot panel slide (same choreography as PeriodPageView.vue's period-row transition) ----------
// The switch's own floating indicator (below) just follows `modelValue`
// reactively via a CSS transition — instant, no choreography needed. The
// optional slot panel is different: its *content* changes with the segment
// (e.g. AccountFormModal's loan-direction picker only exists for "Позика"),
// so it gets the same directional slide-and-fade PeriodPageView uses when
// paging between periods — sliding towards the option that moved out of
// view, and in from the side the newly-selected option sits on.
const slideDirection = ref<'next' | 'prev'>('next')
watch(activeIndex, (idx, prevIdx) => {
  if (idx !== -1 && prevIdx !== -1 && idx !== prevIdx) slideDirection.value = idx > prevIdx ? 'next' : 'prev'
})
</script>

<template>
  <div class="segmented-control" v-bind="$attrs">
    <div v-if="activeIndex >= 0" class="segmented-control-thumb" :style="{ transform: `translateX(${activeIndex * 100}%)`, width: `${100 / options.length}%` }" />
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="segmented-control-btn"
      :class="{ active: opt.value === modelValue }"
      :disabled="disabled || opt.disabled"
      @click="select(opt)"
    >
      {{ opt.label }}
    </button>
  </div>

  <Transition
    v-if="slots.default"
    :name="slideDirection === 'next' ? 'segmented-panel-slide-next' : 'segmented-panel-slide-prev'"
    mode="out-in"
  >
    <div class="segmented-control-panel" :key="modelValue">
      <slot />
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.segmented-control {
  position: relative;
  display: grid;
  // grid-auto-columns (vs. flex's `flex: 1`) splits the row into equal
  // columns even when the container itself has no definite width — the
  // switch sizes to its content (e.g. `.view-toggle { max-width: 190px }`
  // in ExpenseIncomeChart.vue), and flex's 0%-basis items don't reliably
  // end up equal-width in that case, so a longer label (e.g. "Стовпчики")
  // grabbed more space than a shorter one ("Лінія") while the thumb below
  // still assumed a uniform `100 / options.length`% split — desyncing the
  // sliding highlight from the actual button bounds.
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  background: var(--surface-2);
  border-radius: var(--radius-pill);
  padding: 3px;
}

.segmented-control-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  @include transition();
}

.segmented-control-btn {
  position: relative;
  z-index: 1;
  border: none;
  background: transparent;
  padding: 9px 12px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  @include transition();
}

.segmented-control-btn.active {
  color: var(--text-primary);
}

.segmented-control-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.segmented-control-btn.active:disabled {
  opacity: 0.75;
}

.segmented-control-panel {
  @include transition();
}

.segmented-panel-slide-next-enter-from,
.segmented-panel-slide-prev-leave-to {
  transform: translateX(50%);
  opacity: 0;
}

.segmented-panel-slide-next-leave-to,
.segmented-panel-slide-prev-enter-from {
  transform: translateX(-50%);
  opacity: 0;
}
</style>
