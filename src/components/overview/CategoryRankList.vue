<script setup lang="ts">
import { computed } from 'vue'
import IconCircle from '../common/IconCircle.vue'
import { formatMoney } from '../../utils/format'
import { t } from '../../i18n'

export interface RankRow {
  id: string
  name: string
  icon: string
  color: string
  amount: number
}

const props = defineProps<{ rows: RankRow[]; currency: string }>()
const emit = defineEmits<{ select: [string] }>()

const total = computed(() => props.rows.reduce((s, r) => s + r.amount, 0))

function pct(amount: number): number {
  return total.value > 0 ? Math.round((amount / total.value) * 100) : 0
}
</script>

<template>
  <TransitionGroup tag="div" name="rank-row" class="rank-list">
    <button v-for="row in rows" :key="row.id" class="rank-row" @click="emit('select', row.id)">
      <IconCircle :icon="row.icon" :color="row.color" :size="36" />
      <div class="rank-mid">
        <div class="rank-top">
          <span class="rank-name">{{ row.name }}</span>
          <span class="rank-amount">{{ formatMoney(row.amount, currency) }}</span>
        </div>
        <div class="rank-track">
          <div class="rank-fill" :style="{ width: `${pct(row.amount)}%`, background: row.color }" />
        </div>
      </div>
      <span class="rank-pct">{{ pct(row.amount) }}%</span>
    </button>
    <p v-if="!rows.length" key="empty" class="empty">{{ t('overview.noDataForPeriod') }}</p>
  </TransitionGroup>
</template>

<style lang="scss" scoped>
.rank-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rank-row-move,
.rank-row-enter-active,
.rank-row-leave-active {
  @include transition();
}
.rank-row-enter-from,
.rank-row-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
.rank-row-leave-active {
  position: absolute;
  width: 100%;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.rank-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rank-top {
  display: flex;
  justify-content: space-between;
  font-size: 13.5px;
}

.rank-name {
  font-weight: 600;
  @include lineClamp(1);
}

.rank-amount {
  color: var(--text-secondary);
  flex-shrink: 0;
  margin-left: 8px;
}

.rank-track {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  overflow: hidden;
}

.rank-fill {
  height: 100%;
  border-radius: var(--radius-pill);
}

.rank-pct {
  font-size: 12px;
  color: var(--text-muted);
  width: 34px;
  text-align: right;
  flex-shrink: 0;
}

.empty {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}
</style>
