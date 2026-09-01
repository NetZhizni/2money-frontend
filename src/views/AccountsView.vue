<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { useAccountsStore, computeAccountBalance } from '../stores/accounts'
  import { useTransactionsStore } from '../stores/transactions'
  import { useProfilesStore } from '../stores/profiles'
  import { useViewAsStore } from '../stores/viewAs'
  import { usePopupsStore } from '../stores/popups'
  import AccountCard from '../components/accounts/AccountCard.vue'
  import AccountFormModal from '../components/accounts/AccountFormModal.vue'
  import AccountDetailModal from '../components/accounts/AccountDetailModal.vue'
  import MdiIcon from '../components/common/MdiIcon.vue'
  import { loadDemoData } from '../db/demoData'
  import { ACCOUNT_TYPE_OPTIONS } from '../utils/accountTypes'
  import { pinLeavingRect, snapshotListRects } from '../utils/listTransition'
  import type { Account, AccountType } from '../types/models'
  import type { ComponentPublicInstance } from 'vue'

  const accounts = useAccountsStore()
  const transactions = useTransactionsStore()
  const profiles = useProfilesStore()
  const viewAs = useViewAsStore()
  const popups = usePopupsStore()
  const router = useRouter()
  const readOnly = computed(() => viewAs.isReadOnly)

  // "View as all" mixes every family member's accounts into one list — badge
  // whose account each card is. Outside that mode there's only ever one owner
  // in view, so no badge is needed.
  function ownerOf(account: Account) {
    return viewAs.mode === 'all' ? (profiles.byId(account.ownerId) ?? null) : null
  }

  const TABS = ACCOUNT_TYPE_OPTIONS
  const activeTab = ref<AccountType>('regular')

  const showArchived = ref(false)
  const showForm = ref(false)
  const editingAccount = ref<Account | null>(null)
  const demoLoading = ref(false)
  const historyAccount = ref<Account | null>(null)

  function openAddOperation(account: Account) {
    popups.openTransactionForm({ presetAccountId: account.id })
  }

  function openAddOperationFromDetail(account: Account) {
    historyAccount.value = null
    openAddOperation(account)
  }

  function openEditFromDetail(account: Account) {
    historyAccount.value = null
    openEdit(account)
  }

  function openOperationsFromDetail(account: Account) {
    historyAccount.value = null
    router.push({ path: '/operations', query: { account: account.id } })
  }

  async function handleLoadDemo() {
    demoLoading.value = true
    try {
      await loadDemoData()
    } finally {
      demoLoading.value = false
    }
  }

  function balanceOf(account: Account): number {
    return computeAccountBalance(account, transactions.forAccount(account.id))
  }

  const activeAccounts = computed(() => accounts.active.filter((a) => a.type === activeTab.value))
  const archivedAccounts = computed(() =>
    accounts.archived.filter((a) => a.type === activeTab.value),
  )
  const hasAnyAccounts = computed(() => accounts.active.length > 0 || accounts.archived.length > 0)

  // Snapshots every card's rect right before Vue touches the DOM, so
  // pinLeavingRect (see listTransition.ts) has a pre-removal rect to pin a
  // leaving card to even when several cards leave in the same patch (e.g.
  // switching tabs swaps the whole list at once). This can't be an
  // `onBeforeUpdate` on this component: the `v-for` lives inside
  // TransitionGroup's slot, so the reactive read of `activeAccounts` is
  // tracked by TransitionGroup's own render effect, not this component's —
  // this component's `onBeforeUpdate` simply never fires for it. `watch`
  // (default "pre" flush) subscribes directly to the source instead, so it
  // fires before any DOM patch regardless of which component's render effect
  // ends up owning the dependency.
  const listGroupRef = ref<ComponentPublicInstance | null>(null)
  watch(activeAccounts, () => snapshotListRects(listGroupRef.value?.$el))

  function openCreate() {
    editingAccount.value = null
    showForm.value = true
  }

  function openEdit(account: Account) {
    editingAccount.value = account
    showForm.value = true
  }

  /** Card tap: opens the "Рахунок" detail popup. */
  function openCard(account: Account) {
    historyAccount.value = account
  }

  async function handleSave(patch: Partial<Account>) {
    if (editingAccount.value) {
      await accounts.update(editingAccount.value.id, patch)
    } else {
      await accounts.add({
        ...(patch as Omit<Account, 'id' | 'createdAt' | 'order'>),
        archived: false,
      })
    }
    showForm.value = false
  }

  async function handleArchiveToggle() {
    if (!editingAccount.value) return
    await accounts.setArchived(editingAccount.value.id, !editingAccount.value.archived)
    showForm.value = false
  }

  function handleDeleteRequest() {
    const account = editingAccount.value
    if (!account) return
    showForm.value = false
    popups.confirmDialog({
      title: 'Видалити рахунок?',
      message: `Рахунок «${account.name}» та всі пов'язані з ним операції буде видалено безповоротно.`,
      confirmLabel: 'Видалити',
      danger: true,
      onConfirm: async () => {
        await accounts.remove(account.id)
        popups.closeConfirm()
      },
    })
  }
</script>

<template>
  <div class="view">
    <div class="segmented tabs">
      <button
        v-for="tab in TABS"
        :key="tab.value"
        :class="{ active: activeTab === tab.value }"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="view-scroll">
      <div class="view-scroll-content">
        <TransitionGroup
          ref="listGroupRef"
          tag="div"
          name="account-card"
          class="list"
          @before-leave="pinLeavingRect"
        >
          <AccountCard
            v-for="account in activeAccounts"
            :key="account.id"
            :account="account"
            :balance="balanceOf(account)"
            :pending="accounts.isPending(account.id)"
            :readonly="readOnly"
            :owner="ownerOf(account)"
            @click="openCard(account)"
          />
        </TransitionGroup>

        <div
          v-if="archivedAccounts.length"
          class="archived-section"
        >
          <button
            class="archived-toggle"
            @click="showArchived = !showArchived"
          >
            <MdiIcon
              :name="showArchived ? 'mdiChevronUp' : 'mdiChevronDown'"
              :size="18"
            />
            Архівовані рахунки ({{ archivedAccounts.length }})
          </button>
          <div
            v-if="showArchived"
            class="list"
          >
            <AccountCard
              v-for="account in archivedAccounts"
              :key="account.id"
              :account="account"
              :balance="balanceOf(account)"
              :readonly="readOnly"
              :owner="ownerOf(account)"
              @click="openCard(account)"
            />
          </div>
        </div>

        <div
          v-if="!activeAccounts.length && !archivedAccounts.length && !hasAnyAccounts"
          class="empty-state"
        >
          <p class="empty">
            {{
              readOnly
                ? 'У цього користувача ще немає рахунків.'
                : 'Рахунків ще немає. Додайте перший, щоб почати облік фінансів.'
            }}
          </p>
          <button
            v-if="!readOnly"
            class="btn btn-secondary demo-btn"
            :disabled="demoLoading"
            @click="handleLoadDemo"
          >
            {{ demoLoading ? 'Додаємо…' : 'Або спробувати на демо-даних' }}
          </button>
        </div>

        <div
          v-else-if="!activeAccounts.length && !archivedAccounts.length"
          class="empty-state"
        >
          <p class="empty">У цій вкладці ще немає рахунків.</p>
        </div>
      </div>
    </div>

    <!-- Teleported to <body>: position:fixed only escapes the page-transition's
         transform (App.vue animates route roots with `transform`) if the fab
         isn't a descendant of the transformed element — otherwise that
         transform makes it fixed's containing block, and the fab briefly
         renders at the transformed box's edges before snapping to its real
         viewport-fixed spot once the transition ends. -->
    <Teleport to="body">
      <button
        v-if="!readOnly"
        class="fab"
        aria-label="Додати рахунок"
        @click="openCreate"
      >
        <MdiIcon
          name="mdiPlus"
          :size="26"
          color="#fff"
        />
      </button>
    </Teleport>

    <AccountFormModal
      :open="showForm"
      :account="editingAccount"
      :default-type="activeTab"
      @close="showForm = false"
      @save="handleSave"
      @archived="handleArchiveToggle"
      @deleted="handleDeleteRequest"
    />

    <AccountDetailModal
      :open="!!historyAccount"
      :account="historyAccount"
      :readonly="readOnly"
      @close="historyAccount = null"
      @edit="openEditFromDetail"
      @add-operation="openAddOperationFromDetail"
      @view-operations="openOperationsFromDetail"
    />
  </div>
</template>

<style scoped>
  /* Same split as App.vue's `.main-column` (auto header row + scrolling 1fr
   row) and PeriodPageView's `.view`/`.view-scroll`: the type tabs sit in the
   `auto` row so they never scroll away, while `.view-scroll` is its own
   scroll container for the account list below them. */

  .tabs {
    margin-bottom: 14px;
    background: var(--page-bg);
  }

  .list {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .account-card-move,
  .account-card-enter-active,
  .account-card-leave-active {
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }
  .account-card-enter-from,
  .account-card-leave-to {
    opacity: 0;
    transform: translateX(-12px);
  }
  .account-card-leave-active {
    /* position/width are pinned inline by pinLeavingRect() before this class
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

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    margin-top: 40px;
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
    margin: 0;
  }

  .demo-btn {
    padding: 10px 20px;
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
