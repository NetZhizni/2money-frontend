<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCategoriesStore } from '../stores/categories'
import { useTransactionsStore } from '../stores/transactions'
import { useBudgetsStore } from '../stores/budgets'
import { usePeriodStore } from '../stores/period'
import { useSettingsStore } from '../stores/settings'
import { useAuthStore } from '../stores/auth'
import { useDisplayCurrency } from '../composables/useDisplayCurrency'
import SpendingRing from '../components/categories/SpendingRing.vue'
import CategoryTile from '../components/categories/CategoryTile.vue'
import CategoryFormModal from '../components/categories/CategoryFormModal.vue'
import CategoryDetailModal from '../components/categories/CategoryDetailModal.vue'
import TransactionFormModal from '../components/transactions/TransactionFormModal.vue'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { isCrossProfileTransfer, TRANSFER_CATEGORY_LABEL, TRANSFER_CATEGORY_ICON, TRANSFER_CATEGORY_COLOR } from '../utils/transferAnalytics'
import { budgetProgress, type BudgetProgress } from '../utils/budget'
import { formatMoney } from '../utils/format'
import type { Category, CategoryKind } from '../types/models'

const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const budgets = useBudgetsStore()
const period = usePeriodStore()
const settings = useSettingsStore()
const authStore = useAuthStore()
const router = useRouter()
const displayCurrency = useDisplayCurrency()

const kind = ref<CategoryKind>('expense')

const periodTransactions = computed(() => transactions.forPeriod(period.start, period.end))

// Cross-profile transfers count as income/expense here too (same-profile
// ones stay excluded) — see utils/transferAnalytics.ts.
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
const transferTileAmount = computed(() =>
  kind.value === 'expense' ? crossProfileTransferExpense.value : crossProfileTransferIncome.value,
)

/** categoryId/subcategoryId -> summed |baseAmount| for the active period (analytics always run in base currency). */
const directTotals = computed(() => {
  const map: Record<string, number> = {}
  for (const t of periodTransactions.value) {
    const id = t.subcategoryId ?? t.categoryId
    if (!id) continue
    map[id] = (map[id] ?? 0) + Math.abs(t.baseAmount)
  }
  return map
})

/** Rolled up: a top-level category's total includes all its subcategories. */
const rolledTotals = computed(() => {
  const map: Record<string, number> = { ...directTotals.value }
  for (const top of categories.all.filter((c) => c.parentId === null)) {
    const kids = categories.childrenOf(top.id, true)
    const kidsSum = kids.reduce((s, k) => s + (directTotals.value[k.id] ?? 0), 0)
    map[top.id] = (map[top.id] ?? 0) + kidsSum
  }
  return map
})

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

// Display-currency-converted counterparts, used only for what's actually
// rendered — proportions (ring arcs, budget %) stay computed from the raw
// base-currency totals above, since uniform scaling never changes a ratio.
const displayRolledTotals = computed(() => {
  const map: Record<string, number> = {}
  for (const [id, amount] of Object.entries(rolledTotals.value)) map[id] = displayCurrency.convert(amount)
  return map
})
const displayExpenseTotal = computed(() => displayCurrency.convert(expenseTotal.value))
const displayIncomeTotal = computed(() => displayCurrency.convert(incomeTotal.value))

// Budgets are always monthly, so a category's spend-vs-budget % only makes
// sense against a single month's total — comparing a year/all-time total to
// a one-month limit would read as permanently "over budget". Empty outside
// the month granularity rather than showing a misleading number.
const budgetProgressByCategory = computed<Record<string, BudgetProgress>>(() => {
  const map: Record<string, BudgetProgress> = {}
  if (period.granularity !== 'month') return map
  for (const b of budgets.all) {
    const p = budgetProgress(rolledTotals.value[b.categoryId] ?? 0, b.amount)
    if (p) map[b.categoryId] = p
  }
  return map
})

function budgetLabel(categoryId: string): string | undefined {
  const p = budgetProgressByCategory.value[categoryId]
  if (!p) return undefined
  return `Бюджет: ${formatMoney(p.spent, settings.baseCurrency)} з ${formatMoney(p.amount, settings.baseCurrency)}`
}

// Includes archived categories too (via includeArchived=true) — archiving only
// hides a category from active pickers, it must never make the ring's slices
// stop summing to the total shown in its center. Follows the active
// Витрати/Доходи toggle — a cross-profile transfer has no real category, so
// it gets its own slice too, on whichever side (sent = expense, received =
// income) it actually counts on — otherwise the ring would visibly
// under-represent the active kind's total.
const ringSegments = computed(() => {
  const segs = categories
    .topLevel(kind.value, true)
    .map((c) => ({ id: c.id, name: c.name, color: c.color, amount: rolledTotals.value[c.id] ?? 0 }))
  const transferAmount = kind.value === 'expense' ? crossProfileTransferExpense.value : crossProfileTransferIncome.value
  if (transferAmount > 0) {
    segs.push({ id: '__transfers__', name: TRANSFER_CATEGORY_LABEL, color: TRANSFER_CATEGORY_COLOR, amount: transferAmount })
  }
  return segs.sort((a, b) => b.amount - a.amount)
})

const visibleTop = computed(() => categories.topLevel(kind.value))

// --- modals ---
const showForm = ref(false)
const formCategory = ref<Category | null>(null)
const formDefaultParent = ref<string | null>(null)
const detailCategory = ref<Category | null>(null)
const confirmDelete = ref<Category | null>(null)

function openCreate() {
  formCategory.value = null
  formDefaultParent.value = null
  showForm.value = true
}

function openDetail(c: Category) {
  detailCategory.value = c
}

function openEditFromDetail(c: Category) {
  detailCategory.value = null
  formCategory.value = c
  formDefaultParent.value = null
  showForm.value = true
}

function openAddSubcategory(parent: Category) {
  detailCategory.value = null
  formCategory.value = null
  formDefaultParent.value = parent.id
  showForm.value = true
}

/**
 * After creating (not editing) a category, jump straight to its detail sheet —
 * proves the create actually worked, and lets the user immediately add
 * subcategories/operations.
 */
function handleCategorySaved(saved: Category) {
  showForm.value = false
  const wasCreate = !formCategory.value
  formCategory.value = null
  if (!wasCreate) return
  if (kind.value !== saved.kind) kind.value = saved.kind
  if (saved.parentId) {
    const parent = categories.byId(saved.parentId)
    if (parent) detailCategory.value = parent
  } else {
    detailCategory.value = saved
  }
}

async function handleArchive() {
  if (!formCategory.value) return
  await categories.setArchived(formCategory.value.id, !formCategory.value.archived)
  showForm.value = false
}

function handleDeleteRequest() {
  if (!formCategory.value) return
  confirmDelete.value = formCategory.value
  showForm.value = false
}

async function handleDeleteConfirmed() {
  if (!confirmDelete.value) return
  await categories.remove(confirmDelete.value.id)
  await transactions.load()
  confirmDelete.value = null
}

const showTxForm = ref(false)
const txPresetCategoryId = ref<string | undefined>(undefined)

function openOperationsFiltered(category: Category) {
  detailCategory.value = null
  router.push({ path: '/operations', query: { category: category.id } })
}

function openAddOperation(category: Category) {
  detailCategory.value = null
  txPresetCategoryId.value = category.id
  showTxForm.value = true
}
</script>

<template>
  <SpendingRing
    :segments="ringSegments"
    :expense-total="displayExpenseTotal"
    :income-total="displayIncomeTotal"
    :currency="displayCurrency.code"
    :kind="kind"
  />

  <div class="kind-toggle segmented">
    <button :class="{ active: kind === 'expense' }" @click="kind = 'expense'">Витрати</button>
    <button :class="{ active: kind === 'income' }" @click="kind = 'income'">Доходи</button>
  </div>

  <TransitionGroup tag="div" name="tile" class="grid">
    <CategoryTile
      v-for="c in visibleTop"
      :key="c.id"
      :name="c.name"
      :icon="c.icon"
      :color="c.color"
      :amount="displayRolledTotals[c.id] ?? 0"
      :currency="displayCurrency.code"
      :budget="budgetProgressByCategory[c.id] ?? null"
      :budget-label="budgetLabel(c.id)"
      @click="openDetail(c)"
    />
    <CategoryTile
      v-if="transferTileAmount > 0"
      key="__transfers__"
      :name="TRANSFER_CATEGORY_LABEL"
      :icon="TRANSFER_CATEGORY_ICON"
      :color="TRANSFER_CATEGORY_COLOR"
      :amount="displayCurrency.convert(transferTileAmount)"
      :currency="displayCurrency.code"
      @click="router.push('/operations')"
    />
  </TransitionGroup>

  <!-- Teleported to <body>: position:fixed only escapes the page-transition's
       transform (App.vue animates route roots with `transform`) if the fab
       isn't a descendant of the transformed element — otherwise that
       transform makes it fixed's containing block, and the fab briefly
       renders at the transformed box's edges before snapping to its real
       viewport-fixed spot once the transition ends. -->
  <Teleport to="body">
    <button class="fab" aria-label="Додати категорію" @click="openCreate">
      <MdiIcon name="mdiPlus" :size="26" color="#fff" />
    </button>
  </Teleport>

  <CategoryFormModal
    v-if="showForm"
    :category="formCategory"
    :default-kind="kind"
    :default-parent-id="formDefaultParent"
    @close="showForm = false"
    @saved="handleCategorySaved"
    @archived="handleArchive"
    @deleted="handleDeleteRequest"
  />

  <CategoryDetailModal
    v-if="detailCategory"
    :category="detailCategory"
    :totals="rolledTotals"
    :currency="settings.baseCurrency"
    @close="detailCategory = null"
    @edit="openEditFromDetail"
    @add-subcategory="openAddSubcategory"
    @editSubcategory="openEditFromDetail"
    @view-operations="openOperationsFiltered"
    @add-operation="openAddOperation"
  />

  <TransactionFormModal
    v-if="showTxForm"
    :preset-category-id="txPresetCategoryId"
    @close="showTxForm = false"
    @saved="showTxForm = false"
    @deleted="showTxForm = false"
  />

  <ConfirmDialog
    v-if="confirmDelete"
    title="Видалити категорію?"
    :message="`Категорію «${confirmDelete.name}» та ВСІ пов'язані з нею операції (і підкатегорій) буде видалено безповоротно.`"
    confirm-label="Видалити"
    danger
    @close="confirmDelete = null"
    @confirm="handleDeleteConfirmed"
  />
</template>

<style scoped>
.kind-toggle {
  max-width: 260px;
  margin: 20px auto 18px;
}

.grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px 4px;
}

@media (min-width: 640px) {
  .grid {
    grid-template-columns: repeat(6, 1fr);
  }
}

.tile-move,
.tile-enter-active,
.tile-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.tile-enter-from,
.tile-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
.tile-leave-active {
  position: absolute;
}

@media (min-width: 900px) {
  .grid {
    grid-template-columns: repeat(8, 1fr);
  }
}

.fab {
  position: fixed;
  right: 24px;
  bottom: 84px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 15;
  transition: transform 0.12s ease;
}

.fab:active {
  transform: scale(0.9);
}

@media (min-width: 900px) {
  .fab {
    bottom: 32px;
  }
}
</style>
