<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTransactionsStore } from '../stores/transactions'
import { useCategoriesStore } from '../stores/categories'
import { useAllAccountsStore } from '../stores/allAccounts'
import { useSettingsStore } from '../stores/settings'
import { usePeriodStore, PERIOD_TOTAL_LABEL_KEY } from '../stores/period'
import { useViewAsStore } from '../stores/viewAs'
import { useBaseCurrency } from '../composables/useBaseCurrency'
import { useCountUp } from '../composables/useCountUp'
import ExpenseIncomeChart, { type PeriodBar } from '../components/overview/ExpenseIncomeChart.vue'
import CategoryDonutChart from '../components/overview/CategoryDonutChart.vue'
import CategoryRankList from '../components/overview/CategoryRankList.vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { formatMoney, startOfMonth, endOfMonth, MONTHS_SHORT } from '../utils/format'
import { resolveCategoryCurrency } from '../utils/currencies'
import { otherCurrencyAmount as resolveOtherCurrencyAmount, signedAmountInCurrency } from '../utils/transactionAmounts'
import { isCrossProfileTransfer, transferCategoryLabel, TRANSFER_CATEGORY_ICON, TRANSFER_CATEGORY_COLOR } from '../utils/transferAnalytics'
import { t } from '../i18n'
import type { Transaction } from '../types/models'

const transactions = useTransactionsStore()
const categories = useCategoriesStore()
const allAccounts = useAllAccountsStore()
const settings = useSettingsStore()
const period = usePeriodStore()
const viewAs = useViewAsStore()
const displayCurrency = useBaseCurrency() // name kept: this view fully normalizes to the base currency, same role the old override-aware composable played
const router = useRouter()

/** See utils/transactionAmounts.ts's otherCurrencyAmount — resolvers are this view's own account/category lookups. */
function otherCurrencyAmount(t: Transaction): { amount: number; currency: string } | null {
  return resolveOtherCurrencyAmount(
    t,
    (id) => allAccounts.byId(id)?.currency,
    (id) => resolveCategoryCurrency(categories.byId(id), settings.baseCurrency, transactions.all),
  )
}

/**
 * A transaction's magnitude in the currently shown currency ("Показувати
 * суми в…") — exact when it matches the transaction's own currency or (via
 * `toAmount`) its category's/destination's, a live-rate conversion only when
 * it matches neither (see signedAmountInCurrency). `t.amount` is always
 * non-negative, so feeding it in directly as "the signed amount" is safe —
 * there's no sign to preserve here, only the exact-vs-converted choice.
 */
function amountInBase(t: Transaction): number {
  return Math.abs(signedAmountInCurrency(t.amount, t.currency, displayCurrency.code, otherCurrencyAmount(t), displayCurrency.toBase))
}

// The uid a cross-profile transfer is judged "sent" vs "received" from — the
// profile currently being browsed (self by default). In "Всі" mode there's
// no single perspective left, so cross-profile transfers are excluded
// entirely (money moving within the family isn't a real household expense/income).
const perspectiveUid = computed(() => (viewAs.mode === 'all' ? null : viewAs.effectiveUid))

function openCategoryOperations(categoryId: string) {
  // The "Перекази" ranking row is a pseudo-category (transfers have no real
  // categoryId to filter by) — just go to the unfiltered operations list.
  if (categoryId === '__transfers__') {
    router.push('/operations')
    return
  }
  router.push({ path: '/operations', query: { category: categoryId } })
}

const periodTransactions = computed(() => transactions.forPeriod(period.start, period.end))

// Cross-profile transfers count as an expense for whoever sent them / income
// for whoever received them (same-profile transfers stay excluded — see
// utils/transferAnalytics.ts for why).
const crossProfileTransferExpense = computed(() => {
  if (!perspectiveUid.value) return 0
  return periodTransactions.value
    .filter((t) => isCrossProfileTransfer(t) && t.ownerId === perspectiveUid.value)
    .reduce((s, t) => s + amountInBase(t), 0)
})
const crossProfileTransferIncome = computed(() => {
  if (!perspectiveUid.value) return 0
  return periodTransactions.value
    .filter((t) => isCrossProfileTransfer(t) && t.ownerId !== perspectiveUid.value)
    .reduce((s, t) => s + amountInBase(t), 0)
})

const expenseTotal = computed(
  () =>
    periodTransactions.value.filter((t) => t.type === 'expense').reduce((s, t) => s + amountInBase(t), 0) +
    crossProfileTransferExpense.value,
)
const incomeTotal = computed(
  () =>
    periodTransactions.value.filter((t) => t.type === 'income').reduce((s, t) => s + amountInBase(t), 0) +
    crossProfileTransferIncome.value,
)
const netBalance = computed(() => incomeTotal.value - expenseTotal.value)
const savingsRatePct = computed(() =>
  incomeTotal.value > 0 ? Math.max(0, Math.min(100, Math.round((netBalance.value / incomeTotal.value) * 100))) : 0,
)

/** Expense/income (already converted to the shown currency, see amountInBase) for a slice of transactions, folding in cross-profile transfers the same way the period totals do. */
function expenseIncomeOf(list: Transaction[]): { expense: number; income: number } {
  const uid = perspectiveUid.value
  const expense =
    list.filter((t) => t.type === 'expense').reduce((s, t) => s + amountInBase(t), 0) +
    (uid ? list.filter((t) => isCrossProfileTransfer(t) && t.ownerId === uid).reduce((s, t) => s + amountInBase(t), 0) : 0)
  const income =
    list.filter((t) => t.type === 'income').reduce((s, t) => s + amountInBase(t), 0) +
    (uid ? list.filter((t) => isCrossProfileTransfer(t) && t.ownerId !== uid).reduce((s, t) => s + amountInBase(t), 0) : 0)
  return { expense, income }
}

// Net balance of the period immediately preceding the current one (same
// length, ending right before it starts) — powers the "vs previous period"
// delta on the balance block. Meaningless for "all time" (nothing precedes it).
const previousNetBalance = computed(() => {
  if (period.granularity === 'all') return null
  const span = period.end - period.start + 1
  const prevList = transactions.forPeriod(period.start - span, period.start - 1)
  const { expense, income } = expenseIncomeOf(prevList)
  return income - expense
})

const balanceDeltaPct = computed(() => {
  const prev = previousNetBalance.value
  if (prev == null || prev === 0) return null
  return Math.round(((netBalance.value - prev) / Math.abs(prev)) * 100)
})

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// How many days the current period spans — used for the daily/weekly average
// tiles below. Works for every granularity: 1 for a day, 7 for a week, ~30
// for a month, ~365 for a year. "All" has no natural length, so it falls
// back to the span of whatever data actually exists (or 1, if there's none).
const periodDays = computed(() => {
  if (period.granularity === 'all') {
    if (!transactions.all.length) return 1
    const dates = transactions.all.map((t) => t.date)
    return Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / ONE_DAY_MS) + 1)
  }
  return Math.max(1, Math.round((period.end - period.start) / ONE_DAY_MS) + 1)
})

/**
 * Per-granularity chart bars: a daily bar-per-day chart doesn't generalize to
 * a "Рік"/"Все" view (365+ daily bars would be unreadable), so Year
 * aggregates one bar per month and All aggregates one bar per calendar year
 * that actually has data. "Day" has nothing to break a single day down
 * into, so it renders no bars at all (the chart card is hidden for it).
 */
const periodBars = computed<PeriodBar[]>(() => {
  if (period.granularity === 'day') return []

  if (period.granularity === 'week' || period.granularity === 'month') {
    const bars: PeriodBar[] = []
    const cursor = new Date(period.start)
    while (cursor.getTime() <= period.end) {
      const dayStart = new Date(cursor).setHours(0, 0, 0, 0)
      const dayEnd = new Date(cursor).setHours(23, 59, 59, 999)
      const dayTx = periodTransactions.value.filter((t) => t.date >= dayStart && t.date <= dayEnd)
      const { expense, income } = expenseIncomeOf(dayTx)
      bars.push({
        key: dayStart,
        label: String(cursor.getDate()),
        tooltipLabel: `${cursor.getDate()} ${MONTHS_SHORT[cursor.getMonth()]}`,
        expense,
        income,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    return bars
  }

  if (period.granularity === 'year') {
    const bars: PeriodBar[] = []
    for (let m = 0; m < 12; m++) {
      const monthStart = startOfMonth(period.year, m)
      const monthEnd = endOfMonth(period.year, m)
      const monthTx = periodTransactions.value.filter((t) => t.date >= monthStart && t.date <= monthEnd)
      const { expense, income } = expenseIncomeOf(monthTx)
      bars.push({
        key: m,
        label: MONTHS_SHORT[m],
        tooltipLabel: `${MONTHS_SHORT[m]} ${period.year}`,
        expense,
        income,
      })
    }
    return bars
  }

  // 'all' — one bar per calendar year that has at least one transaction.
  const years = Array.from(new Set(transactions.all.map((t) => new Date(t.date).getFullYear()))).sort((a, b) => a - b)
  return years.map((y) => {
    const yearStart = new Date(y, 0, 1, 0, 0, 0, 0).getTime()
    const yearEnd = new Date(y, 11, 31, 23, 59, 59, 999).getTime()
    const yearTx = transactions.all.filter((t) => t.date >= yearStart && t.date <= yearEnd)
    const { expense, income } = expenseIncomeOf(yearTx)
    return {
      key: y,
      label: String(y),
      tooltipLabel: String(y),
      expense,
      income,
    }
  })
})

const transactionCount = computed(() => periodTransactions.value.length)
const expenseCount = computed(() => periodTransactions.value.filter((t) => t.type === 'expense').length)
const avgExpense = computed(() => (expenseCount.value > 0 ? expenseTotal.value / expenseCount.value : 0))

const dailyAvg = computed(() => expenseTotal.value / periodDays.value)
const weeklyAvg = computed(() => (expenseTotal.value / periodDays.value) * 7)
// expenseTotal/incomeTotal/netBalance are already in the shown currency
// (every per-transaction sum above goes through amountInBase) — kept as
// their own computed refs (rather than used directly) only because
// useCountUp needs a distinct ref per animated value.
const displayExpenseTotal = computed(() => expenseTotal.value)
const displayIncomeTotal = computed(() => incomeTotal.value)
const displayNetBalance = computed(() => netBalance.value)

const animatedExpenseTotal = useCountUp(displayExpenseTotal)
const animatedIncomeTotal = useCountUp(displayIncomeTotal)
const animatedNetBalance = useCountUp(displayNetBalance)

const periodTotalLabel = computed(() => t(PERIOD_TOTAL_LABEL_KEY[period.granularity]))

const expenseRanking = computed(() => {
  const rows: Record<string, number> = {}
  for (const t of periodTransactions.value) {
    if (t.type !== 'expense') continue
    const id = t.categoryId
    if (!id) continue
    rows[id] = (rows[id] ?? 0) + amountInBase(t)
  }
  const entries = Object.entries(rows).map(([id, amount]) => {
    const c = categories.byId(id)
    return {
      id,
      name: c?.name ?? '—',
      icon: c?.icon ?? 'mdiHelpCircleOutline',
      color: c?.color ?? '#9a9a9e',
      amount,
    }
  })
  // Transfers have no category of their own, so a cross-profile transfer
  // you sent gets its own pseudo-entry here instead of silently disappearing.
  if (crossProfileTransferExpense.value > 0) {
    entries.push({
      id: '__transfers__',
      name: transferCategoryLabel(),
      icon: TRANSFER_CATEGORY_ICON,
      color: TRANSFER_CATEGORY_COLOR,
      amount: crossProfileTransferExpense.value,
    })
  }
  return entries.sort((a, b) => b.amount - a.amount).slice(0, 8)
})
</script>

<template>
  <div class="top-row">
    <div class="stat-tile expense">
      <span class="stat-label">{{ t('overview.expenses') }}</span>
      <span class="stat-value">{{ formatMoney(animatedExpenseTotal, displayCurrency.code) }}</span>
    </div>
    <div class="stat-tile income">
      <span class="stat-label">{{ t('overview.income') }}</span>
      <span class="stat-value">{{ formatMoney(animatedIncomeTotal, displayCurrency.code) }}</span>
    </div>
  </div>

  <div class="balance-card">
    <div class="balance-text">
      <span class="stat-label">{{ t('overview.balance') }}</span>
      <span class="balance-value" :class="{ negative: netBalance < 0 }">
        {{ formatMoney(animatedNetBalance, displayCurrency.code) }}
      </span>
      <span v-if="balanceDeltaPct !== null" class="balance-delta" :class="balanceDeltaPct >= 0 ? 'up' : 'down'">
        <MdiIcon :name="balanceDeltaPct >= 0 ? 'mdiTrendingUp' : 'mdiTrendingDown'" :size="14" />
        {{ t('overview.vsPreviousPeriod', { pct: Math.abs(balanceDeltaPct) }) }}
      </span>
    </div>
    <div class="savings-col">
      <div class="savings-ring" :style="{ '--pct': savingsRatePct }">
        <span>{{ savingsRatePct }}%</span>
      </div>
      <span class="savings-label">{{ t('overview.savings') }}</span>
    </div>
  </div>

  <div v-if="periodBars.length" class="card">
    <ExpenseIncomeChart :key="`bars-${period.granularity}-${period.start}`" :bars="periodBars" :currency="displayCurrency.code" />
  </div>

  <div class="avg-row">
    <div class="avg-tile">
      <span class="avg-label">{{ t('overview.dayAvg') }}</span>
      <span class="avg-value">{{ formatMoney(dailyAvg, displayCurrency.code) }}</span>
    </div>
    <div class="avg-tile">
      <span class="avg-label">{{ t('overview.weekAvg') }}</span>
      <span class="avg-value">{{ formatMoney(weeklyAvg, displayCurrency.code) }}</span>
    </div>
    <div class="avg-tile">
      <span class="avg-label">{{ periodTotalLabel }}</span>
      <span class="avg-value">{{ formatMoney(displayExpenseTotal, displayCurrency.code) }}</span>
    </div>
  </div>

  <div class="avg-row">
    <div class="avg-tile">
      <span class="avg-label">{{ t('overview.transactionCount') }}</span>
      <span class="avg-value">{{ transactionCount }}</span>
    </div>
    <div class="avg-tile">
      <span class="avg-label">{{ t('overview.avgReceipt') }}</span>
      <span class="avg-value">{{ formatMoney(avgExpense, displayCurrency.code) }}</span>
    </div>
  </div>

  <div class="card">
    <h3 class="section-title">{{ t('overview.expensesByCategory') }}</h3>
    <CategoryDonutChart
      :key="`donut-${period.granularity}-${period.start}`"
      :segments="expenseRanking"
      :currency="displayCurrency.code"
    />
  </div>

  <div class="card">
    <h3 class="section-title">{{ t('overview.topExpenseCategories') }}</h3>
    <CategoryRankList :rows="expenseRanking" :currency="displayCurrency.code" @select="openCategoryOperations" />
  </div>
</template>

<style lang="scss" scoped>
.top-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.stat-tile {
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-tile.expense {
  background: color-mix(in srgb, var(--expense) 14%, transparent);
}
.stat-tile.income {
  background: color-mix(in srgb, var(--income) 14%, transparent);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
}

.stat-tile.expense .stat-value {
  color: var(--expense);
}
.stat-tile.income .stat-value {
  color: var(--income);
}

@property --pct {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}

.balance-card {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  box-shadow: var(--shadow-sm);
  @include transition();
}

.balance-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.balance-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--income);
  font-variant-numeric: tabular-nums;
}
.balance-value.negative {
  color: var(--expense);
}

.balance-delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  margin-top: 2px;
}
.balance-delta.up {
  color: var(--income);
}
.balance-delta.down {
  color: var(--expense);
}

.savings-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.savings-ring {
  --pct: 0;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  background: conic-gradient(var(--income) calc(var(--pct) * 1%), var(--surface-2) 0);
  position: relative;
  @include transition();
}

.savings-ring::after {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: var(--surface);
}

.savings-ring span {
  position: relative;
  z-index: 1;
}

.savings-label {
  font-size: 10px;
  color: var(--text-muted);
}

.card {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.section-title {
  font-size: 14px;
  margin: 0 0 14px;
  color: var(--text-primary);
}

.avg-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 8px;
}

.avg-tile {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.avg-label {
  font-size: 10.5px;
  color: var(--text-muted);
}

.avg-value {
  font-size: 13px;
  font-weight: 700;
}
</style>
