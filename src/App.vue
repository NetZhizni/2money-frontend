<script setup lang="ts">
  import { nextTick, ref, watch, watchEffect } from 'vue'
  import TopHeader from './components/layout/TopHeader.vue'
  import BottomNav from './components/layout/BottomNav.vue'
  import SideNav from './components/layout/SideNav.vue'
  import LoginView from './views/LoginView.vue'
  import ServerSetupView from './views/ServerSetupView.vue'
  import OnboardingView from './views/OnboardingView.vue'
  import UpdateToast from './components/common/UpdateToast.vue'
  import TransactionFormModal from './components/transactions/TransactionFormModal.vue'
  import ReceiptEditModal from './components/transactions/ReceiptEditModal.vue'
  import ConfirmDialog from './components/common/ConfirmDialog.vue'
  import { seedDefaultsIfEmpty } from './db/seed'
  import { hasNoOwnDataYet, markOnboardingDone } from './db/onboarding'
  import { useAuthStore } from './stores/auth'
  import { useServerStore } from './stores/server'
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
  import { pageTransitionName } from './composables/usePageTransition'
  import type { TransactionDuplicatePreset } from './utils/transactionDuplicate'
  import { t } from './i18n'

  const authStore = useAuthStore()
  const server = useServerStore()
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

  // "Дублювати" from the transaction form — instead of writing a copy
  // straight to the DB, reopen this same shared form as a fresh, unsaved
  // operation prefilled from the one just closed, so the user can still
  // adjust the date/amount/category/account before it's actually saved (see
  // TransactionFormModal.vue's duplicateRequested). Closing then reopening
  // needs the same nextTick gap as above — `transactionForm.open` would
  // otherwise flip false→true within one Vue flush and the modal's own
  // `watch(() => props.open, …)` (which is what rebuilds its form from the
  // new presets) would never see it change.
  async function handleDuplicateRequest(preset: TransactionDuplicatePreset) {
    popups.closeTransactionForm()
    await nextTick()
    popups.openTransactionForm(preset)
  }

  // Resolves which server (if any) this device is configured for — see
  // stores/server.ts's own doc comment. Drives `server.mode` below, which
  // gates ServerSetupView vs. LoginView vs. the app shell; runs exactly
  // once, since App.vue's root instance only ever mounts once per page load.
  void server.init()

  const dataReady = ref(false)
  // Whether OnboardingView.vue's "start fresh or import a backup?" choice is
  // currently pending for the signed-in profile — see loadForCurrentUser and
  // db/onboarding.ts's hasNoOwnDataYet. `onboardingUid` isn't reactive on
  // purpose: nothing in the template reads it, it's only there to hand
  // handleOnboardingDone the right uid once the choice is made.
  const needsOnboarding = ref(false)
  let onboardingUid: string | null = null

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
    needsOnboarding.value = false
    onboardingUid = null
  }

  async function proceedLoadingData(uid: string) {
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

  /**
   * Gates on hasNoOwnDataYet() before ever seeding/loading anything — see its
   * own doc comment for exactly when that's true and why it's safe even when
   * wrong. When it is, this returns early and waits for handleOnboardingDone
   * (OnboardingView.vue's `@done`) instead of proceeding straight to
   * proceedLoadingData like every other login does.
   */
  async function loadForCurrentUser(uid: string) {
    dataReady.value = false
    if (await hasNoOwnDataYet(uid)) {
      onboardingUid = uid
      needsOnboarding.value = true
      return
    }
    await proceedLoadingData(uid)
  }

  async function handleOnboardingDone() {
    needsOnboarding.value = false
    const uid = onboardingUid
    onboardingUid = null
    if (uid) {
      await markOnboardingDone(uid)
      await proceedLoadingData(uid)
    }
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
    v-if="server.initializing"
    class="boot-splash"
  >
    {{ t('common.loading') }}
  </div>
  <ServerSetupView v-else-if="server.mode === 'unconfigured'" />
  <div
    v-else-if="!authStore.ready"
    class="boot-splash"
  >
    {{ t('common.loading') }}
  </div>
  <LoginView v-else-if="!authStore.profile" />
  <OnboardingView v-else-if="needsOnboarding" @done="handleOnboardingDone" />
  <div
    class="app-shell"
    v-else-if="dataReady"
  >
    <SideNav class="side-nav-slot" />
    <div class="main-column">
      <TopHeader />
      <main class="app-content">
        <RouterView v-slot="{ Component, route: matchedRoute }">
          <Transition :name="pageTransitionName">
            <component :is="Component" :key="matchedRoute.name ?? matchedRoute.path" />
          </Transition>
        </RouterView>
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
    :preset-to-account-id="popups.transactionForm.presetToAccountId"
    :preset-category-id="popups.transactionForm.presetCategoryId"
    :preset-amount="popups.transactionForm.presetAmount"
    :preset-to-amount="popups.transactionForm.presetToAmount"
    :preset-note="popups.transactionForm.presetNote"
    :preset-type="popups.transactionForm.presetType"
    :preset-date="popups.transactionForm.presetDate"
    @close="popups.closeTransactionForm()"
    @saved="popups.closeTransactionForm()"
    @duplicate-requested="handleDuplicateRequest"
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
    @include viewportHeight('height');
    @include viewportHeight('min-height');
    overflow: hidden;
    background: var(--page-bg);
  }

  .main-column {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
    @include viewportHeight('height');
    @include viewportHeight('min-height');
    overflow: hidden;
  }

  .app-content {
    position: relative; // lets the leaving/entering pages below overlap instead of stacking
    display: grid;
    grid-template-rows: 1fr;
    height: 100%;
    justify-content: stretch;

    // Clip, don't scroll: the forward/back page transition and
    // PeriodPageView.vue's own period-swipe slide both translate their
    // content by ±100% (see the .page-forward-*/.page-back-* rules below),
    // which briefly extends past this container's bounds. `overflow(x)`
    // (overflow-x: auto) let Android treat that as real scrollable content
    // mid-animation — it would show a scrollbar and accept a touch-scroll
    // gesture during the slide. `overflow(none)` still clips the same
    // overflow, just without making it interactively scrollable.
    @include overflow(none);
    overscroll-behavior: contain;
  }

  // Page-to-page slide, played whenever the route changes (see App.vue's
  // <RouterView> above and usePageTransition.ts for the forward/back pick).
  // Durations mirror PeriodPageView.vue's own slide (SLIDE_OUT_MS/SLIDE_IN_MS)
  // for the same "quick out, slightly slower in" feel.
  //
  // Axis matches whichever nav is on screen: BottomNav's tabs run left→right
  // (below the `laptop()` breakpoint), SideNav's run top→bottom (above it) —
  // the desktop/vertical rules are the default below, the mobile/horizontal
  // ones override inside the `laptop()` block so they win at that width.
  .page-forward-enter-active,
  .page-back-enter-active {
    position: absolute;
    inset: 0;
    transition: transform 0.22s ease-out, opacity 0.22s ease-out;
  }
  .page-forward-leave-active,
  .page-back-leave-active {
    position: absolute;
    inset: 0;
    transition: transform 0.16s ease-in, opacity 0.16s ease-in;
  }

  // Desktop/laptop (SideNav, vertical tab order) — slide up/down.
  .page-forward-enter-from {
    opacity: 0;
    transform: translateY(16px);
  }
  .page-forward-leave-to {
    opacity: 0;
    transform: translateY(-16px);
  }
  .page-back-enter-from {
    opacity: 0;
    transform: translateY(-16px);
  }
  .page-back-leave-to {
    opacity: 0;
    transform: translateY(16px);
  }

  // Mobile/touch (BottomNav, horizontal tab order) — slide left/right instead.
  @include laptop() {
    .page-forward-enter-from {
      transform: translateX(100%);
    }
    .page-forward-leave-to {
      transform: translateX(-100%);
    }
    .page-back-enter-from {
      transform: translateX(-100%);
    }
    .page-back-leave-to {
      transform: translateX(100%);
    }
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
    // See ServerSetupView.vue's .setup-shell for why `safe` matters here too.
    align-items: safe center;
    justify-content: center;
    @include viewportHeight('height');
    @include viewportHeight('min-height');
    @include overflow(y);
    color: var(--text-muted);
    text-align: center;
    padding: 24px;
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
