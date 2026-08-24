<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTransactionsStore } from '../stores/transactions'
import { useCategoriesStore } from '../stores/categories'
import { usePeriodStore } from '../stores/period'
import { useAuthStore } from '../stores/auth'
import { useDisplayCurrency } from '../composables/useDisplayCurrency'
import { useCountUp } from '../composables/useCountUp'
import ExpenseIncomeChart, { type PeriodBar } from '../components/overview/ExpenseIncomeChart.vue'
import CategoryDonutChart from '../components/overview/CategoryDonutChart.vue'
import CategoryRankList from '../components/overview/CategoryRankList.vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { formatMoney, startOfMonth, endOfMonth, MONTHS_UK_SHORT } from '../utils/format'
import { isCrossProfileTransfer, TRANSFER_CATEGORY_LABEL, TRANSFER_CATEGORY_ICON, TRANSFER_CATEGORY_COLOR } from '../utils/transferAnalytics'
import type { Transaction } from '../types/models'

const transactions = useTransactionsStore()
const categories = useCategoriesStore()
const period = usePeriodStore()
const authStore = useAuthStore()
const displayCurrency = useDisplayCurrency()
const router = useRouter()

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
const crossProfileTransferExpense = computed(() =>
  periodTransactions.value
    .filter((t) => isCrossProfileTransfer(t) && t.ownerId === authStore.uid)
    .reduce((s, t) => s + Math.abs(t.baseAmount), 0),
)
const crossProfileTransferIncome = computed(() =>
  periodTransactions.value
    .filter((t) => isCrossProfileTransfer(t) && t.ownerId !== authStore.uid)
    .reduce((s, t) => s + Math.abs(t.baseAmount), 0),
)

const expenseTotal = computed(
  () =>
    periodTransactions.value.filter((t) => t.type === 'expense').reduce((s, t) => s + Math.abs(t.baseAmount), 0) +
    crossProfileTransferExpense.value,
)
const incomeTotal = computed(
  () =>
    periodTransactions.value.filter((t) => t.type === 'income').reduce((s, t) => s + t.baseAmount, 0) +
    crossProfileTransferIncome.value,
)
const netBalance = computed(() => incomeTotal.value - expenseTotal.value)
const savingsRatePct = computed(() =>
  incomeTotal.value > 0 ? Math.max(0, Math.min(100, Math.round((netBalance.value / incomeTotal.value) * 100))) : 0,
)

/** Expense/income for a slice of transactions, folding in cross-profile transfers the same way the period totals do. */
function expenseIncomeOf(list: Transaction[]): { expense: number; income: number } {
  const expense =
    list.filter((t) => t.type === 'expense').reduce((s, t) => s + Math.abs(t.baseAmount), 0) +
    list.filter((t) => isCrossProfileTransfer(t) && t.ownerId === authStore.uid).reduce((s, t) => s + Math.abs(t.baseAmount), 0)
  const income =
    list.filter((t) => t.type === 'income').reduce((s, t) => s + t.baseAmount, 0) +
    list.filter((t) => isCrossProfileTransfer(t) && t.ownerId !== authStore.uid).reduce((s, t) => s + Math.abs(t.baseAmount), 0)
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
        tooltipLabel: `${cursor.getDate()} ${MONTHS_UK_SHORT[cursor.getMonth()]}`,
        expense: displayCurrency.convert(expense),
        income: displayCurrency.convert(income),
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
        label: MONTHS_UK_SHORT[m],
        tooltipLabel: `${MONTHS_UK_SHORT[m]} ${period.year}`,
        expense: displayCurrency.convert(expense),
        income: displayCurrency.convert(income),
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
      expense: displayCurrency.convert(expense),
      income: displayCurrency.convert(income),
    }
  })
})

const transactionCount = computed(() => periodTransactions.value.length)
const expenseCount = computed(() => periodTransactions.value.filter((t) => t.type === 'expense').length)
const avgExpense = computed(() => (expenseCount.value > 0 ? displayCurrency.convert(expenseTotal.value / expenseCount.value) : 0))

const dailyAvg = computed(() => displayCurrency.convert(expenseTotal.value / periodDays.value))
const weeklyAvg = computed(() => displayCurrency.convert((expenseTotal.value / periodDays.value) * 7))
const displayExpenseTotal = computed(() => displayCurrency.convert(expenseTotal.value))
const displayIncomeTotal = computed(() => displayCurrency.convert(incomeTotal.value))
const displayNetBalance = computed(() => displayCurrency.convert(netBalance.value))

const animatedExpenseTotal = useCountUp(displayExpenseTotal)
const animatedIncomeTotal = useCountUp(displayIncomeTotal)
const animatedNetBalance = useCountUp(displayNetBalance)

const PERIOD_TOTAL_LABEL: Record<string, string> = {
  day: 'День',
  week: 'Тиждень',
  month: 'Місяць',
  year: 'Рік',
  all: 'Увесь час',
}
const periodTotalLabel = computed(() => PERIOD_TOTAL_LABEL[period.granularity] ?? 'Період')

const expenseRanking = computed(() => {
  const rows: Record<string, number> = {}
  for (const t of periodTransactions.value) {
    if (t.type !== 'expense') continue
    const id = t.categoryId
    if (!id) continue
    rows[id] = (rows[id] ?? 0) + Math.abs(t.baseAmount)
  }
  const entries = Object.entries(rows).map(([id, amount]) => {
    const c = categories.byId(id)
    return {
      id,
      name: c?.name ?? '—',
      icon: c?.icon ?? 'mdiHelpCircleOutline',
      color: c?.color ?? '#9a9a9e',
      amount: displayCurrency.convert(amount),
    }
  })
  // Transfers have no category of their own, so a cross-profile transfer
  // you sent gets its own pseudo-entry here instead of silently disappearing.
  if (crossProfileTransferExpense.value > 0) {
    entries.push({
      id: '__transfers__',
      name: TRANSFER_CATEGORY_LABEL,
      icon: TRANSFER_CATEGORY_ICON,
      color: TRANSFER_CATEGORY_COLOR,
      amount: displayCurrency.convert(crossProfileTransferExpense.value),
    })
  }
  return entries.sort((a, b) => b.amount - a.amount).slice(0, 8)
})
</script>

<template>
  <div class="view">
    <div class="top-row">
      <div class="stat-tile expense">
        <span class="stat-label">Витрати</span>
        <span class="stat-value">{{ formatMoney(animatedExpenseTotal, displayCurrency.code) }}</span>
      </div>
      <div class="stat-tile income">
        <span class="stat-label">Доходи</span>
        <span class="stat-value">{{ formatMoney(animatedIncomeTotal, displayCurrency.code) }}</span>
      </div>
    </div>

    <div class="balance-card">
      <div class="balance-text">
        <span class="stat-label">Баланс</span>
        <span class="balance-value" :class="{ negative: netBalance < 0 }">
          {{ formatMoney(animatedNetBalance, displayCurrency.code) }}
        </span>
        <span v-if="balanceDeltaPct !== null" class="balance-delta" :class="balanceDeltaPct >= 0 ? 'up' : 'down'">
          <MdiIcon :name="balanceDeltaPct >= 0 ? 'mdiTrendingUp' : 'mdiTrendingDown'" :size="14" />
          {{ Math.abs(balanceDeltaPct) }}% від попереднього періоду
        </span>
      </div>
      <div class="savings-col">
        <div class="savings-ring" :style="{ '--pct': savingsRatePct }">
          <span>{{ savingsRatePct }}%</span>
        </div>
        <span class="savings-label">Заощадж.</span>
      </div>
    </div>

    <div v-if="periodBars.length" class="card">
      <ExpenseIncomeChart :key="`bars-${period.granularity}-${period.start}`" :bars="periodBars" :currency="displayCurrency.code" />
    </div>

    <div class="avg-row">
      <div class="avg-tile">
        <span class="avg-label">День (сер.)</span>
        <span class="avg-value">{{ formatMoney(dailyAvg, displayCurrency.code) }}</span>
      </div>
      <div class="avg-tile">
        <span class="avg-label">Тиждень (сер.)</span>
        <span class="avg-value">{{ formatMoney(weeklyAvg, displayCurrency.code) }}</span>
      </div>
      <div class="avg-tile">
        <span class="avg-label">{{ periodTotalLabel }}</span>
        <span class="avg-value">{{ formatMoney(displayExpenseTotal, displayCurrency.code) }}</span>
      </div>
    </div>

    <div class="avg-row">
      <div class="avg-tile">
        <span class="avg-label">Операцій</span>
        <span class="avg-value">{{ transactionCount }}</span>
      </div>
      <div class="avg-tile">
        <span class="avg-label">Середній чек</span>
        <span class="avg-value">{{ formatMoney(avgExpense, displayCurrency.code) }}</span>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Витрати за категоріями</h3>
      <CategoryDonutChart
        :key="`donut-${period.granularity}-${period.start}`"
        :segments="expenseRanking"
        :currency="displayCurrency.code"
      />
    </div>

    <div class="card">
      <h3 class="section-title">Топ категорій витрат</h3>
      <CategoryRankList :rows="expenseRanking" :currency="displayCurrency.code" @select="openCategoryOperations" />
    </div>
  </div>
</template>

<style scoped>
.view {
  padding: 8px 16px 90px;
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.top-row {
  display: flex;
  gap: 10px;
}

.stat-tile {
  flex: 1;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease;
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
  flex-shrink: 0;
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
  transition: --pct 0.6s ease;
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
  display: flex;
  gap: 8px;
}

.avg-tile {
  flex: 1;
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

@media (min-width: 900px) {
  .view {
    max-width: 900px;
  }
}
</style>
