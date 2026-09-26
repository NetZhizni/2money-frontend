<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCategoriesStore } from '../stores/categories'
import { useTransactionsStore } from '../stores/transactions'
import { useBudgetsStore } from '../stores/budgets'
import { usePeriodStore } from '../stores/period'
import { useSettingsStore } from '../stores/settings'
import { useViewAsStore } from '../stores/viewAs'
import { useProfilesStore } from '../stores/profiles'
import { useAuthStore } from '../stores/auth'
import { useBaseCurrency } from '../composables/useBaseCurrency'
import Segmented from '../components/common/Segmented.vue'
import CategoryBudgetIcon from '../components/categories/CategoryBudgetIcon.vue'
import AmountEntryModal from '../components/common/AmountEntryModal.vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { monthKey, monthKeyFromTimestamp, parseMonthKey, shiftMonthKey, proratedBudgetAmount, roundToNiceAmount } from '../utils/budget'
import { formatMoney, startOfMonth, endOfMonth, MONTHS_GENITIVE } from '../utils/format'
import { resolveCategoryCurrency } from '../utils/currencies'
import { categoryCurrencyAmount } from '../utils/transactionAmounts'
import { t } from '../i18n'
import type { Budget, Category, CategoryKind, Transaction } from '../types/models'

const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const budgets = useBudgetsStore()
const period = usePeriodStore()
const settings = useSettingsStore()
const viewAs = useViewAsStore()
const profiles = useProfilesStore()
const authStore = useAuthStore()
const baseCurrency = useBaseCurrency()

const readOnly = computed(() => viewAs.isReadOnly)
const isAll = computed(() => viewAs.mode === 'all')

const kind = ref<CategoryKind>('expense')
const kindOptions = computed(() => [
  { value: 'expense', label: t('categories.expense') },
  { value: 'income', label: t('categories.income') },
])

const expenseCategories = computed(() => categories.topLevel('expense'))
const incomeCategories = computed(() => categories.topLevel('income'))
// Suggestion/forecast lookups (below) are built once for BOTH kinds — cheap,
// and means switching the toggle never needs to recompute them.
const allVisibleCategories = computed(() => [...expenseCategories.value, ...incomeCategories.value])

function currencyFor(c: Category): string {
  return resolveCategoryCurrency(c, settings.baseCurrency, transactions.all)
}

// --- spent so far this month, per top-level category (rolled up with its subcategories) ---
// Same shape as CategoriesDataView.vue's own directTotals/rolledTotals, but
// factored into plain functions of an arbitrary transaction list rather than
// a computed of the active period alone — forecastByCategory below reuses
// them against a handful of PAST months' transactions the same way.
function directTotalsFor(txs: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const tx of txs) {
    const id = tx.subcategoryId ?? tx.categoryId
    if (!id) continue
    const categoryCurrency = resolveCategoryCurrency(categories.byId(tx.categoryId), settings.baseCurrency, transactions.all)
    map[id] = (map[id] ?? 0) + categoryCurrencyAmount(tx, categoryCurrency, baseCurrency.toBase)
  }
  return map
}

function rollUp(direct: Record<string, number>): Record<string, number> {
  const map: Record<string, number> = { ...direct }
  for (const top of categories.all.filter((c) => c.parentId === null)) {
    const kids = categories.childrenOf(top.id, true)
    const kidsSum = kids.reduce((s, k) => s + (direct[k.id] ?? 0), 0)
    map[top.id] = (map[top.id] ?? 0) + kidsSum
  }
  return map
}

const periodTransactions = computed(() => transactions.forPeriod(period.start, period.end))
const directTotals = computed(() => directTotalsFor(periodTransactions.value))
const rolledTotals = computed(() => rollUp(directTotals.value))

// --- budgets: settings always stay per-calendar-month (see types/models.ts's
// Budget.month) — but the page is shown at whatever period granularity the
// user has picked (day/week/month/year/all, via PeriodSwitcher). `editMonthKey`
// is the ONE month editing ever targets: the active month in 'month' view,
// or the month containing the specific day/week being viewed. 'year'/'all'
// don't resolve to a single month, so editing is disabled there (rows go
// read-only) — see openEntry/budget-row--static below.
const editMonthKey = computed<string | null>(() => {
  switch (period.granularity) {
    case 'month':
      return monthKey(period.year, period.month)
    case 'day':
    case 'week':
      return monthKeyFromTimestamp(period.anchor)
    default:
      return null
  }
})
const previousMonth = computed(() => (editMonthKey.value ? shiftMonthKey(editMonthKey.value, -1) : null))
const previousMonthLabel = computed(() => {
  if (!previousMonth.value) return ''
  const { year, month } = parseMonthKey(previousMonth.value)
  return `${MONTHS_GENITIVE[month]} ${year}`
})

// In "Всі" mode `budgets.all` already holds every family member's rows (see
// stores/budgets.ts's collection query) — self/other-member modes only ever
// have one row per category, so grouping by categoryId is a no-op there.
// Only meaningful for the editable month (empty in 'year'/'all' view).
function budgetsForCategory(categoryId: string): Budget[] {
  if (!editMonthKey.value) return []
  return budgets.forMonth(editMonthKey.value).filter((b) => b.categoryId === categoryId)
}

/** This profile's own budget for a category, for the editable month (also correct for "viewing as" one specific other member — see stores/budgets.ts's collection query). `undefined` whenever there's no single editable month ('year'/'all'). */
function myBudget(categoryId: string): Budget | undefined {
  return editMonthKey.value ? budgets.forCategory(categoryId, editMonthKey.value) : undefined
}

/** Sum across every row for a category in one specific month — the whole family's combined limit in "Всі" mode, otherwise just the one row's own amount. */
function monthlyTotalAmount(categoryId: string, month: string): number {
  return budgets.forMonth(month).filter((b) => b.categoryId === categoryId).reduce((s, b) => s + b.amount, 0)
}

/**
 * What to actually SHOW as the category's budget for the active period —
 * the monthly amount(s) as set (myBudget/monthlyTotalAmount above are the
 * only things that ever get edited), recalculated for whatever granularity
 * is on screen. See utils/budget.ts's proratedBudgetAmount for the actual
 * day/week/month/year/all math — shared with CategoriesDataView.vue's own
 * budget ring.
 */
function displayBudgetAmount(categoryId: string): number {
  return proratedBudgetAmount(
    period,
    (month) => monthlyTotalAmount(categoryId, month),
    () => budgets.all.filter((b) => b.categoryId === categoryId).reduce((s, b) => s + b.amount, 0),
  )
}

/** `budget - spent`, in the category's own currency (both sides already are). Positive = still within it / short of the goal; negative = past it. */
function remainingOf(categoryId: string): number {
  return displayBudgetAmount(categoryId) - (rolledTotals.value[categoryId] ?? 0)
}

/** Red only in the remaining-figure TEXT for an overspent EXPENSE — exceeding an income goal is good news, never flagged this way. The icon itself never turns red either way — see CategoryBudgetIcon.vue. */
function isBad(c: Category): boolean {
  return c.kind === 'expense' && remainingOf(c.id) < 0
}

/** Spend-vs-budget %, capped at 100, or null when there's no budget to measure against yet (CategoryBudgetIcon.vue then renders a plain icon instead of a fill). */
function pctFor(categoryId: string): number | null {
  const budget = displayBudgetAmount(categoryId)
  if (budget <= 0) return null
  return Math.min(100, Math.round(((rolledTotals.value[categoryId] ?? 0) / budget) * 100))
}

const myAmountByCategory = computed<Record<string, number | undefined>>(() => {
  const map: Record<string, number | undefined> = {}
  for (const c of allVisibleCategories.value) map[c.id] = myBudget(c.id)?.amount
  return map
})

// --- forecast: a starting-point suggestion for a category with no budget of
// its own yet, from the average of however many of the last few FULL
// calendar months actually had any spend in it (skips a month with none
// rather than dragging the average toward zero for a category that simply
// didn't come up every month, e.g. "Подорожі").
const FORECAST_MONTHS = 3

const forecastByCategory = computed<Record<string, number>>(() => {
  const sums: Record<string, number> = {}
  const counts: Record<string, number> = {}
  if (!editMonthKey.value) return {}
  const { year: baseYear, month: baseMonth } = parseMonthKey(editMonthKey.value)
  for (let i = 1; i <= FORECAST_MONTHS; i++) {
    const y = baseMonth - i < 0 ? baseYear - 1 : baseYear
    const m = ((baseMonth - i) % 12 + 12) % 12
    const rolled = rollUp(directTotalsFor(transactions.forPeriod(startOfMonth(y, m), endOfMonth(y, m))))
    for (const c of allVisibleCategories.value) {
      if (!rolled[c.id]) continue
      sums[c.id] = (sums[c.id] ?? 0) + rolled[c.id]
      counts[c.id] = (counts[c.id] ?? 0) + 1
    }
  }
  const avg: Record<string, number> = {}
  for (const id of Object.keys(sums)) avg[id] = sums[id] / counts[id]
  return avg
})

interface BudgetSuggestion {
  amount: number
  source: 'previous' | 'forecast'
}

/**
 * What to offer a category with no budget of ITS OWN this month yet (own
 * store — same profile-scoping as myBudget above): last month's explicit
 * amount when there is one (a deliberate past decision, so it wins), else a
 * rounded forecast from recent actual spend when there's enough history,
 * else nothing to suggest. Silently pre-fills the keypad below (see
 * entryInitialValue) — there's no separate "quick copy" button in this
 * layout, unlike an earlier version of this page.
 */
const suggestionByCategory = computed<Record<string, BudgetSuggestion | undefined>>(() => {
  const map: Record<string, BudgetSuggestion | undefined> = {}
  for (const c of allVisibleCategories.value) {
    if (myAmountByCategory.value[c.id] != null) continue
    const prev = budgets.forCategory(c.id, previousMonth.value)
    if (prev) {
      map[c.id] = { amount: prev.amount, source: 'previous' }
      continue
    }
    const forecast = forecastByCategory.value[c.id]
    if (forecast > 0) map[c.id] = { amount: roundToNiceAmount(forecast), source: 'forecast' }
  }
  return map
})

interface MemberAmount {
  name: string
  amount: number
  isSelf: boolean
}

/** Per-member breakdown for "Всі" mode's category rows — empty everywhere else. */
function membersFor(categoryId: string): MemberAmount[] {
  if (!isAll.value) return []
  return budgetsForCategory(categoryId)
    .map((b) => ({
      name: b.ownerId === authStore.uid ? t('layout.userSwitcher.you') : (profiles.byId(b.ownerId)?.displayName ?? '—'),
      amount: b.amount,
      isSelf: b.ownerId === authStore.uid,
    }))
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf))
}

interface KindSection {
  kind: CategoryKind
  categories: Category[]
  plannedTotal: number
  actualTotal: number
  remaining: number
  remainingBad: boolean
}

// Totals here are normalized to the base currency (see baseCurrency.toBase)
// at TODAY's rate, planned and actual alike, so the two stay comparable —
// since a kind's categories can each be in their own currency — unlike
// remainingOf() above, which stays in one category's own currency. Every
// category of the kind gets a row — no more a separate compact grid for ones
// with nothing tracked yet (see CategoryTile.vue for that pattern instead,
// used on the Categories page).
function buildSection(kind: CategoryKind, list: Category[]): KindSection {
  const plannedTotal = list.reduce((s, c) => s + baseCurrency.toBase(displayBudgetAmount(c.id), currencyFor(c)), 0)
  const actualTotal = list.reduce((s, c) => s + baseCurrency.toBase(rolledTotals.value[c.id] ?? 0, currencyFor(c)), 0)
  const remaining = plannedTotal - actualTotal
  return {
    kind,
    categories: list,
    plannedTotal,
    actualTotal,
    remaining,
    remainingBad: kind === 'expense' && remaining < 0,
  }
}

const activeSection = computed<KindSection>(() =>
  buildSection(kind.value, kind.value === 'expense' ? expenseCategories.value : incomeCategories.value),
)

// A page-wide "planned income vs. planned expenses" summary, shown above the
// Витрати/Доходи toggle (not inside it) so it stays visible whichever side
// is currently open — the whole point is comparing both at once instead of
// having to flip back and forth. Budgeted amounts only (not actual spend),
// same as everything else buildSection's plannedTotal already covers.
const expensePlannedTotal = computed(() =>
  expenseCategories.value.reduce((s, c) => s + baseCurrency.toBase(displayBudgetAmount(c.id), currencyFor(c)), 0),
)
const incomePlannedTotal = computed(() =>
  incomeCategories.value.reduce((s, c) => s + baseCurrency.toBase(displayBudgetAmount(c.id), currencyFor(c)), 0),
)
const projectedBalance = computed(() => incomePlannedTotal.value - expensePlannedTotal.value)

// --- copy from previous month ---
const copying = ref(false)
const copyResult = ref<{ month: string; count: number } | null>(null)

const canCopyFromPrevious = computed(() => {
  if (readOnly.value || !editMonthKey.value || !previousMonth.value) return false
  const already = new Set(budgets.forMonth(editMonthKey.value).map((b) => b.categoryId))
  return budgets.forMonth(previousMonth.value).some((b) => !already.has(b.categoryId))
})

async function copyFromPrevious() {
  if (!editMonthKey.value) return
  copying.value = true
  try {
    const count = await budgets.copyFromPreviousMonth(editMonthKey.value)
    copyResult.value = { month: previousMonthLabel.value, count }
  } finally {
    copying.value = false
  }
}

// --- editing (own budget only — "Всі"/other-member views stay read-only, same as everywhere else) ---
const activeCategory = ref<Category | null>(null)
const showEntry = ref(false)

function openEntry(c: Category) {
  if (readOnly.value || !editMonthKey.value) return
  activeCategory.value = c
  showEntry.value = true
}

// Opening the keypad for a category with nothing set yet starts from its
// suggestion (previous month's amount, or the rounded forecast) instead of
// blank — still a couple of taps to adjust and confirm, but never a guess
// starting from zero.
const entryInitialValue = computed(() => {
  if (!activeCategory.value) return null
  const existing = myBudget(activeCategory.value.id)?.amount
  if (existing != null) return existing
  return suggestionByCategory.value[activeCategory.value.id]?.amount ?? null
})
const entryCurrency = computed(() => (activeCategory.value ? currencyFor(activeCategory.value) : settings.baseCurrency))

async function handleEntryConfirm(amount: number) {
  const c = activeCategory.value
  const month = editMonthKey.value
  if (!c || !month) return
  const existing = myBudget(c.id)
  if (amount <= 0) {
    if (existing) await budgets.remove(existing.id)
    return
  }
  if (existing) {
    await budgets.update(existing.id, { amount, currency: entryCurrency.value })
  } else {
    await budgets.add({ categoryId: c.id, amount, currency: entryCurrency.value, period: 'monthly', month })
  }
}

interface QuickSuggestion {
  key: string
  label: string
  amount: number
}

/**
 * The keypad popup's quick-pick row (see AmountKeypad.vue's slot, forwarded
 * through AmountEntryModal.vue) — same idea as OperationDateModal.vue's
 * "Сьогодні"/"Вчора" shortcuts, just for an amount instead of a date. Up to
 * three, each hidden when it has nothing meaningful to offer: last month's
 * explicit budget (a deliberate past decision), this month's actual so far
 * (a live floor/ceiling to anchor against), and the same rounded forecast
 * used to pre-fill the keypad for a category with nothing set at all.
 */
const quickSuggestions = computed<QuickSuggestion[]>(() => {
  const c = activeCategory.value
  if (!c) return []
  const list: QuickSuggestion[] = []
  const prev = previousMonth.value ? budgets.forCategory(c.id, previousMonth.value) : undefined
  if (prev) list.push({ key: 'previous', label: t('budget.quickPrevious'), amount: prev.amount })
  const current = rolledTotals.value[c.id] ?? 0
  if (current > 0) list.push({ key: 'current', label: t('budget.quickCurrent'), amount: current })
  const forecast = forecastByCategory.value[c.id]
  if (forecast > 0) {
    const rounded = roundToNiceAmount(forecast)
    // Don't repeat a figure already offered above under a different label.
    if (!list.some((s) => s.amount === rounded)) list.push({ key: 'forecast', label: t('budget.quickForecast'), amount: rounded })
  }
  return list
})

/** Applies a quick-pick suggestion straight away (no extra confirm tap) and closes the popup. */
async function quickApply(amount: number) {
  await handleEntryConfirm(amount)
  showEntry.value = false
}
</script>

<template>
  <div class="plan-summary">
    <div class="plan-item">
      <span class="plan-label">{{ t('categories.income') }}</span>
      <span class="plan-value" style="color: var(--income)">{{ formatMoney(incomePlannedTotal, settings.baseCurrency) }}</span>
    </div>
    <div class="plan-item">
      <span class="plan-label">{{ t('categories.expense') }}</span>
      <span class="plan-value" style="color: var(--expense)">{{ formatMoney(expensePlannedTotal, settings.baseCurrency) }}</span>
    </div>
    <div class="plan-item">
      <span class="plan-label">{{ t('budget.planBalance') }}</span>
      <span class="plan-value" :class="{ bad: projectedBalance < 0 }">{{ formatMoney(projectedBalance, settings.baseCurrency) }}</span>
    </div>
  </div>

  <Segmented
    class="kind-toggle"
    :model-value="kind"
    :options="kindOptions"
    @update:model-value="(v) => (kind = v as CategoryKind)"
  >
    <button v-if="!readOnly && canCopyFromPrevious" class="copy-banner" :disabled="copying" @click="copyFromPrevious">
      <MdiIcon name="mdiContentCopy" :size="16" />
      {{ copying ? t('budget.copying') : t('budget.copyFromPrevious', { month: previousMonthLabel }) }}
    </button>
    <p v-else-if="copyResult" class="copy-result">{{ t('budget.copied', { count: copyResult.count, month: copyResult.month }) }}</p>

    <div class="section-header" :class="activeSection.kind">
      <div class="section-header-main">
        <span class="section-title">{{ t(activeSection.kind === 'expense' ? 'categories.expense' : 'categories.income') }}</span>
        <span class="section-subtitle">
          {{ t(activeSection.kind === 'expense' ? 'budget.spentLine' : 'budget.receivedLine', { amount: formatMoney(activeSection.actualTotal, settings.baseCurrency) }) }}
        </span>
      </div>
      <div class="section-header-aside">
        <span class="section-remaining" :class="{ bad: activeSection.remainingBad }">{{ formatMoney(activeSection.remaining, settings.baseCurrency) }}</span>
        <span class="section-caption">{{ t('budget.ofTotal', { amount: formatMoney(activeSection.plannedTotal, settings.baseCurrency) }) }}</span>
      </div>
    </div>

    <p v-if="!activeSection.categories.length" class="empty">{{ t('transactions.picker.noCategories') }}</p>

    <ul v-else class="budget-rows">
      <li
        v-for="c in activeSection.categories"
        :key="c.id"
        class="budget-row"
        :class="{ 'budget-row--static': readOnly || !editMonthKey }"
        @click="!readOnly && editMonthKey && openEntry(c)"
      >
        <CategoryBudgetIcon :icon="c.icon" :color="c.color" :pct="pctFor(c.id)" :size="44" />
        <div class="row-main">
          <span class="row-name">{{ c.name }}</span>
          <span class="row-spent">{{ formatMoney(rolledTotals[c.id] ?? 0, currencyFor(c), { currencyDisplay: c.currencyDisplay }) }}</span>
          <span v-if="isAll && membersFor(c.id).length" class="row-members">
            {{ membersFor(c.id).map((m) => `${m.name}: ${formatMoney(m.amount, currencyFor(c), { currencyDisplay: c.currencyDisplay })}`).join(' · ') }}
          </span>
        </div>
        <div class="row-aside">
          <template v-if="displayBudgetAmount(c.id) > 0">
            <span class="row-remaining" :class="{ bad: isBad(c) }">
              {{ formatMoney(remainingOf(c.id), currencyFor(c), { currencyDisplay: c.currencyDisplay }) }}
            </span>
            <span class="row-caption">{{ t('budget.ofTotal', { amount: formatMoney(displayBudgetAmount(c.id), currencyFor(c), { currencyDisplay: c.currencyDisplay }) }) }}</span>
          </template>
          <template v-else>
            <span class="row-remaining row-remaining--empty">—</span>
            <span class="row-caption">{{ !readOnly && editMonthKey ? t('budget.setAmount') : '—' }}</span>
          </template>
        </div>
      </li>
    </ul>
  </Segmented>

  <AmountEntryModal
    :open="showEntry"
    :title="activeCategory?.name ?? ''"
    :initial-value="entryInitialValue"
    :currency="entryCurrency"
    :currency-display="activeCategory?.currencyDisplay"
    :label="t('categories.detail.monthlyBudget')"
    :accent-color="activeCategory?.color"
    @close="showEntry = false"
    @confirm="handleEntryConfirm"
  >
    <div v-if="quickSuggestions.length" class="quick-row">
      <button
        v-for="s in quickSuggestions"
        :key="s.key"
        type="button"
        class="quick-btn"
        @click="quickApply(s.amount)"
      >
        <span class="quick-title">{{ s.label }}</span>
        <span class="quick-sub">{{ formatMoney(s.amount, entryCurrency, { currencyDisplay: activeCategory?.currencyDisplay }) }}</span>
      </button>
    </div>
  </AmountEntryModal>
</template>

<style lang="scss" scoped>
.plan-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.plan-item {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.plan-label {
  font-size: 11px;
  color: var(--text-muted);
}

.plan-value {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--income);
  @include lineClamp(1);
}

.plan-value.bad {
  color: var(--expense);
}

.kind-toggle {
  max-width: 260px;
  margin: 0 auto 16px;
}

.copy-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-bottom: 14px;
  cursor: pointer;
  @include transition();
}

.copy-banner:disabled {
  opacity: 0.6;
  cursor: default;
}

.copy-result {
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 0 0 14px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 6px;
}

.section-header.expense {
  background: color-mix(in srgb, var(--expense) 14%, transparent);
}

.section-header.income {
  background: color-mix(in srgb, var(--income) 14%, transparent);
}

.section-header-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
}

.section-subtitle {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.section-header-aside {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.section-remaining {
  font-size: 19px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--income);
}

.section-remaining.bad {
  color: var(--expense);
}

.section-caption {
  font-size: 11.5px;
  color: var(--text-muted);
}

.budget-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.budget-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  @include transition();

  @include hover() {
    background: var(--surface-2);
  }
}

.budget-row--static {
  cursor: default;

  @include hover() {
    background: none;
  }
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.row-name {
  font-size: 14px;
  font-weight: 600;
  @include lineClamp(1);
}

.row-spent {
  font-size: 12.5px;
  color: var(--text-muted);
}

.row-members {
  font-size: 11px;
  color: var(--text-muted);
  @include lineClamp(1);
}

.row-aside {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.row-remaining {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--income);
}

.row-remaining.bad {
  color: var(--expense);
}

.row-remaining--empty {
  color: var(--text-muted);
}

.row-caption {
  font-size: 11.5px;
  color: var(--text-muted);
}

.empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
  margin: 12px 0 20px;
}

// Quick-pick row injected into AmountEntryModal.vue's default slot (forwarded
// into AmountKeypad.vue's own slot) — same visual recipe as
// OperationDateModal.vue's "Сьогодні"/"Вчора" quick-date buttons.
.quick-row {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.quick-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 10px 6px;
  color: var(--text-secondary);
  cursor: pointer;
  @include transition();
}

.quick-btn:active {
  transform: scale(0.96);
}

.quick-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  @include lineClamp(1);
}

.quick-sub {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--accent);
}
</style>
