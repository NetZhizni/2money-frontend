<script setup lang="ts">
import { computed } from 'vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { formatMoney } from '../../utils/format'
import type { Account } from '../../types/models'

const props = defineProps<{ account: Account; balance: number; pending?: boolean }>()
defineEmits<{ click: []; addOperation: []; history: [] }>()

const typeLabel = computed(() => {
  if (props.account.type === 'savings') return 'Зберігаючий'
  if (props.account.type === 'loan') return props.account.loanDirection === 'lent' ? 'Позика (дав)' : 'Позика (взяв)'
  return 'Звичайний'
})
</script>

<template>
  <div class="card">
    <button class="card-main" @click="$emit('click')">
      <div class="icon-wrap">
        <IconCircle :icon="account.icon" :color="account.color" :size="48" />
        <span v-if="pending" class="pending-badge" title="Очікує синхронізації" aria-label="Очікує синхронізації">
          <MdiIcon name="mdiClockOutline" :size="11" color="#fff" />
        </span>
      </div>
      <div class="info">
        <span class="name">{{ account.name }}</span>
        <span class="meta">
          {{ typeLabel }}
          <MdiIcon v-if="!account.includeInTotal" name="mdiEyeOffOutline" :size="13" color="var(--text-muted)" />
        </span>
      </div>
      <span class="balance" :class="{ negative: balance < 0 }">{{ formatMoney(balance, account.currency) }}</span>
    </button>
    <button class="history-btn" aria-label="Історія балансу" @click="$emit('history')">
      <MdiIcon name="mdiChartLine" :size="18" color="var(--text-muted)" />
    </button>
    <button class="add-op-btn" aria-label="Додати операцію на цей рахунок" @click="$emit('addOperation')">
      <MdiIcon name="mdiPlus" :size="20" color="var(--accent)" />
    </button>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.icon-wrap {
  position: relative;
  flex-shrink: 0;
}

.pending-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-muted);
  border: 2px solid var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  padding: 14px 16px;
  cursor: pointer;
  text-align: left;
}

.add-op-btn,
.history-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  flex-shrink: 0;
  border: none;
  border-left: 1px solid var(--border);
  background: none;
  cursor: pointer;
  transition: transform 0.12s ease;
}

.add-op-btn:active,
.history-btn:active {
  transform: scale(0.85);
}

.history-btn {
  width: 40px;
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.balance {
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}

.balance.negative {
  color: var(--expense);
}
</style>
