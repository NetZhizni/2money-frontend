<script setup lang="ts">
  import { computed, nextTick, ref, watchEffect } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useTransactionsStore } from '../stores/transactions'
  import { useAccountsStore } from '../stores/accounts'
  import { useAllAccountsStore } from '../stores/allAccounts'
  import { useAllReceiptsStore } from '../stores/allReceipts'
  import { useProfilesStore } from '../stores/profiles'
  import { useCategoriesStore } from '../stores/categories'
  import { useViewAsStore } from '../stores/viewAs'
  import { usePeriodStore } from '../stores/period'
  import { usePopupsStore } from '../stores/popups'
  import { useSettingsStore } from '../stores/settings'
  import { useBaseCurrency } from '../composables/useBaseCurrency'
  import { useLatestRun } from '../composables/useLatestRun'
  import IconCircle from '../components/common/IconCircle.vue'
  import MdiIcon from '../components/common/MdiIcon.vue'
  import OwnerAvatar from '../components/common/OwnerAvatar.vue'
  import OperationsFilterModal, {
    type OperationsFilters,
  } from '../components/transactions/OperationsFilterModal.vue'
  import ReceiptCaptureModal from '../components/transactions/ReceiptCaptureModal.vue'
  import ReceiptGroupCard from '../components/transactions/ReceiptGroupCard.vue'
  import { useReceiptsStore } from '../stores/receipts'
  import { formatMoney, dayHeader, type CurrencyDisplayStyle } from '../utils/format'
  import { resolveAccountLabel } from '../utils/accountLabel'
  import { resolveCategoryCurrency } from '../utils/currencies'
  import { nativeSignedAmount, signedAmountInCurrency } from '../utils/transactionAmounts'
  import { TRANSFER_CATEGORY_COLOR } from '../utils/transferAnalytics'
  import { isMergeable as isMergeableTx } from '../utils/receiptMerge'
  import { t } from '../i18n'
  import type { Profile, Transaction } from '../types/models'

  const transactions = useTransactionsStore()
  const accounts = useAccountsStore()
  const allAccounts = useAllAccountsStore()
  const allReceipts = useAllReceiptsStore()
  const receiptsStore = useReceiptsStore()
  const profiles = useProfilesStore()
  const categories = useCategoriesStore()
  const viewAs = useViewAsStore()
  const period = usePeriodStore()
  const popups = usePopupsStore()
  const settings = useSettingsStore()
  const baseCurrency = useBaseCurrency()
  const route = useRoute()
  const router = useRouter()
  const readOnly = computed(() => viewAs.isReadOnly)

  // Optional ?category=<id> filter, arrived from "Операції за період" in a category's detail sheet.
  const filterCategoryId = computed(() =>
    typeof route.query.category === 'string' ? route.query.category : null,
  )
  const filterCategory = computed(() =>
    filterCategoryId.value ? categories.byId(filterCategoryId.value) : null,
  )

  function clearCategoryFilter() {
    router.replace({ path: '/operations' })
  }

  // Optional ?account=<id> filter, arrived from "Операції" in an account's detail sheet.
  const filterAccountId = computed(() =>
    typeof route.query.account === 'string' ? route.query.account : null,
  )
  const filterAccount = computed(() =>
    filterAccountId.value ? accounts.all.find((a) => a.id === filterAccountId.value) : null,
  )

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
    hasCustomDateRange.value
      ? new Date(filters.value.dateTo).setHours(23, 59, 59, 999)
      : period.end,
  )

  const periodTransactions = computed(() => {
    let list = transactions.forPeriod(effectiveStart.value, effectiveEnd.value)
    if (filterCategoryId.value) {
      list = list.filter(
        (t) =>
          t.categoryId === filterCategoryId.value || t.subcategoryId === filterCategoryId.value,
      )
    }
    if (filterAccountId.value) {
      list = list.filter(
        (t) => t.accountId === filterAccountId.value || t.toAccountId === filterAccountId.value,
      )
    }
    if (filters.value.accountIds.length) {
      list = list.filter(
        (t) =>
          filters.value.accountIds.includes(t.accountId) ||
          (t.toAccountId && filters.value.accountIds.includes(t.toAccountId)),
      )
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
      list = list.filter(
        (t) => Math.abs(baseCurrency.toBase(t.amount, t.currency)) >= filters.value.minAmount!,
      )
    }
    if (filters.value.maxAmount != null) {
      list = list.filter(
        (t) => Math.abs(baseCurrency.toBase(t.amount, t.currency)) <= filters.value.maxAmount!,
      )
    }
    return list
  })

  // A transaction's signed amount, in the CURRENTLY SHOWN currency
  // ("Показувати суми в…"). On a cross-profile transfer this is negative
  // (expense-shaped) from the SENDER's perspective — see TransactionFormModal's
  // `submit()` — which is correct for the sender, but for the recipient
  // viewing the very same synced doc it silently subtracts money they
  // received. `nativeSignedAmount` already flips the sign to match whoever's
  // being viewed, the same way OverviewDataView does it: an expense if they
  // sent it, income if they received it. In "all" mode there's no single
  // perspective — the transfer is just money moving between two family
  // members, so it nets to 0 there.
  //
  // The base-currency figure itself prefers an EXACT recorded amount over a
  // live-rate conversion whenever the shown currency matches either side
  // actually on the transaction (see signedAmountInCurrency/otherCurrencyAmount)
  // — e.g. groceries entered as exactly 300₴ off a USD card: switching
  // "Показувати суми в…" to ₴ shows exactly 300, not whatever $7.50 converts to
  // at today's rate. Falls back to a live-rate conversion only when the shown
  // currency matches neither the account's nor the category's/destination's.
  function signedNet(t: Transaction): number {
    const signed = nativeSignedAmount(t, viewAs.effectiveUid)
    return signedAmountInCurrency(
      signed,
      t.currency,
      baseCurrency.code,
      otherCurrencyAmount(t),
      baseCurrency.toBase,
    )
  }

  /** One entry in a day-group's row list: either a plain operation, or every operation sharing one receiptId collapsed into a single card (see ReceiptGroupCard.vue) — even a solo (1-item) chek, so it always has a place to reach ReceiptEditModal.vue from. */
  type DayRow =
    | { kind: 'tx'; tx: Transaction }
    | { kind: 'receipt'; receiptId: string; items: Transaction[] }

  function groupByReceipt(list: Transaction[]): DayRow[] {
    const grouped = new Set<string>()
    const rows: DayRow[] = []
    for (const t of list) {
      if (t.receiptId) {
        if (grouped.has(t.receiptId)) continue
        grouped.add(t.receiptId)
        const items = list.filter((x) => x.receiptId === t.receiptId)
        rows.push({ kind: 'receipt', receiptId: t.receiptId, items })
        continue
      }
      rows.push({ kind: 'tx', tx: t })
    }
    return rows
  }

  const groups = computed(() => {
    const byDay = new Map<string, Transaction[]>()
    for (const t of periodTransactions.value) {
      const key = new Date(t.date).toDateString()
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(t)
    }
    return [...byDay.entries()]
      .map(([, list]) => {
        // Every operation on the same calendar day shares the same `date`
        // (day-precision only, see Transaction.date) so it can't order them —
        // newest created/edited goes first within the day instead.
        const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt)
        return {
          date: new Date(list[0].date),
          rows: groupByReceipt(sorted),
          net: list.reduce((s, t) => s + signedNet(t), 0),
        }
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  })

  function formatNet(net: number): string {
    // `net` is already base-currency (see signedNet) — day-total at the
    // CURRENT base-currency rate, per spec (no historical snapshot involved).
    return formatMoney(Math.abs(net), baseCurrency.code)
  }

  const initialBalance = ref<number | null>(null)
  const finalBalance = ref<number | null>(null)
  const balanceGuard = useLatestRun()
  watchEffect(async () => {
    const run = balanceGuard.start()
    const [initial, final] = await Promise.all([
      accounts.totalBalanceInBase(baseCurrency.code, effectiveStart.value - 1),
      accounts.totalBalanceInBase(baseCurrency.code, effectiveEnd.value),
    ])
    if (!balanceGuard.isCurrent(run)) return // a newer recompute started meanwhile — discard
    initialBalance.value = initial
    finalBalance.value = final
  })

  function rowMeta(tx: Transaction) {
    if (tx.type === 'transfer') {
      const from = resolveAccountLabel(
        tx.accountId,
        viewAs.effectiveUid,
        allAccounts.all,
        profiles.all,
      )
      const to = resolveAccountLabel(
        tx.toAccountId,
        viewAs.effectiveUid,
        allAccounts.all,
        profiles.all,
      )
      // Shown with the source account's own icon/color, styled the same
      // (square) way as on the Accounts tab — falls back to the generic swap
      // icon only if the source account can no longer be resolved.
      const fromAccount = allAccounts.byId(tx.accountId)
      return {
        icon: fromAccount?.icon ?? 'mdiSwapHorizontal',
        color: fromAccount?.color ?? TRANSFER_CATEGORY_COLOR,
        square: true,
        title: t('transactions.form.typeTransfer'),
        subtitle: `${from} → ${to}`,
        amountClass: 'transfer',
        // Both endpoints (possibly two different people) are already spelled
        // out in the subtitle above — a single corner badge would misattribute
        // a cross-profile transfer to whichever owner happened to be picked.
        owner: null as Profile | null,
      }
    }
    const category = categories.byId(tx.categoryId)
    const sub = categories.byId(tx.subcategoryId ?? undefined)
    const account = allAccounts.byId(tx.accountId)
    const title = category ? (sub ? `${category.name} (${sub.name})` : category.name) : '—'
    return {
      icon: sub?.icon ?? category?.icon ?? 'mdiHelpCircleOutline',
      color: sub?.color ?? category?.color ?? '#9a9a9e',
      square: false,
      title,
      subtitle: account?.name ?? '',
      amountClass: tx.type === 'expense' ? 'expense' : 'income',
      // "All" mode mixes every family member's operations in one list — badge
      // whose it is. Outside that mode there's only ever one owner in view, so
      // it would be redundant.
      owner: viewAs.mode === 'all' ? (profiles.byId(account?.ownerId) ?? null) : null,
    }
  }

  function rowSign(t: Transaction): string {
    return t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''
  }

  /**
   * The OTHER side of a two-currency operation — a cross-currency transfer
   * (destination account's currency differs from the source's), or an
   * expense/income against a category whose own currency differs from the
   * account's (see TransactionFormModal.vue's isCrossCurrencyTransfer /
   * isCrossCurrencyCategory, which is what actually collects `toAmount` in the
   * first place). `null` when the currencies match — a single amount is shown then.
   */
  interface RowAmount {
    amount: number
    currency: string
    // The account's/category's own Settings → "Формат валюти" override, if
    // any (see Account.currencyDisplay/Category.currencyDisplay) — whichever
    // of the two actually owns `currency` here, mirroring how AccountCard.vue/
    // CategoryTile.vue already show that same account's/category's amounts.
    currencyDisplay?: CurrencyDisplayStyle | null
  }

  function otherCurrencyAmount(t: Transaction): RowAmount | null {
    // Requires an actual recorded `toAmount` — never fabricated by reusing the
    // primary amount under a different currency's label, which would silently
    // imply a false 1:1 parity. Missing on old transactions saved before a
    // category picked up a currency (or before this feature existed at all).
    if (t.toAmount == null) return null
    if (t.type === 'transfer') {
      const dest = allAccounts.byId(t.toAccountId)
      if (!dest || dest.currency === t.currency) return null
      return { amount: t.toAmount, currency: dest.currency, currencyDisplay: dest.currencyDisplay }
    }
    const category = categories.byId(t.categoryId)
    const categoryCurrency = resolveCategoryCurrency(category, settings.baseCurrency, transactions.all)
    if (categoryCurrency === t.currency) return null
    return { amount: t.toAmount, currency: categoryCurrency, currencyDisplay: category?.currencyDisplay }
  }

  /** The source account's own amount/currency/display — what `primaryAmount`/`secondaryAmount` fall back to below. */
  function accountAmount(t: Transaction): RowAmount {
    return { amount: t.amount, currency: t.currency, currencyDisplay: allAccounts.byId(t.accountId)?.currencyDisplay }
  }

  /**
   * Which figure leads a two-currency row: for expense/income, the category's
   * own currency is what actually got spent/earned in real terms (e.g.
   * groceries priced at 300₴ that happened to debit $7.50 off a USD card) —
   * that's the natural PRIMARY number, with the account-currency debit/credit
   * demoted to the secondary one below it. A transfer has no such "real
   * amount" to prefer, so the source account's own amount stays primary there.
   */
  function primaryAmount(t: Transaction): RowAmount {
    const other = otherCurrencyAmount(t)
    return other && t.type !== 'transfer' ? other : accountAmount(t)
  }
  function secondaryAmount(t: Transaction): RowAmount | null {
    const other = otherCurrencyAmount(t)
    if (!other) return null
    return t.type !== 'transfer' ? accountAmount(t) : other
  }

  /** Pre-formatted (signed, with its own currency symbol) label for `primaryAmount`. */
  function primaryAmountLabel(t: Transaction): string {
    const p = primaryAmount(t)
    return `${rowSign(t)}${formatMoney(p.amount, p.currency, { currencyDisplay: p.currencyDisplay })}`
  }
  /** Pre-formatted (signed, with its own currency symbol) label for `secondaryAmount`, or null when there isn't one. */
  function secondaryAmountLabel(t: Transaction): string | null {
    const s = secondaryAmount(t)
    if (!s) return null
    return `${rowSign(t)}${formatMoney(s.amount, s.currency, { currencyDisplay: s.currencyDisplay })}`
  }

  function openCreate() {
    popups.openTransactionForm({
      presetCategoryId: filterCategoryId.value ?? undefined,
    })
  }
  function openEdit(t: Transaction) {
    popups.openTransactionForm({ transaction: t })
  }

  // ---------- Чек: редагування метаданих ----------
  // Від'єднання операції від чека тепер живе лише в TransactionFormModal.vue's
  // footer ("Відв'язати", замінює "Додати в чек" для вже згрупованої операції)
  // — єдина точка входу, замість окремих швидких іконок тут і на ReceiptGroupCard.

  // Через popups store (не локальний ref) — той самий примірник, який
  // TransactionFormModal's "Додати в чек" відкриває з App.vue, щоб обидва шляхи
  // (клік по картці чека тут, чи кнопка в формі операції з будь-якої сторінки)
  // вели в один Modal.
  function openReceiptEdit(id: string) {
    popups.openReceiptEdit({ receiptId: id })
  }

  // ---------- Чек: об'єднання наявних операцій ----------

  // expense/income лише (переказ не має категорії — до чека не пасує).
  // Операція без receiptId — звична "не в чеку". Операція з receiptId теж
  // придатна до об'єднання, ЯКЩО цей чек зараз "самотній" (одна операція) —
  // такий чек рендериться просто як звичайний рядок (ReceiptGroupCard
  // показується лише від 2 операцій), тож єдиний спосіб додати до нього ще
  // операцій — саме через це об'єднання чи через ReceiptEditModal.vue,
  // відкритий з нього ж (кнопка "Додати в чек" у формі операції); вже
  // "справжній" (2+) чек має власний UI для розширення (клік по картці ->
  // "Додати операцію в чек" у ReceiptEditModal), тут не пропонується.
  function isMergeable(t: Transaction): boolean {
    return isMergeableTx(transactions.all, t)
  }

  const selectMode = ref(false)
  const selectedIds = ref<Set<string>>(new Set())

  function toggleSelectMode() {
    selectMode.value = !selectMode.value
    selectedIds.value = new Set()
  }

  function toggleSelect(t: Transaction) {
    if (!isMergeable(t)) return
    const next = new Set(selectedIds.value)
    if (next.has(t.id)) next.delete(t.id)
    else next.add(t.id)
    selectedIds.value = next
  }

  const selectedTransactions = computed(() =>
    transactions.all.filter((t) => selectedIds.value.has(t.id)),
  )

  // Обов'язково: один рахунок, один календарний день (той самий інваріант, що
  // й скан чека застосовує уніфіковано до всіх драфтів — див.
  // ReceiptEditModal.vue).
  const canMerge = computed(() => {
    const sel = selectedTransactions.value
    if (sel.length < 2) return false
    const accountId = sel[0].accountId
    const day = new Date(sel[0].date).toDateString()
    return sel.every((t) => t.accountId === accountId && new Date(t.date).toDateString() === day)
  })

  const mergeHint = computed(() => {
    if (selectedIds.value.size < 2) return t('transactions.ops.selectAtLeastTwo')
    if (!canMerge.value) return t('transactions.ops.mustShareAccountAndDay')
    return t('transactions.ops.merge', { count: selectedIds.value.size })
  })

  const merging = ref(false)
  async function mergeSelected() {
    if (!canMerge.value || merging.value) return
    merging.value = true
    try {
      const sel = selectedTransactions.value
      const first = sel[0]
      // Reuse a solo receipt already in the selection (see isMergeable) instead
      // of always creating a fresh one — keeps whatever merchant name it had
      // rather than silently dropping it. If two DIFFERENT solo receipts end up
      // selected together, the first one wins and the other is left behind
      // empty (harmless — an unreferenced receipt is simply invisible, same as
      // one from a scanned-then-fully-detached photo).
      const existingReceiptId = sel.find((t) => t.receiptId)?.receiptId ?? null
      const receiptId =
        existingReceiptId ??
        (
          await receiptsStore.add({
            merchant: null,
            date: first.date,
            currency: first.currency,
            accountId: first.accountId,
          })
        ).id
      for (const t of sel) {
        if (t.receiptId !== receiptId) await transactions.update(t.id, { receiptId })
      }
      toggleSelectMode()
    } finally {
      merging.value = false
    }
  }

  // ---------- Скан чека ----------
  // "Фото чека" веде в той самий ReceiptEditModal, що й "Редагувати чек" (див.
  // popups.ts's receiptEdit) — лише з `scanFile` замість `receiptId`/
  // `seedTransaction`, щоб рахунок/дата/склад операцій виглядали й поводились
  // однаково незалежно від того, звідки чек узявся.

  const showReceiptCapture = ref(false)

  function openReceiptCapture() {
    showReceiptCapture.value = true
  }
  // `picked` fires from inside a native `paste` event on ReceiptCaptureModal's
  // own contenteditable paste target — closing it and opening ReceiptEditModal
  // in the very same synchronous tick coalesces both Teleport/Transition
  // updates into one Vue flush and can crash the patcher (observed as "Cannot
  // read properties of null (reading 'emitsOptions')"). Awaiting nextTick lets
  // the capture modal's close fully flush first.
  async function onReceiptPicked(file: File) {
    showReceiptCapture.value = false
    await nextTick()
    popups.openReceiptEdit({ scanFile: file })
  }
</script>

<template>
  <div class="filter-row">
    <div
      v-if="filterCategory"
      class="filter-chip"
    >
      <IconCircle
        :icon="filterCategory.icon"
        :color="filterCategory.color"
        :size="24"
      />
      <span>{{ t('transactions.ops.filterChip', { name: filterCategory.name }) }}</span>
      <button
        class="clear-filter"
        :aria-label="t('transactions.ops.removeFilterAria')"
        @click="clearCategoryFilter"
      >
        ✕
      </button>
    </div>
    <div
      v-if="filterAccount"
      class="filter-chip"
    >
      <IconCircle
        :icon="filterAccount.icon"
        :color="filterAccount.color"
        :size="24"
        square
      />
      <span>{{ t('transactions.ops.accountChip', { name: filterAccount.name }) }}</span>
      <button
        class="clear-filter"
        :aria-label="t('transactions.ops.removeFilterAria')"
        @click="clearAccountFilter"
      >
        ✕
      </button>
    </div>
    <div
      v-if="hasActiveFilters"
      class="filter-chip"
    >
      <MdiIcon
        name="mdiFilterVariant"
        :size="16"
        color="var(--accent)"
      />
      <span>{{ t('transactions.ops.filterCountChip', { count: activeFilterCount }) }}</span>
      <button
        class="clear-filter"
        :aria-label="t('transactions.ops.resetFiltersAria')"
        @click="clearAllFilters"
      >
        ✕
      </button>
    </div>
    <button
      class="filter-btn"
      @click="showFilterModal = true"
    >
      <MdiIcon
        name="mdiTune"
        :size="18"
      />
      <span>{{ t('transactions.ops.filters') }}</span>
    </button>
    <button
      v-if="!readOnly"
      class="filter-btn"
      @click="toggleSelectMode"
    >
      <MdiIcon
        :name="selectMode ? 'mdiClose' : 'mdiCheckboxMultipleMarkedOutline'"
        :size="18"
      />
      <span>{{ selectMode ? t('common.cancel') : t('transactions.ops.mergeIntoReceipt') }}</span>
    </button>
  </div>

  <div class="balance-bar">
    <div class="cell">
      <span class="label">{{ t('transactions.ops.initialBalance') }}</span>
      <span class="value income">{{
        initialBalance === null ? '…' : formatMoney(initialBalance, baseCurrency.code)
      }}</span>
    </div>
    <div class="cell">
      <span class="label">{{ t('transactions.ops.finalBalance') }}</span>
      <span
        class="value"
        :class="{ negative: (finalBalance ?? 0) < 0 }"
      >
        {{ finalBalance === null ? '…' : formatMoney(finalBalance, baseCurrency.code) }}
      </span>
    </div>
  </div>

  <div
    v-if="!groups.length"
    class="empty"
  >
    {{
      filterCategory
        ? t('transactions.ops.emptyForCategory')
        : filterAccount
          ? t('transactions.ops.emptyForAccount')
          : t('transactions.ops.emptyForPeriod')
    }}
  </div>

  <div
    v-for="group in groups"
    :key="group.date.toDateString()"
    class="day-group"
  >
    <div class="day-heading">
      <div class="day-num-col">
        <span class="day-num">{{ dayHeader(group.date).day }}</span>
      </div>
      <div class="day-label-col">
        <span class="weekday">{{ dayHeader(group.date).weekday }}</span>
        <span class="monthyear">{{ dayHeader(group.date).monthYear }}</span>
      </div>
      <span
        class="day-total"
        :class="{ negative: group.net < 0 }"
      >
        {{ formatNet(group.net) }}
      </span>
    </div>

    <TransitionGroup
      tag="div"
      name="tx-row"
      class="tx-list"
    >
      <template
        v-for="row in group.rows"
        :key="row.kind === 'tx' ? row.tx.id : row.receiptId"
      >
        <button
          v-if="row.kind === 'tx'"
          class="row"
          :class="{
            'row--static': readOnly,
            'row--select': selectMode,
            'row--unselectable': selectMode && !isMergeable(row.tx),
          }"
          @click="selectMode ? toggleSelect(row.tx) : !readOnly && openEdit(row.tx)"
        >
          <span
            v-if="selectMode"
            class="select-check"
          >
            <MdiIcon
              :name="selectedIds.has(row.tx.id) ? 'mdiCheckCircle' : 'mdiCircleOutline'"
              :size="20"
              :color="selectedIds.has(row.tx.id) ? 'var(--accent)' : 'var(--text-muted)'"
            />
          </span>
          <div class="row-icon-wrap">
            <IconCircle
              :icon="rowMeta(row.tx).icon"
              :color="rowMeta(row.tx).color"
              :square="rowMeta(row.tx).square"
              :size="44"
            />
            <span
              v-if="rowMeta(row.tx).owner"
              class="owner-badge"
            >
              <OwnerAvatar
                :profile="rowMeta(row.tx).owner!"
                :size="18"
              />
            </span>
            <span
              v-if="transactions.isPending(row.tx.id)"
              class="pending-badge"
              :title="t('common.pendingSync')"
              :aria-label="t('common.pendingSync')"
            >
              <MdiIcon
                name="mdiClockOutline"
                :size="11"
                color="#fff"
              />
            </span>
          </div>
          <div class="row-text">
            <span class="row-title">{{ rowMeta(row.tx).title }}</span>
            <span class="row-sub">{{ rowMeta(row.tx).subtitle }}</span>
            <span
              v-if="row.tx.note"
              class="row-note"
              >{{ row.tx.note }}</span
            >
          </div>
          <span class="row-amount-col">
            <span
              class="row-amount"
              :class="rowMeta(row.tx).amountClass"
            >
              {{ primaryAmountLabel(row.tx) }}
            </span>
            <span
              v-if="secondaryAmountLabel(row.tx)"
              class="row-amount row-amount-secondary"
              :class="rowMeta(row.tx).amountClass"
            >
              {{ secondaryAmountLabel(row.tx) }}
            </span>
          </span>
        </button>

        <ReceiptGroupCard
          v-else
          :items="row.items"
          :merchant="allReceipts.byId(row.receiptId)?.merchant ?? null"
          :account-name="allAccounts.byId(allReceipts.byId(row.receiptId)?.accountId)?.name ?? null"
          :owner="
            viewAs.mode === 'all'
              ? (profiles.byId(allReceipts.byId(row.receiptId)?.ownerId) ?? null)
              : null
          "
          :read-only="readOnly"
          :row-meta="rowMeta"
          :primary-amount-label="primaryAmountLabel"
          :secondary-amount-label="secondaryAmountLabel"
          :is-pending="transactions.isPending"
          :format-net="formatNet"
          :net-of="signedNet"
          @edit-item="openEdit"
          @edit-receipt="openReceiptEdit(row.receiptId)"
        />
      </template>
    </TransitionGroup>
  </div>

  <!-- Reserves scroll room below the last row so the fixed-position
       .fab-row / .merge-bar never covers the last list items once
       scrolled to the bottom. -->
  <div
    v-if="!readOnly"
    class="fab-clearance"
    aria-hidden="true"
  ></div>

  <!-- Teleported to <body>: position:fixed only escapes the page-transition's
       transform (App.vue animates route roots with `transform`) if the fab
       isn't a descendant of the transformed element — otherwise that
       transform makes it fixed's containing block, and the fab briefly
       renders at the transformed box's edges before snapping to its real
       viewport-fixed spot once the transition ends. -->
  <Teleport to="body">
    <template v-if="selectMode">
      <div class="fab-row merge-bar">
        <span class="merge-count">{{ t('transactions.ops.selectedCount', { count: selectedIds.size }) }}</span>
        <button
          type="button"
          class="btn btn-primary merge-btn"
          :disabled="!canMerge || merging"
          @click="mergeSelected"
        >
          {{ mergeHint }}
        </button>
      </div>
    </template>
    <template v-else-if="!readOnly">
      <div class="fab-row">
        <button
          class="fab fab-scan"
          :aria-label="t('transactions.ops.scanReceiptAria')"
          @click="openReceiptCapture"
        >
          <MdiIcon
            name="mdiCameraOutline"
            :size="22"
            color="#fff"
          />
        </button>
        <button
          class="fab"
          :aria-label="t('transactions.ops.addOperationAria')"
          @click="openCreate"
        >
          <MdiIcon
            name="mdiPlus"
            :size="26"
            color="#fff"
          />
        </button>
      </div>
    </template>
  </Teleport>

  <OperationsFilterModal
    :open="showFilterModal"
    v-model="filters"
    @close="showFilterModal = false"
  />

  <ReceiptCaptureModal
    :open="showReceiptCapture"
    @close="showReceiptCapture = false"
    @picked="onReceiptPicked"
  />
</template>

<style lang="scss" scoped>
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
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    background: var(--surface);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: 12px;
    box-shadow: var(--shadow-sm);
  }

  .balance-bar .cell {
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
    display: grid;
    grid-template-columns: 30px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 14px 4px 8px;
  }

  .day-num-col {
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
    min-width: 0;
  }

  .weekday {
    font-size: 10.5px;
    color: var(--text-muted);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .monthyear {
    font-size: 10.5px;
    color: var(--text-muted);
    letter-spacing: 0.03em;
    text-transform: uppercase;
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
    @include transition();
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

  .row--select {
    cursor: pointer;
  }

  .row--unselectable {
    opacity: 0.4;
    pointer-events: none;
  }

  .select-check {
    flex-shrink: 0;
    display: flex;
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
    @include lineClamp(1);
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

  .row-amount-secondary {
    font-size: 11.5px;
    font-weight: 600;
    opacity: 0.75;
  }

  /* Reserves scroll room below the last row for the .fab-clearance div
   rendered right after the list — see the template comment there. Desktop
   (fine pointer) leaves it at 0: .fab-row/.merge-bar sit low enough there
   not to matter. It only grows for the mobile/touch layout, sized for
   .fab-row's own footprint (both fabs sit side by side now, one row tall). */
  .fab-clearance {
    height: 0;
  }

  @include laptop() {
    .fab-clearance {
      /* .fab-row's own bottom offset + its height (the taller, 56px fab) +
       a bit of breathing room, inflated for the iOS safe-area exactly like
       .fab-row/.merge-bar. */
      height: calc(60px + env(safe-area-inset-bottom, 0px));
    }
  }

  /* Anchors both fab buttons as one bottom-right group — .merge-bar takes
   this exact spot (see below) when select mode replaces it. */
  .fab-row {
    position: fixed;
    right: 24px;
    bottom: 32px;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 15;
  }

  .fab {
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
    flex-shrink: 0;
    @include transition();
  }

  .fab:active {
    transform: scale(0.9);
  }

  .fab-scan {
    width: 46px;
    height: 46px;
    background: var(--text-secondary);
  }

  @include laptop() {
    .fab-row {
      /* 84px clearance above .bottom-nav, plus the iOS home-indicator inset
     that .bottom-nav's own padding already grows by — without it the row
     sits lower than the nav bar's real (safe-area-inflated) height and its
     bottom half renders underneath the bar on notched iOS PWAs. */
      bottom: calc(84px + env(safe-area-inset-bottom, 0px));
    }
    .merge-bar {
      bottom: calc(84px + env(safe-area-inset-bottom, 0px));
    }
  }

  /* Same anchor (right/bottom) as .fab-row, so the merge confirmation
   appears exactly where the fab buttons were instead of a full-width bar. */
  .merge-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border-radius: var(--radius-md);
    padding: 10px;
    box-shadow: var(--shadow-md);
    z-index: 15;
  }

  .merge-count {
    flex: 1;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .merge-btn {
    flex-shrink: 0;
    /* No forced nowrap: canMerge=false swaps the label for a full sentence
     (see mergeHint) that needs to wrap inside this now content-sized bar. */
  }
</style>
