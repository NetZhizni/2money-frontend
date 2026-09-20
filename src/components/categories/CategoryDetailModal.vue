<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import AmountEntryModal from '../common/AmountEntryModal.vue'
import CategoryBudgetIcon from './CategoryBudgetIcon.vue'
import { useCategoriesStore } from '../../stores/categories'
import { useBudgetsStore } from '../../stores/budgets'
import { usePeriodStore } from '../../stores/period'
import { useSettingsStore } from '../../stores/settings'
import { useTransactionsStore } from '../../stores/transactions'
import { useBaseCurrency } from '../../composables/useBaseCurrency'
import { budgetProgress, monthKey, monthKeyFromTimestamp, parseMonthKey, shiftMonthKey, proratedBudgetAmount, roundToNiceAmount } from '../../utils/budget'
import { formatMoney, startOfMonth, endOfMonth } from '../../utils/format'
import { resolveCategoryCurrency } from '../../utils/currencies'
import { categoryCurrencyAmount } from '../../utils/transactionAmounts'
import { t, type MessageKey } from '../../i18n'
import type { Category } from '../../types/models'

// `category` is nullable because this component stays permanently mounted
// (see the `open` prop / popups pattern) — it's only ever null before the
// first open, since Modal's own `v-if="open"` never renders the slot content
// (and so never reads `category`) until a caller has set it.
const props = defineProps<{
  open: boolean
  category: Category | null
  totals: Record<string, number> // categoryId -> amount for the active period
  currency: string
  readonly?: boolean
}>()

const emit = defineEmits<{
  close: []
  edit: [Category]
  addSubcategory: [Category]
  editSubcategory: [Category]
  viewOperations: [Category]
  addOperation: [Category]
}>()

const categories = useCategoriesStore()
const budgets = useBudgetsStore()
const period = usePeriodStore()
const settings = useSettingsStore()
const transactions = useTransactionsStore()
const baseCurrency = useBaseCurrency()

const children = computed(() => (props.category ? categories.childrenOf(props.category.id, true) : []))
const total = computed(() => (props.category ? props.totals[props.category.id] ?? 0 : 0))

// The top-level category's own Settings → "Формат валюти" override, if any
// (see Category.currencyDisplay) — every amount below (this category's
// total, its budget, and each subcategory's own total) is in `currency`
// (the top-level category's), so they all share this same override; a
// subcategory never carries one of its own to read instead.
const currencyDisplay = computed(() => props.category?.currencyDisplay)

// A budget setting only ever applies to one specific calendar month (see
// types/models.ts's Budget.month) — editing always targets exactly ONE such
// month: the active month in 'month' view, or the month containing the
// specific day/week being viewed. 'year'/'all' don't resolve to a single
// month, so editing is disabled then (the amount shown is still whatever
// displayBudgetAmount below recalculates it to, just read-only) — same
// pattern as BudgetDataView.vue's own editMonthKey.
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
const previousMonthKey = computed(() => (editMonthKey.value ? shiftMonthKey(editMonthKey.value, -1) : null))

const existingBudget = computed(() =>
  props.category && editMonthKey.value ? budgets.forCategory(props.category.id, editMonthKey.value) : undefined,
)

const showBudgetEntry = ref(false)
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) showBudgetEntry.value = false
  },
)

/**
 * What to actually SHOW as the category's budget for the active period —
 * the monthly amount(s) as set (existingBudget above is the only thing that
 * ever gets edited), recalculated for whatever granularity is on screen.
 * See utils/budget.ts's proratedBudgetAmount for the actual day/week/
 * month/year/all math — shared with BudgetDataView.vue/CategoriesDataView.vue.
 */
const displayBudgetAmount = computed(() => {
  if (!props.category) return 0
  const categoryId = props.category.id
  return proratedBudgetAmount(
    period,
    (month) => budgets.forCategory(categoryId, month)?.amount ?? 0,
    () => budgets.all.filter((b) => b.categoryId === categoryId).reduce((s, b) => s + b.amount, 0),
  )
})

/** A short note on HOW displayBudgetAmount above was calculated — omitted for 'month' itself, where it's simply the amount as set, nothing to explain. */
const budgetCalcNoteKey = computed<MessageKey | null>(() => {
  switch (period.granularity) {
    case 'day':
      return 'categories.detail.budgetDayNote'
    case 'week':
      return 'categories.detail.budgetWeekNote'
    case 'year':
      return 'categories.detail.budgetYearNote'
    case 'all':
      return 'categories.detail.budgetAllNote'
    default:
      return null
  }
})

/** Shows the section whenever there's a prorated amount to display, or (failing that) editing is still possible so it's worth offering the "set a budget" placeholder. Hidden only for 'year'/'all' with nothing ever set — nothing to show, nothing to tap. */
const showBudgetSection = computed(() => displayBudgetAmount.value > 0 || (!props.readonly && !!editMonthKey.value))

const progress = computed(() => budgetProgress(total.value, displayBudgetAmount.value))

// Exceeding an EXPENSE budget is bad (overspent) but exceeding an INCOME one
// is good (earned more than planned) — the text must never flag the latter
// as a red "over" state the way it does the former. The icon itself always
// stays the category's own color regardless — see CategoryBudgetIcon.vue,
// which never turns its fill red the way BudgetFillIcon's own `over` prop can.
const isIncome = computed(() => props.category?.kind === 'income')
const badOver = computed(() => !!progress.value?.over && !isIncome.value)
const goodOver = computed(() => !!progress.value?.over && isIncome.value)

const remainingLabel = computed(() => {
  const p = progress.value
  if (!p) return ''
  const remaining = p.amount - p.spent
  const amount = formatMoney(Math.abs(remaining), props.currency, { currencyDisplay: currencyDisplay.value })
  return p.over ? t('categories.budgetOver', { amount }) : t('categories.budgetRemaining', { amount })
})

async function handleEntryConfirm(amount: number) {
  const month = editMonthKey.value
  if (!props.category || !month) return
  if (amount <= 0) {
    if (existingBudget.value) await budgets.remove(existingBudget.value.id)
    return
  }
  if (existingBudget.value) {
    await budgets.update(existingBudget.value.id, { amount, currency: props.currency })
  } else {
    await budgets.add({ categoryId: props.category.id, amount, currency: props.currency, period: 'monthly', month })
  }
}

// --- quick-pick suggestions — same idea as BudgetDataView.vue's own (see
// its own doc comment): last month's explicit budget, this month's actual so
// far, and a rounded forecast from recent spend, each offered only when it
// has something meaningful to suggest.
function rolledTotalForMonth(categoryId: string, monthStart: number, monthEnd: number): number {
  const currency = resolveCategoryCurrency(categories.byId(categoryId), settings.baseCurrency, transactions.all)
  const childIds = new Set(categories.childrenOf(categoryId, true).map((c) => c.id))
  let sum = 0
  for (const tx of transactions.forPeriod(monthStart, monthEnd)) {
    const id = tx.subcategoryId ?? tx.categoryId
    if (id !== categoryId && !(id && childIds.has(id))) continue
    sum += categoryCurrencyAmount(tx, currency, baseCurrency.toBase)
  }
  return sum
}

const FORECAST_MONTHS = 3
const forecastAmount = computed(() => {
  if (!props.category || !editMonthKey.value) return 0
  const catId = props.category.id
  const { year: baseYear, month: baseMonth } = parseMonthKey(editMonthKey.value)
  let sum = 0
  let count = 0
  for (let i = 1; i <= FORECAST_MONTHS; i++) {
    const y = baseMonth - i < 0 ? baseYear - 1 : baseYear
    const m = ((baseMonth - i) % 12 + 12) % 12
    const monthTotal = rolledTotalForMonth(catId, startOfMonth(y, m), endOfMonth(y, m))
    if (monthTotal > 0) {
      sum += monthTotal
      count++
    }
  }
  return count > 0 ? sum / count : 0
})

interface QuickSuggestion {
  key: string
  label: string
  amount: number
}

const quickSuggestions = computed<QuickSuggestion[]>(() => {
  if (!props.category || !previousMonthKey.value) return []
  const list: QuickSuggestion[] = []
  const prevBudget = budgets.forCategory(props.category.id, previousMonthKey.value)
  if (prevBudget) list.push({ key: 'previous', label: t('budget.quickPrevious'), amount: prevBudget.amount })
  if (total.value > 0) list.push({ key: 'current', label: t('budget.quickCurrent'), amount: total.value })
  const forecast = forecastAmount.value
  if (forecast > 0) {
    const rounded = roundToNiceAmount(forecast)
    if (!list.some((s) => s.amount === rounded)) list.push({ key: 'forecast', label: t('budget.quickForecast'), amount: rounded })
  }
  return list
})

// Opening the keypad with nothing set yet starts from last month's budget
// (a deliberate past decision) or, failing that, the rounded forecast —
// same priority BudgetDataView.vue's own entryInitialValue uses.
const entryInitialValue = computed(() => {
  if (existingBudget.value) return existingBudget.value.amount
  if (!props.category || !previousMonthKey.value) return null
  const prevBudget = budgets.forCategory(props.category.id, previousMonthKey.value)
  if (prevBudget) return prevBudget.amount
  const forecast = forecastAmount.value
  return forecast > 0 ? roundToNiceAmount(forecast) : null
})

/** Applies a quick-pick suggestion straight away (no extra confirm tap) and closes the popup. */
async function quickApply(amount: number) {
  await handleEntryConfirm(amount)
  showBudgetEntry.value = false
}
</script>

<template>
  <Modal :open="open" :title="t('categories.detail.title')" @close="emit('close')">
    <template v-if="category">
      <div class="head">
        <IconCircle :icon="category.icon" :color="category.color" :size="64" />
        <div class="head-text">
          <span class="name">{{ category.name }}</span>
          <span class="amount" :style="{ color: category.color }">{{ formatMoney(total, currency, { currencyDisplay }) }}</span>
        </div>
      </div>

      <div class="quick-actions">
        <button v-if="!readonly" class="btn btn-primary" @click="emit('addOperation', category)">{{ t('categories.detail.addOperation') }}</button>
        <button class="btn btn-secondary" @click="emit('viewOperations', category)">{{ t('categories.detail.operationsForPeriod') }}</button>
      </div>
      <button v-if="!readonly" class="btn btn-secondary edit-btn" @click="emit('edit', category)">{{ t('categories.detail.editCategory') }}</button>

      <div v-if="showBudgetSection" class="budget-section">
        <div class="sub-header">
          <span>{{ t('categories.detail.monthlyBudget') }}</span>
        </div>
        <div
          class="budget-view"
          :class="{ 'budget-view--static': readonly || !editMonthKey }"
          @click="!readonly && editMonthKey && (showBudgetEntry = true)"
        >
          <CategoryBudgetIcon :icon="category.icon" :color="category.color" :pct="progress?.pct" :size="48" />
          <div class="budget-info">
            <span v-if="displayBudgetAmount > 0" :class="{ bad: badOver, good: goodOver }">
              {{ t('categories.detail.spentOf', { spent: formatMoney(total, currency, { currencyDisplay }), budget: formatMoney(displayBudgetAmount, currency, { currencyDisplay }) }) }}
            </span>
            <span v-else class="budget-placeholder">{{ t('budget.setAmount') }}</span>
            <span v-if="displayBudgetAmount > 0" class="budget-remaining" :class="{ bad: badOver, good: goodOver }">{{ remainingLabel }}</span>
            <span v-if="budgetCalcNoteKey" class="budget-note">{{ t(budgetCalcNoteKey) }}</span>
          </div>
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-header">
          <span>{{ t('categories.detail.subcategories') }}</span>
          <button v-if="!readonly" class="link" @click="emit('addSubcategory', category)">{{ t('categories.detail.addSubcategory') }}</button>
        </div>
        <p v-if="!children.length" class="empty">{{ t('categories.detail.noSubcategories') }}</p>
        <ul v-else class="sub-list">
          <li
            v-for="child in children"
            :key="child.id"
            class="sub-item"
            :class="{ 'sub-item--static': readonly }"
            @click="!readonly && emit('editSubcategory', child)"
          >
            <IconCircle :icon="child.icon" :color="child.color" :size="36" />
            <span class="sub-name" :class="{ archived: child.archived }">{{ child.name }}</span>
            <span class="sub-amount" :style="{ color: child.color }">
              {{ formatMoney(totals[child.id] ?? 0, currency, { currencyDisplay }) }}
            </span>
          </li>
        </ul>
      </div>
    </template>
  </Modal>

  <AmountEntryModal
    :open="showBudgetEntry"
    :title="category?.name ?? ''"
    :initial-value="entryInitialValue"
    :currency="currency"
    :currency-display="currencyDisplay"
    :label="t('categories.detail.monthlyBudget')"
    :accent-color="category?.color"
    @close="showBudgetEntry = false"
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
        <span class="quick-sub">{{ formatMoney(s.amount, currency, { currencyDisplay }) }}</span>
      </button>
    </div>
  </AmountEntryModal>
</template>

<style lang="scss" scoped>
.head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.head-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.name {
  font-size: 17px;
  font-weight: 700;
}
.amount {
  font-size: 15px;
  font-weight: 600;
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
.sub-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.sub-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}
.link {
  border: none;
  background: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
.empty {
  color: var(--text-muted);
  font-size: 13px;
}
.sub-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sub-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  cursor: pointer;
  border-radius: var(--radius-sm);

  @include hover() {
    background: var(--surface-2);
  }
}

.sub-item--static {
  cursor: default;

  @include hover() {
    background: none;
  }
}
.sub-name {
  flex: 1;
  font-size: 14px;
}
.sub-name.archived {
  color: var(--text-muted);
  font-style: italic;
}
.sub-amount {
  font-size: 13px;
  font-weight: 600;
}

.budget-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.budget-view {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  background: none;
  padding: 4px;
  margin: -4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  @include transition();

  @include hover() {
    background: var(--surface-2);
  }
}

.budget-view--static {
  cursor: default;

  @include hover() {
    background: none;
  }
}

.budget-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: var(--text-secondary);
}

.budget-info .bad {
  color: var(--expense);
  font-weight: 600;
}

.budget-info .good {
  color: var(--income);
  font-weight: 600;
}

.budget-placeholder {
  color: var(--text-muted);
}

.budget-remaining {
  font-size: 12px;
  color: var(--text-muted);
}

.budget-remaining.bad {
  color: var(--expense);
}

.budget-remaining.good {
  color: var(--income);
}

.budget-note {
  font-size: 11px;
  color: var(--text-muted);
}

// Quick-pick row injected into AmountEntryModal.vue's default slot — see
// BudgetDataView.vue's own copy of this same recipe.
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
