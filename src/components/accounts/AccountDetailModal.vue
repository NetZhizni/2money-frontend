<script setup lang="ts">
import { computed } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import BalanceLineChart from './BalanceLineChart.vue'
import { useTransactionsStore } from '../../stores/transactions'
import { usePeriodStore } from '../../stores/period'
import { computeAccountBalance } from '../../stores/accounts'
import { buildBalanceHistory } from '../../utils/balanceHistory'
import { formatMoney, startOfDay, endOfDay } from '../../utils/format'
import { accountTypeLabel } from '../../utils/accountTypes'
import { t } from '../../i18n'
import type { PeriodGranularity } from '../../stores/period'
import type { Account } from '../../types/models'

// `account` is nullable because this component stays permanently mounted
// (see the `open` prop / popups pattern) — it's only ever null before the
// first open, since Modal's own `v-if="open"` never renders the slot content
// (and so never reads `account`) until a caller has set it.
const props = defineProps<{ open: boolean; account: Account | null; readonly?: boolean }>()
const emit = defineEmits<{
  close: []
  edit: [Account]
  addOperation: [Account]
  viewOperations: [Account]
}>()

const transactions = useTransactionsStore()
const period = usePeriodStore()

const typeLabel = computed(() =>
  props.account ? accountTypeLabel(props.account.type, props.account.loanDirection) : '',
)

const accountTransactions = computed(() => (props.account ? transactions.forAccount(props.account.id) : []))
const currentBalance = computed(() =>
  props.account ? computeAccountBalance(props.account, accountTransactions.value) : 0,
)

type RangeKey = '1m' | '3m' | '1y' | 'all'

/**
 * Follows the app's globally selected period (the header's "pill" — see
 * PeriodSwitcher.vue/stores/period.ts) instead of its own manual toggle, so
 * this chart stays a trailing window ending TODAY (matching `currentBalance`
 * above, which is always "right now", never a past/future period's closing
 * balance) rather than jumping to whatever arbitrary calendar bucket the
 * pill happens to be on — only the WINDOW WIDTH is taken from it. day/week
 * are too short to show a real trend, so both collapse to the smallest
 * useful window; month keeps this component's previous default (3m), so a
 * fresh session (period store's own initial granularity) looks exactly like
 * it did with the manual toggle.
 */
const GRANULARITY_RANGE: Record<PeriodGranularity, RangeKey> = {
  day: '1m',
  week: '1m',
  month: '3m',
  year: '1y',
  all: 'all',
}
const range = computed<RangeKey>(() => GRANULARITY_RANGE[period.granularity])

const rangeBounds = computed(() => {
  const to = endOfDay(Date.now())
  const account = props.account
  if (!account) return { from: to, to }
  if (range.value === 'all') {
    const earliestTx = accountTransactions.value.reduce((min, t) => Math.min(min, t.date), account.createdAt)
    const from = startOfDay(Math.min(earliestTx, account.createdAt))
    return { from, to }
  }
  const months: Record<Exclude<RangeKey, 'all'>, number> = { '1m': 1, '3m': 3, '1y': 12 }
  const fromDate = new Date(to)
  fromDate.setMonth(fromDate.getMonth() - months[range.value])
  return { from: startOfDay(fromDate.getTime()), to }
})

const historyPoints = computed(() => {
  if (!props.account) return []
  const { from, to } = rangeBounds.value
  const dayCount = Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1
  const points = Math.min(60, Math.max(2, dayCount))
  return buildBalanceHistory(props.account, accountTransactions.value, { from, to, points })
})

const periodDelta = computed(() => {
  if (historyPoints.value.length < 2) return 0
  return historyPoints.value[historyPoints.value.length - 1].balance - historyPoints.value[0].balance
})
</script>

<template>
  <Modal :open="open" :title="t('accounts.detail.title')" @close="emit('close')">
    <template v-if="account">
      <div class="head">
        <IconCircle :icon="account.icon" :color="account.color" :size="64" square />
        <div class="head-text">
          <span class="name">{{ account.name }}</span>
          <span class="meta">{{ typeLabel }}</span>
          <span class="amount" :class="{ negative: currentBalance < 0 }">
            {{ formatMoney(currentBalance, account.currency, { currencyDisplay: account.currencyDisplay }) }}
          </span>
        </div>
      </div>

      <div class="quick-actions">
        <button v-if="!readonly" class="btn btn-primary" @click="emit('addOperation', account)">{{ t('accounts.detail.addOperation') }}</button>
        <button class="btn btn-secondary" @click="emit('viewOperations', account)">{{ t('accounts.detail.operations') }}</button>
      </div>
      <button v-if="!readonly" class="btn btn-secondary edit-btn" @click="emit('edit', account)">{{ t('accounts.detail.editAccount') }}</button>

      <div class="history-section">
        <h3 class="section-title">{{ t('accounts.detail.historyTitle') }}</h3>

        <div class="chart-card">
          <BalanceLineChart
            :key="`${account.id}-${range}-${accountTransactions.length}`"
            :points="historyPoints"
            :currency="account.currency"
            :currency-display="account.currencyDisplay"
            :color="account.color"
          />

          <p class="delta" :class="{ negative: periodDelta < 0, positive: periodDelta > 0 }">
            {{ t('accounts.detail.periodDelta', { amount: formatMoney(periodDelta, account.currency, { signed: true, currencyDisplay: account.currencyDisplay }) }) }}
          </p>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  font-size: 17px;
  font-weight: 700;
}
.meta {
  font-size: 12px;
  color: var(--text-muted);
}
.amount {
  font-size: 16px;
  font-weight: 700;
  margin-top: 2px;
}
.amount.negative {
  color: var(--expense);
}
.edit-btn {
  width: 100%;
  margin-top: 8px;
}
.quick-actions {
  display: flex;
  gap: 10px;
}
.quick-actions .btn {
  flex: 1;
}

.history-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.section-title {
  font-size: 14px;
  margin: 0 0 12px;
  color: var(--text-primary);
}

.chart-card {
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: 16px 12px;
  height: 292px;
}

.delta {
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
  margin: 10px 0 0;
}
.delta.positive {
  color: var(--income);
}
.delta.negative {
  color: var(--expense);
}
</style>
