<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTransactionsStore } from '../stores/transactions'
import { useAccountsStore } from '../stores/accounts'
import { useAllAccountsStore } from '../stores/allAccounts'
import { useProfilesStore } from '../stores/profiles'
import { useCategoriesStore } from '../stores/categories'
import { useViewAsStore } from '../stores/viewAs'
import { usePeriodStore } from '../stores/period'
import { useDisplayCurrency } from '../composables/useDisplayCurrency'
import { useLatestRun } from '../composables/useLatestRun'
import IconCircle from '../components/common/IconCircle.vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import OwnerAvatar from '../components/common/OwnerAvatar.vue'
import TransactionFormModal from '../components/transactions/TransactionFormModal.vue'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import OperationsFilterModal, { type OperationsFilters } from '../components/transactions/OperationsFilterModal.vue'
import { formatMoney, dayHeader } from '../utils/format'
import { resolveAccountLabel } from '../utils/accountLabel'
import { isCrossProfileTransfer, TRANSFER_CATEGORY_COLOR } from '../utils/transferAnalytics'
import type { Profile, Transaction } from '../types/models'

const transactions = useTransactionsStore()
const accounts = useAccountsStore()
const allAccounts = useAllAccountsStore()
const profiles = useProfilesStore()
const categories = useCategoriesStore()
const viewAs = useViewAsStore()
const period = usePeriodStore()
const displayCurrency = useDisplayCurrency()
const route = useRoute()
const router = useRouter()
const readOnly = computed(() => viewAs.isReadOnly)

// Optional ?category=<id> filter, arrived from "Операції за період" in a category's detail sheet.
const filterCategoryId = computed(() => (typeof route.query.category === 'string' ? route.query.category : null))
const filterCategory = computed(() => (filterCategoryId.value ? categories.byId(filterCategoryId.value) : null))

function clearCategoryFilter() {
  router.replace({ path: '/operations' })
}

// Optional ?account=<id> filter, arrived from "Операції" in an account's detail sheet.
const filterAccountId = computed(() => (typeof route.query.account === 'string' ? route.query.account : null))
const filterAccount = computed(() => (filterAccountId.value ? accounts.all.find((a) => a.id === filterAccountId.value) : null))

function clearAccountFilter() {
  router.replace({ path: '/operations' })
}

const showFilterModal = ref(false)
const filters = ref<OperationsFilters>({
  accountIds: [],
  types: [],
  categoryIds: [],
  minAmount: null,
  maxAmount: null,
  dateFrom: '',
  dateTo: '',
})
const hasCustomDateRange = computed(() => !!filters.value.dateFrom && !!filters.value.dateTo)
const hasActiveFilters = computed(
  () =>
    filters.value.accountIds.length > 0 ||
    filters.value.types.length > 0 ||
    filters.value.categoryIds.length > 0 ||
    filters.value.minAmount != null ||
    filters.value.maxAmount != null ||
    hasCustomDateRange.value,
)
const activeFilterCount = computed(() => {
  let n = 0
  if (filters.value.accountIds.length) n++
  if (filters.value.types.length) n++
  if (filters.value.categoryIds.length) n++
  if (filters.value.minAmount != null || filters.value.maxAmount != null) n++
  if (hasCustomDateRange.value) n++
  return n
})

function clearAllFilters() {
  filters.value = {
    accountIds: [],
    types: [],
    categoryIds: [],
    minAmount: null,
    maxAmount: null,
    dateFrom: '',
    dateTo: '',
  }
}

const effectiveStart = computed(() =>
  hasCustomDateRange.value ? new Date(filters.value.dateFrom).setHours(0, 0, 0, 0) : period.start,
)
const effectiveEnd = computed(() =>
  hasCustomDateRange.value ? new Date(filters.value.dateTo).setHours(23, 59, 59, 999) : period.end,
)

const periodTransactions = computed(() => {
  let list = transactions.forPeriod(effectiveStart.value, effectiveEnd.value)
  if (filterCategoryId.value) {
    list = list.filter((t) => t.categoryId === filterCategoryId.value || t.subcategoryId === filterCategoryId.value)
  }
  if (filterAccountId.value) {
    list = list.filter((t) => t.accountId === filterAccountId.value || t.toAccountId === filterAccountId.value)
  }
  if (filters.value.accountIds.length) {
    list = list.filter((t) => filters.value.accountIds.includes(t.accountId) || (t.toAccountId && filters.value.accountIds.includes(t.toAccountId)))
  }
  if (filters.value.types.length) {
    list = list.filter((t) => filters.value.types.includes(t.type))
  }
  if (filters.value.categoryIds.length) {
    // A selected top-level category matches every transaction under it
    // (including subcategories) since `t.categoryId` always holds the
    // top-level id; a selected subcategory narrows to just that one.
    list = list.filter(
      (t) =>
        (t.categoryId && filters.value.categoryIds.includes(t.categoryId)) ||
        (t.subcategoryId && filters.value.categoryIds.includes(t.subcategoryId)),
    )
  }
  if (filters.value.minAmount != null) {
    list = list.filter((t) => Math.abs(t.baseAmount) >= filters.value.minAmount!)
  }
  if (filters.value.maxAmount != null) {
    list = list.filter((t) => Math.abs(t.baseAmount) <= filters.value.maxAmount!)
  }
  return list
})

// `t.baseAmount` on a cross-profile transfer is always stored negative
// (expense-shaped) from the SENDER's perspective — see TransactionFormModal's
// `submit()`. Summing it as-is is correct for the sender, but for the
// recipient viewing the very same synced doc it silently subtracts money
// they received. Flip the sign to match whoever's being viewed, the same way
// OverviewDataView does it: an expense if they sent it, income if they
// received it. In "all" mode there's no single perspective — the transfer is
// just money moving between two family members, so it nets to 0 there.
function signedNet(t: Transaction): number {
  if (!isCrossProfileTransfer(t)) return t.baseAmount
  const uid = viewAs.effectiveUid
  if (!uid) return 0
  return Math.abs(t.baseAmount) * (t.ownerId === uid ? -1 : 1)
}

const groups = computed(() => {
  const byDay = new Map<string, Transaction[]>()
  for (const t of periodTransactions.value) {
    const key = new Date(t.date).toDateString()
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(t)
  }
  return [...byDay.entries()]
    .map(([, list]) => ({
      date: new Date(list[0].date),
      // Every operation on the same calendar day shares the same `date`
      // (day-precision only, see Transaction.date) so it can't order them —
      // newest created/edited goes first within the day instead.
      list: [...list].sort((a, b) => b.updatedAt - a.updatedAt),
      net: list.reduce((s, t) => s + signedNet(t), 0),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
})

const initialBalance = ref<number | null>(null)
const finalBalance = ref<number | null>(null)
const balanceGuard = useLatestRun()
watchEffect(async () => {
  const run = balanceGuard.start()
  const [initial, final] = await Promise.all([
    accounts.totalBalanceInBase(displayCurrency.code, effectiveStart.value - 1),
    accounts.totalBalanceInBase(displayCurrency.code, effectiveEnd.value),
  ])
  if (!balanceGuard.isCurrent(run)) return // a newer recompute started meanwhile — discard
  initialBalance.value = initial
  finalBalance.value = final
})

function rowMeta(t: Transaction) {
  if (t.type === 'transfer') {
    const from = resolveAccountLabel(t.accountId, viewAs.effectiveUid, allAccounts.all, profiles.all)
    const to = resolveAccountLabel(t.toAccountId, viewAs.effectiveUid, allAccounts.all, profiles.all)
    return {
      icon: 'mdiSwapHorizontal',
      color: TRANSFER_CATEGORY_COLOR,
      title: 'Переказ',
      subtitle: `${from} → ${to}`,
      amountClass: 'transfer',
      // Both endpoints (possibly two different people) are already spelled
      // out in the subtitle above — a single corner badge would misattribute
      // a cross-profile transfer to whichever owner happened to be picked.
      owner: null as Profile | null,
    }
  }
  const category = categories.byId(t.categoryId)
  const sub = categories.byId(t.subcategoryId ?? undefined)
  const account = allAccounts.byId(t.accountId)
  const title = category ? (sub ? `${category.name} (${sub.name})` : category.name) : '—'
  return {
    icon: sub?.icon ?? category?.icon ?? 'mdiHelpCircleOutline',
    color: sub?.color ?? category?.color ?? '#9a9a9e',
    title,
    subtitle: account?.name ?? '',
    amountClass: t.type === 'expense' ? 'expense' : 'income',
    // "All" mode mixes every family member's operations in one list — badge
    // whose it is. Outside that mode there's only ever one owner in view, so
    // it would be redundant.
    owner: viewAs.mode === 'all' ? (profiles.byId(account?.ownerId) ?? null) : null,
  }
}

/** For an operation in a different currency than what's currently displayed, the equivalent shown in parentheses. */
function convertedLabel(t: Transaction): string | null {
  if (t.type === 'transfer' || t.currency === displayCurrency.code) return null
  const prefix = t.type === 'expense' ? '-' : '+'
  return `(${prefix}${formatMoney(Math.abs(displayCurrency.convert(t.baseAmount)), displayCurrency.code)})`
}

const showForm = ref(false)
const editingTransaction = ref<Transaction | null>(null)
const confirmDelete = ref<Transaction | null>(null)

function openCreate() {
  editingTransaction.value = null
  showForm.value = true
}
function openEdit(t: Transaction) {
  editingTransaction.value = t
  showForm.value = true
}
function handleDeleteRequest() {
  if (!editingTransaction.value) return
  confirmDelete.value = editingTransaction.value
  showForm.value = false
}
async function handleDeleteConfirmed() {
  if (!confirmDelete.value) return
  await transactions.remove(confirmDelete.value.id)
  confirmDelete.value = null
}
</script>

<template>
  <div class="filter-row">
    <div v-if="filterCategory" class="filter-chip">
      <IconCircle :icon="filterCategory.icon" :color="filterCategory.color" :size="24" />
      <span>Фільтр: {{ filterCategory.name }}</span>
      <button class="clear-filter" aria-label="Прибрати фільтр" @click="clearCategoryFilter">✕</button>
    </div>
    <div v-if="filterAccount" class="filter-chip">
      <IconCircle :icon="filterAccount.icon" :color="filterAccount.color" :size="24" />
      <span>Рахунок: {{ filterAccount.name }}</span>
      <button class="clear-filter" aria-label="Прибрати фільтр" @click="clearAccountFilter">✕</button>
    </div>
    <div v-if="hasActiveFilters" class="filter-chip">
      <MdiIcon name="mdiFilterVariant" :size="16" color="var(--accent)" />
      <span>Фільтрів: {{ activeFilterCount }}</span>
      <button class="clear-filter" aria-label="Скинути фільтри" @click="clearAllFilters">✕</button>
    </div>
    <button class="filter-btn" @click="showFilterModal = true">
      <MdiIcon name="mdiTune" :size="18" />
      <span>Фільтри</span>
    </button>
  </div>

  <div class="balance-bar">
    <div class="cell">
      <span class="label">Початковий баланс</span>
      <span class="value income">{{ initialBalance === null ? '…' : formatMoney(initialBalance, displayCurrency.code) }}</span>
    </div>
    <div class="cell">
      <span class="label">Кінцевий баланс</span>
      <span class="value" :class="{ negative: (finalBalance ?? 0) < 0 }">
        {{ finalBalance === null ? '…' : formatMoney(finalBalance, displayCurrency.code) }}
      </span>
    </div>
  </div>

  <div v-if="!groups.length" class="empty">
    {{
      filterCategory
        ? 'Операцій по цій категорії за цей період ще немає.'
        : filterAccount
          ? 'Операцій по цьому рахунку за цей період ще немає.'
          : 'Операцій за цей період ще немає.'
    }}
  </div>

  <div v-for="group in groups" :key="group.date.toDateString()" class="day-group">
    <div class="day-heading">
      <div class="day-num-col">
        <span class="day-num">{{ dayHeader(group.date).day }}</span>
      </div>
      <div class="day-label-col">
        <span class="weekday">{{ dayHeader(group.date).weekday }}</span>
        <span class="monthyear">{{ dayHeader(group.date).monthYear }}</span>
      </div>
      <span class="day-total" :class="{ negative: group.net < 0 }">
        {{ formatMoney(Math.abs(displayCurrency.convert(group.net)), displayCurrency.code) }}
      </span>
    </div>

    <TransitionGroup tag="div" name="tx-row" class="tx-list">
      <button
        v-for="t in group.list"
        :key="t.id"
        class="row"
        :class="{ 'row--static': readOnly }"
        @click="!readOnly && openEdit(t)"
      >
        <div class="row-icon-wrap">
          <IconCircle :icon="rowMeta(t).icon" :color="rowMeta(t).color" :size="44" />
          <span v-if="rowMeta(t).owner" class="owner-badge">
            <OwnerAvatar :profile="rowMeta(t).owner!" :size="18" />
          </span>
          <span
            v-if="transactions.isPending(t.id)"
            class="pending-badge"
            title="Очікує синхронізації"
            aria-label="Очікує синхронізації"
          >
            <MdiIcon name="mdiClockOutline" :size="11" color="#fff" />
          </span>
        </div>
        <div class="row-text">
          <span class="row-title">{{ rowMeta(t).title }}</span>
          <span class="row-sub">{{ rowMeta(t).subtitle }}</span>
          <span v-if="t.note" class="row-note">{{ t.note }}</span>
        </div>
        <span class="row-amount-col">
          <span class="row-amount" :class="rowMeta(t).amountClass">
            {{ t.type === 'expense' ? '-' : t.type === 'income' ? '+' : '' }}{{ formatMoney(t.amount, t.currency) }}
          </span>
          <span v-if="convertedLabel(t)" class="row-converted">{{ convertedLabel(t) }}</span>
        </span>
      </button>
    </TransitionGroup>
  </div>

  <!-- Teleported to <body>: position:fixed only escapes the page-transition's
       transform (App.vue animates route roots with `transform`) if the fab
       isn't a descendant of the transformed element — otherwise that
       transform makes it fixed's containing block, and the fab briefly
       renders at the transformed box's edges before snapping to its real
       viewport-fixed spot once the transition ends. -->
  <Teleport to="body">
    <button v-if="!readOnly" class="fab" aria-label="Додати операцію" @click="openCreate">
      <MdiIcon name="mdiPlus" :size="26" color="#fff" />
    </button>
  </Teleport>

  <TransactionFormModal
    v-if="showForm"
    :transaction="editingTransaction"
    :preset-category-id="!editingTransaction && filterCategoryId ? filterCategoryId : undefined"
    @close="showForm = false"
    @saved="showForm = false"
    @duplicated="showForm = false"
    @deleted="handleDeleteRequest"
  />

  <ConfirmDialog
    v-if="confirmDelete"
    title="Видалити операцію?"
    message="Цю операцію буде видалено безповоротно."
    confirm-label="Видалити"
    danger
    @close="confirmDelete = null"
    @confirm="handleDeleteConfirmed"
  />

  <OperationsFilterModal
    v-if="showFilterModal"
    v-model="filters"
    @close="showFilterModal = false"
  />
</template>

<style scoped>
.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--radius-pill);
  padding: 6px 8px 6px 6px;
  box-shadow: var(--shadow-sm);
  font-size: 13px;
  font-weight: 600;
  width: fit-content;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-pill);
  padding: 8px 14px;
  box-shadow: var(--shadow-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.clear-filter {
  border: none;
  background: var(--surface-2);
  color: var(--text-secondary);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}

.balance-bar {
  display: flex;
  background: var(--surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}

.balance-bar .cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  text-align: center;
}

.balance-bar .cell:first-child {
  border-right: 1px solid var(--border);
}

.balance-bar .label {
  font-size: 11px;
  color: var(--text-muted);
}

.balance-bar .value {
  font-size: 15px;
  font-weight: 700;
  color: var(--income);
}

.balance-bar .value.negative {
  color: var(--expense);
}

.empty {
  text-align: center;
  color: var(--text-muted);
  margin-top: 40px;
  font-size: 14px;
}

.day-group {
  margin-bottom: 6px;
}

.tx-list {
  position: relative;
}

.day-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 4px 8px;
}

.day-num-col {
  width: 30px;
  text-align: center;
}

.day-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-secondary);
}

.day-label-col {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.weekday {
  font-size: 10.5px;
  color: var(--text-muted);
  letter-spacing: 0.03em;
}

.monthyear {
  font-size: 10.5px;
  color: var(--text-muted);
  letter-spacing: 0.03em;
}

.day-total {
  font-size: 14px;
  font-weight: 700;
  color: var(--income);
}

.day-total.negative {
  color: var(--expense);
}

.tx-row-move,
.tx-row-enter-active,
.tx-row-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.tx-row-enter-from,
.tx-row-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.tx-row-leave-active {
  position: absolute;
  width: 100%;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-bottom: 6px;
  cursor: pointer;
  text-align: left;
}

.row--static {
  cursor: default;
}

.row-icon-wrap {
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

.owner-badge {
  position: absolute;
  bottom: -2px;
  left: -2px;
}

.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.row-title {
  font-size: 14.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.row-note {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.row-amount-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex-shrink: 0;
}

.row-amount {
  font-size: 14.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.row-amount.expense {
  color: var(--expense);
}
.row-amount.income {
  color: var(--income);
}
.row-amount.transfer {
  color: var(--transfer);
}

.row-converted {
  font-size: 11.5px;
  color: var(--text-muted);
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
