<script setup lang="ts">
import { computed } from 'vue'
import IconCircle from '../common/IconCircle.vue'
import { formatMoney } from '../../utils/format'
import type { BudgetProgress } from '../../utils/budget'

const props = defineProps<{
  name: string
  icon: string
  color: string
  amount: number
  currency: string
  budget?: BudgetProgress | null
  budgetLabel?: string
}>()

defineEmits<{ click: []; longpress: [] }>()

const hasAmount = computed(() => props.amount > 0)
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
    <IconCircle :icon="icon" :color="color" :muted="!hasAmount" :size="56" />
    <span class="name">{{ name }}</span>
    <span class="amount" :style="{ color: hasAmount ? color : 'var(--text-muted)' }">
      {{ formatMoney(amount, currency) }}
    </span>
    <div v-if="budget" class="budget-track" :title="budgetLabel">
      <div
        class="budget-fill"
        :style="{ width: `${budget.pct}%`, background: budget.over ? 'var(--expense)' : color }"
      />
    </div>
  </button>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 6px 2px;
  cursor: pointer;
  text-align: center;
}

.name {
  font-size: 12.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.amount {
  font-size: 12px;
  font-weight: 600;
}

.budget-track {
  width: 44px;
  height: 3px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  overflow: hidden;
  margin-top: 1px;
}

.budget-fill {
  height: 100%;
}
</style>
