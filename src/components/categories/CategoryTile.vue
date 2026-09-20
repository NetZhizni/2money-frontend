<script setup lang="ts">
import { computed } from 'vue'
import CategoryBudgetIcon from './CategoryBudgetIcon.vue'
import { formatMoney, type CurrencyDisplayStyle } from '../../utils/format'
import type { BudgetProgress } from '../../utils/budget'
import type { CategoryKind } from '../../types/models'

const props = defineProps<{
  name: string
  icon: string
  color: string
  amount: number
  currency: string
  // The category's own Settings → "Формат валюти" override, if any (see
  // Category.currencyDisplay) — unset for the synthetic "Перекази" tile
  // (CategoriesDataView.vue), which has no real category to read one from.
  currencyDisplay?: CurrencyDisplayStyle | null
  budget?: BudgetProgress | null
  budgetLabel?: string
  // Only meaningful together with `budget` — the transfer tile has neither.
  // Decides whether "over" reads as bad (spent past an expense limit) —
  // exceeding an income goal is good news and never flagged this way — see
  // remainingLabel/overBudget below. The icon itself always stays the
  // category's own color regardless (see CategoryBudgetIcon below); only the
  // remaining figure's text turns red.
  kind?: CategoryKind
}>()

defineEmits<{ click: []; longpress: [] }>()

const hasAmount = computed(() => props.amount > 0)

// Exceeding an EXPENSE budget is bad (overspent) but exceeding an INCOME one
// is good (earned more than planned) — never flagged red for the latter.
const overBudget = computed(() => !!props.budget?.over && props.kind !== 'income')

// Bare remaining figure (no sign) shown below the spent amount, muted —
// turns red once it's actually negative (over an expense budget). Always
// rendered (falling back to a blank space with no budget) together with
// .remaining's min-height so every tile in the grid reserves the same
// height regardless of whether it has a budget, keeping the grid row-aligned.
const remainingLabel = computed(() => {
  const b = props.budget
  if (!b) return ''
  const remaining = b.amount - b.spent
  return formatMoney(remaining, props.currency, { currencyDisplay: props.currencyDisplay })
})

let pressTimer: ReturnType<typeof setTimeout> | null = null

function onPointerDown(emitLong: () => void) {
  pressTimer = setTimeout(emitLong, 500)
}
function onPointerUp() {
  if (pressTimer) clearTimeout(pressTimer)
}
</script>

<template>
  <button
    class="tile"
    @click="$emit('click')"
    @pointerdown="onPointerDown(() => $emit('longpress'))"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
  >
    <span class="remaining" :class="{ bad: overBudget }">{{ remainingLabel || ' ' }}</span>
    <CategoryBudgetIcon :icon="icon" :color="color" :muted="!hasAmount" :pct="budget?.pct" :size="56" :title="budgetLabel" />
    <span class="name">{{ name }}</span>
    <span class="amount" :style="{ color: hasAmount ? color : 'var(--text-muted)' }">
      {{ formatMoney(amount, currency, { currencyDisplay }) }}
    </span>
  </button>
</template>

<style lang="scss" scoped>
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 90px;
  gap: 4px;
  background: transparent;
  border: none;
  padding: 2px;
  cursor: pointer;
  text-align: center;
}

.name {
  font-size: 12.5px;
  color: var(--text-primary);
  max-width: 100%;
  @include lineClamp(1);
}

.amount {
  font-size: 12px;
  font-weight: 600;
  max-width: 100%;
  @include lineClamp(1);
}

.remaining {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  min-height: 15px;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remaining.bad {
  color: var(--expense);
}
</style>
