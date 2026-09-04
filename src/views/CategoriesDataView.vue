<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import { useCategoriesStore } from '../stores/categories'
import { useTransactionsStore } from '../stores/transactions'
import { useBudgetsStore } from '../stores/budgets'
import { usePeriodStore } from '../stores/period'
import { useSettingsStore } from '../stores/settings'
import { useViewAsStore } from '../stores/viewAs'
import { usePopupsStore } from '../stores/popups'
import { useBaseCurrency } from '../composables/useBaseCurrency'
import SpendingRing from '../components/categories/SpendingRing.vue'
import CategoryTile from '../components/categories/CategoryTile.vue'
import CategoryFormModal from '../components/categories/CategoryFormModal.vue'
import CategoryDetailModal from '../components/categories/CategoryDetailModal.vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { isCrossProfileTransfer, transferCategoryLabel, TRANSFER_CATEGORY_ICON, TRANSFER_CATEGORY_COLOR } from '../utils/transferAnalytics'
import { budgetProgress, type BudgetProgress } from '../utils/budget'
import { formatMoney } from '../utils/format'
import { resolveCategoryCurrency } from '../utils/currencies'
import { categoryCurrencyAmount } from '../utils/transactionAmounts'
import { pinLeavingRect, snapshotListRects } from '../utils/listTransition'
import { t } from '../i18n'
import type { Category, CategoryKind } from '../types/models'

const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const budgets = useBudgetsStore()
const period = usePeriodStore()
const settings = useSettingsStore()
const viewAs = useViewAsStore()
const popups = usePopupsStore()
const router = useRouter()
const baseCurrency = useBaseCurrency()
const readOnly = computed(() => viewAs.isReadOnly)

const kind = ref<CategoryKind>('expense')

const periodTransactions = computed(() => transactions.forPeriod(period.start, period.end))

// The uid a cross-profile transfer is being judged "sent" vs "received" from
// — the profile currently being browsed (self by default). In "Всі" mode
// there's no single perspective left to sort by, so cross-profile transfers
// are excluded there entirely (they're just money moving within the family,
// not a real expense/income for the household as a whole).
const perspectiveUid = computed(() => (viewAs.mode === 'all' ? null : viewAs.effectiveUid))

// Cross-profile transfers count as income/expense here too (same-profile
// ones stay excluded) — see utils/transferAnalytics.ts. A transfer has no
// category of its own, so there's no "its own currency" to show this in —
// always normalized live to the base currency, same as expenseTotal/incomeTotal below.
const crossProfileTransferExpense = computed(() => {
  if (!perspectiveUid.value) return 0
  return periodTransactions.value
    .filter((t) => isCrossProfileTransfer(t) && t.ownerId === perspectiveUid.value)
    .reduce((s, t) => s + baseCurrency.toBase(Math.abs(t.amount), t.currency), 0)
})
const crossProfileTransferIncome = computed(() => {
  if (!perspectiveUid.value) return 0
  return periodTransactions.value
    .filter((t) => isCrossProfileTransfer(t) && t.ownerId !== perspectiveUid.value)
    .reduce((s, t) => s + baseCurrency.toBase(Math.abs(t.amount), t.currency), 0)
})
const transferTileAmount = computed(() =>
  kind.value === 'expense' ? crossProfileTransferExpense.value : crossProfileTransferIncome.value,
)

/**
 * categoryId/subcategoryId -> summed amount for the active period, in that
 * category's OWN currency (not normalized to the base currency — see
 * utils/transactionAmounts.ts's categoryCurrencyAmount). Every subcategory
 * shares its top-level parent's currency (see types/models.ts's Category),
 * so a rolled-up sum below is always one consistent currency.
 */
const directTotals = computed(() => {
  const map: Record<string, number> = {}
  for (const t of periodTransactions.value) {
    const id = t.subcategoryId ?? t.categoryId
    if (!id) continue
    // Currency resolved from the TOP-LEVEL category (`t.categoryId`) even for
    // a subcategory total — a subcategory never carries its own currency
    // (see types/models.ts's Category), so resolving off `id` directly would
    // wrongly fall back to the base currency for one.
    const categoryCurrency = resolveCategoryCurrency(categories.byId(t.categoryId), settings.baseCurrency, transactions.all)
    map[id] = (map[id] ?? 0) + categoryCurrencyAmount(t, categoryCurrency, baseCurrency.toBase)
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

// Base-currency-normalized counterparts — needed anywhere categories of
// DIFFERENT currencies must be compared/summed as one figure (the ring's
// slice proportions, its center total): rolledTotals above is intentionally
// NOT this, since Categories otherwise shows each category in its own
// currency (see categoryCurrencyAmount's doc comment).
const baseDirectTotals = computed(() => {
  const map: Record<string, number> = {}
  for (const t of periodTransactions.value) {
    const id = t.subcategoryId ?? t.categoryId
    if (!id) continue
    map[id] = (map[id] ?? 0) + baseCurrency.toBase(Math.abs(t.amount), t.currency)
  }
  return map
})
const baseRolledTotals = computed(() => {
  const map: Record<string, number> = { ...baseDirectTotals.value }
  for (const top of categories.all.filter((c) => c.parentId === null)) {
    const kids = categories.childrenOf(top.id, true)
    const kidsSum = kids.reduce((s, k) => s + (baseDirectTotals.value[k.id] ?? 0), 0)
    map[top.id] = (map[top.id] ?? 0) + kidsSum
  }
  return map
})

const expenseTotal = computed(
  () =>
    periodTransactions.value.filter((t) => t.type === 'expense').reduce((s, t) => s + baseCurrency.toBase(Math.abs(t.amount), t.currency), 0) +
    crossProfileTransferExpense.value,
)
const incomeTotal = computed(
  () =>
    periodTransactions.value.filter((t) => t.type === 'income').reduce((s, t) => s + baseCurrency.toBase(t.amount, t.currency), 0) +
    crossProfileTransferIncome.value,
)

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
  // Budgets are denominated in the category's own currency (see
  // CategoryDetailModal.vue's saveBudget), same as `rolledTotals` above.
  const category = categories.byId(categoryId)
  const currency = resolveCategoryCurrency(category, settings.baseCurrency, transactions.all)
  const opts = { currencyDisplay: category?.currencyDisplay }
  return t('categories.budgetLabel', { spent: formatMoney(p.spent, currency, opts), amount: formatMoney(p.amount, currency, opts) })
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
    .map((c) => ({ id: c.id, name: c.name, color: c.color, amount: baseRolledTotals.value[c.id] ?? 0 }))
  const transferAmount = kind.value === 'expense' ? crossProfileTransferExpense.value : crossProfileTransferIncome.value
  if (transferAmount > 0) {
    segs.push({ id: '__transfers__', name: transferCategoryLabel(), color: TRANSFER_CATEGORY_COLOR, amount: transferAmount })
  }
  return segs.sort((a, b) => b.amount - a.amount)
})

const visibleTop = computed(() => categories.topLevel(kind.value))

// Archived top-level categories, shown collapsed below the active grid so
// they stay reachable (to unarchive or inspect past spend) without cluttering
// the main list — same pattern as AccountsView's "Архівовані рахунки".
const showArchived = ref(false)
const archivedTop = computed(() =>
  categories.topLevel(kind.value, true).filter((c) => c.archived),
)

// Snapshots every tile's rect right before Vue touches the DOM, so
// pinLeavingRect (see listTransition.ts) has a pre-removal rect to pin a
// leaving tile to even when several tiles leave in the same patch (e.g.
// toggling Витрати/Доходи swaps the whole grid at once). This can't be an
// `onBeforeUpdate` on this component: the `v-for` lives inside
// TransitionGroup's slot, so the reactive read of `visibleTop` is tracked by
// TransitionGroup's own render effect, not this component's — this
// component's `onBeforeUpdate` simply never fires for it. `watch` (default
// "pre" flush) subscribes directly to the sources instead, so it fires
// before any DOM patch regardless of which component's render effect ends
// up owning the dependency.
const tileGroupRef = ref<ComponentPublicInstance | null>(null)
watch([visibleTop, transferTileAmount], () => snapshotListRects(tileGroupRef.value?.$el))

// --- modals ---
const showForm = ref(false)
const formCategory = ref<Category | null>(null)
const formDefaultParent = ref<string | null>(null)
const detailCategory = ref<Category | null>(null)

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
  const category = formCategory.value
  if (!category) return
  showForm.value = false
  popups.confirmDialog({
    title: t('categories.deleteTitle'),
    message: t('categories.deleteMessage', { name: category.name }),
    confirmLabel: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      await categories.remove(category.id)
      await transactions.load()
      popups.closeConfirm()
    },
  })
}

function openOperationsFiltered(category: Category) {
  detailCategory.value = null
  router.push({ path: '/operations', query: { category: category.id } })
}

function openAddOperation(category: Category) {
  detailCategory.value = null
  popups.openTransactionForm({ presetCategoryId: category.id })
}
</script>

<template>
  <div class="kind-toggle segmented">
    <button :class="{ active: kind === 'expense' }" @click="kind = 'expense'">{{ t('categories.expense') }}</button>
    <button :class="{ active: kind === 'income' }" @click="kind = 'income'">{{ t('categories.income') }}</button>
  </div>

  <SpendingRing
    :segments="ringSegments"
    :expense-total="expenseTotal"
    :income-total="incomeTotal"
    :currency="settings.baseCurrency"
    :kind="kind"
  />

  <TransitionGroup ref="tileGroupRef" tag="div" name="tile" class="grid" @before-leave="pinLeavingRect">
    <CategoryTile
      v-for="c in visibleTop"
      :key="c.id"
      :name="c.name"
      :icon="c.icon"
      :color="c.color"
      :amount="rolledTotals[c.id] ?? 0"
      :currency="resolveCategoryCurrency(c, settings.baseCurrency, transactions.all)"
      :currency-display="c.currencyDisplay"
      :budget="budgetProgressByCategory[c.id] ?? null"
      :budget-label="budgetLabel(c.id)"
      @click="openDetail(c)"
    />
    <CategoryTile
      v-if="transferTileAmount > 0"
      key="__transfers__"
      :name="transferCategoryLabel()"
      :icon="TRANSFER_CATEGORY_ICON"
      :color="TRANSFER_CATEGORY_COLOR"
      :amount="transferTileAmount"
      :currency="settings.baseCurrency"
      @click="router.push('/operations')"
    />
  </TransitionGroup>

  <div v-if="archivedTop.length" class="archived-section">
    <button class="archived-toggle" @click="showArchived = !showArchived">
      <MdiIcon :name="showArchived ? 'mdiChevronUp' : 'mdiChevronDown'" :size="18" />
      {{ t('categories.archivedToggle', { count: archivedTop.length }) }}
    </button>
    <div v-if="showArchived" class="grid">
      <CategoryTile
        v-for="c in archivedTop"
        :key="c.id"
        :name="c.name"
        :icon="c.icon"
        :color="c.color"
        :amount="rolledTotals[c.id] ?? 0"
        :currency="resolveCategoryCurrency(c, settings.baseCurrency, transactions.all)"
        :currency-display="c.currencyDisplay"
        :budget="budgetProgressByCategory[c.id] ?? null"
        :budget-label="budgetLabel(c.id)"
        @click="openDetail(c)"
      />
    </div>
  </div>

  <!-- Teleported to <body>: position:fixed only escapes the page-transition's
       transform (App.vue animates route roots with `transform`) if the fab
       isn't a descendant of the transformed element — otherwise that
       transform makes it fixed's containing block, and the fab briefly
       renders at the transformed box's edges before snapping to its real
       viewport-fixed spot once the transition ends. -->
  <Teleport to="body">
    <button v-if="!readOnly" class="fab" :aria-label="t('categories.addCategoryAria')" @click="openCreate">
      <MdiIcon name="mdiPlus" :size="26" color="#fff" />
    </button>
  </Teleport>

  <CategoryFormModal
    :open="showForm"
    :category="formCategory"
    :default-kind="kind"
    :default-parent-id="formDefaultParent"
    @close="showForm = false"
    @saved="handleCategorySaved"
    @archived="handleArchive"
    @deleted="handleDeleteRequest"
  />

  <CategoryDetailModal
    :open="!!detailCategory"
    :category="detailCategory"
    :totals="rolledTotals"
    :currency="resolveCategoryCurrency(detailCategory, settings.baseCurrency, transactions.all)"
    :readonly="readOnly"
    @close="detailCategory = null"
    @edit="openEditFromDetail"
    @add-subcategory="openAddSubcategory"
    @editSubcategory="openEditFromDetail"
    @view-operations="openOperationsFiltered"
    @add-operation="openAddOperation"
  />
</template>

<style lang="scss" scoped>
.kind-toggle {
  max-width: 260px;
  margin: 0px auto;
}

.grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, 85px);
  justify-content: space-around;
  justify-items: center;
  align-items: center;
  align-content: center;
  gap: 14px 3px;
}

.tile-move,
.tile-enter-active,
.tile-leave-active {
  @include transition();
}
.tile-enter-from,
.tile-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
.tile-leave-active {
  /* position/size are pinned inline by pinLeavingRect() before this class
     applies — see @before-leave on the TransitionGroup above. */
  position: absolute;
}

.archived-section {
  margin-top: 24px;
}

.archived-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 4px;
}

.fab {
  position: fixed;
  right: 24px;
  bottom: 32px;
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
  @include transition();
}

.fab:active {
  transform: scale(0.9);
}

@include laptop() {
  .fab {
    /* 84px clearance above .bottom-nav, plus the iOS home-indicator inset
     that .bottom-nav's own padding already grows by — without it the fab
     sits lower than the nav bar's real (safe-area-inflated) height and its
     bottom half renders underneath the bar on notched iOS PWAs. */
    bottom: calc(84px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
