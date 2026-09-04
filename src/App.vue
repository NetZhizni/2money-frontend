<script setup lang="ts">
  import { nextTick, ref, watch, watchEffect } from 'vue'
  import TopHeader from './components/layout/TopHeader.vue'
  import BottomNav from './components/layout/BottomNav.vue'
  import SideNav from './components/layout/SideNav.vue'
  import LoginView from './views/LoginView.vue'
  import UpdateToast from './components/common/UpdateToast.vue'
  import TransactionFormModal from './components/transactions/TransactionFormModal.vue'
  import ReceiptEditModal from './components/transactions/ReceiptEditModal.vue'
  import ConfirmDialog from './components/common/ConfirmDialog.vue'
  import { seedDefaultsIfEmpty } from './db/seed'
  import { useAuthStore } from './stores/auth'
  import { useViewAsStore } from './stores/viewAs'
  import { useProfilesStore } from './stores/profiles'
  import { useAllAccountsStore } from './stores/allAccounts'
  import { useAllTemplatesStore } from './stores/allTemplates'
  import { useAllBudgetsStore } from './stores/allBudgets'
  import { useAllReceiptsStore } from './stores/allReceipts'
  import { useSettingsStore } from './stores/settings'
  import { useAccountsStore } from './stores/accounts'
  import { useCategoriesStore } from './stores/categories'
  import { useTransactionsStore } from './stores/transactions'
  import { useTemplatesStore } from './stores/templates'
  import { useBudgetsStore } from './stores/budgets'
  import { useReceiptsStore } from './stores/receipts'
  import { usePopupsStore } from './stores/popups'
  import { t } from './i18n'

  const authStore = useAuthStore()
  const viewAs = useViewAsStore()
  const profiles = useProfilesStore()
  const allAccounts = useAllAccountsStore()
  const allTemplates = useAllTemplatesStore()
  const allBudgets = useAllBudgetsStore()
  const allReceipts = useAllReceiptsStore()
  const settings = useSettingsStore()
  const accounts = useAccountsStore()
  const categories = useCategoriesStore()
  const transactions = useTransactionsStore()
  const templates = useTemplatesStore()
  const budgets = useBudgetsStore()
  const receipts = useReceiptsStore()
  const popups = usePopupsStore()

  // The transaction form and the confirm dialog are reused across every page
  // that can create/edit a transaction or ask "delete this?" (Accounts,
  // Categories, Operations, Search) — mounted once here, permanently, and
  // driven by the popups store instead of a per-page `v-if`, so opening either
  // from any page reuses the same Modal instance and its `<Transition>` plays
  // correctly on every open/close (see Modal.vue's `open` prop).
  // Closing one Modal and opening another synchronously (same tick) coalesces
  // both into a single Vue flush and can crash the patcher — see
  // OperationsDataView.vue's onReceiptPicked for the observed repro. Awaiting
  // nextTick lets the first modal's close fully flush before the next opens.
  async function handleTransactionDeleteRequest() {
    const tx = popups.transactionForm.transaction
    if (!tx) return
    popups.closeTransactionForm()
    await nextTick()
    popups.confirmDialog({
      title: t('common.deleteTransactionTitle'),
      message: t('common.deleteTransactionMessage'),
      confirmLabel: t('common.delete'),
      danger: true,
      onConfirm: async () => {
        await transactions.remove(tx.id)
        popups.closeConfirm()
      },
    })
  }

  // "Add to receipt" from the transaction form — if it's already part of a
  // receipt (even a "lone" one, 1 transaction — see ReceiptGroupCard.vue),
  // open that one for editing; otherwise start a new one, seeded with this
  // transaction (ReceiptEditModal.vue only actually creates the receipt row
  // once "Save" is pressed).
  async function handleAddToReceiptRequest() {
    const tx = popups.transactionForm.transaction
    if (!tx) return
    popups.closeTransactionForm()
    await nextTick()
    popups.openReceiptEdit(tx.receiptId ? { receiptId: tx.receiptId } : { seedTransaction: tx })
  }

  const dataReady = ref(false)

  function resetAllStores() {
    viewAs.reset()
    settings.reset()
    accounts.reset()
    categories.reset()
    transactions.reset()
    templates.reset()
    budgets.reset()
    receipts.reset()
    profiles.reset()
    allAccounts.reset()
    allTemplates.reset()
    allBudgets.reset()
    allReceipts.reset()
    dataReady.value = false
  }

  async function loadForCurrentUser(uid: string) {
    dataReady.value = false
    await seedDefaultsIfEmpty(uid)
    await Promise.all([
      settings.load(),
      accounts.load(),
      categories.load(),
      transactions.load(),
      templates.load(),
      budgets.load(),
      receipts.load(),
      profiles.load(),
      allAccounts.load(),
      allTemplates.load(),
      allBudgets.load(),
      allReceipts.load(),
    ])
    await templates.runDueGeneration()
    dataReady.value = true
  }

  // Re-runs whenever auth resolves or the signed-in profile changes (sign-in,
  // sign-out, or switching Google accounts) — always resetting listeners first
  // so no stale data from a previous profile leaks into the new one. Keyed off
  // `authStore.profile` (not the raw Firebase user) on purpose: Firebase Auth
  // resolves before GET /api/auth/me has confirmed this email is provisioned
  // in `users` — starting data loads that early would race that check (and,
  // for a not-yet-provisioned email, never resolve `profile` at all).
  watch(
    () => [authStore.ready, authStore.profile?.uid ?? null] as const,
    ([ready, uid]) => {
      resetAllStores()
      if (ready && uid) loadForCurrentUser(uid)
    },
    { immediate: true },
  )

  watchEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      settings.theme === 'system' ? '' : settings.theme,
    )
  })

  // Dexie's liveQuery only re-runs a store's query function on a matching
  // IndexedDB write — switching who we're "viewing as" changes no data, so
  // without this the 3 profile-scoped stores would keep showing whichever
  // owner's rows they last queried. Re-subscribing (via `.load()`) re-executes
  // each query function against the new viewAs.effectiveUid/mode right away.
  // `categories` is excluded on purpose: it's a shared family resource now
  // (see stores/categories.ts), not owner-scoped, so viewAs never changes it.
  watch(
    () => `${viewAs.mode}:${viewAs.effectiveUid ?? ''}`,
    () => {
      if (!dataReady.value) return
      void Promise.all([accounts.load(), transactions.load(), budgets.load(), receipts.load()])
    },
  )
</script>

<template>
  <div
    v-if="!authStore.ready"
    class="boot-splash"
  >
    {{ t('common.loading') }}
  </div>
  <LoginView v-else-if="!authStore.user || !authStore.profile" />
  <div
    class="app-shell"
    v-else-if="dataReady"
  >
    <SideNav class="side-nav-slot" />
    <div class="main-column">
      <TopHeader />
      <main class="app-content">
        <RouterView />
      </main>
      <BottomNav class="bottom-nav-slot" />
    </div>
  </div>
  <div
    v-else
    class="boot-splash"
  >
    {{ t('common.loading') }}
  </div>
  <UpdateToast />

  <TransactionFormModal
    :open="popups.transactionForm.open"
    :transaction="popups.transactionForm.transaction"
    :preset-account-id="popups.transactionForm.presetAccountId"
    :preset-category-id="popups.transactionForm.presetCategoryId"
    @close="popups.closeTransactionForm()"
    @saved="popups.closeTransactionForm()"
    @duplicated="popups.closeTransactionForm()"
    @deleted="handleTransactionDeleteRequest"
    @add-to-receipt="handleAddToReceiptRequest"
  />

  <ReceiptEditModal
    :open="popups.receiptEdit.open"
    :receipt-id="popups.receiptEdit.receiptId"
    :seed-transaction="popups.receiptEdit.seedTransaction"
    :scan-file="popups.receiptEdit.scanFile"
    @close="popups.closeReceiptEdit()"
  />

  <ConfirmDialog
    :open="popups.confirm.open"
    :title="popups.confirm.title"
    :message="popups.confirm.message"
    :confirm-label="popups.confirm.confirmLabel"
    :danger="popups.confirm.danger"
    @close="popups.closeConfirm()"
    @confirm="popups.confirm.onConfirm?.()"
  />
</template>

<style lang="scss" scoped>
  .app-shell {
    display: flex;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--page-bg);
  }

  .main-column {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100dvh;
    overflow: hidden;
  }

  .app-content {
    display: grid;  
    grid-template-rows: 1fr;
    height: 100%;
    justify-content: stretch;

    @include overflow(x);
    overscroll-behavior: contain;
  }

  .page-enter-active,
  .page-leave-active {
    @include transition();
  }
  .page-enter-from {
    opacity: 0;
    transform: translateY(6px);
  }
  .page-leave-to {
    opacity: 0;
    transform: translateY(-6px);
  }

  .side-nav-slot {
    display: flex;
  }

  .bottom-nav-slot {
    display: none;
  }

  .boot-splash {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    color: var(--text-muted);
  }

  @include laptop() {
    .side-nav-slot {
      display: none;
    }
    .bottom-nav-slot {
      display: flex;
    }
  }
</style>
