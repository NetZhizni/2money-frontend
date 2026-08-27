<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountsStore, computeAccountBalance } from '../stores/accounts'
import { useTransactionsStore } from '../stores/transactions'
import AccountCard from '../components/accounts/AccountCard.vue'
import AccountFormModal from '../components/accounts/AccountFormModal.vue'
import AccountDetailModal from '../components/accounts/AccountDetailModal.vue'
import TransactionFormModal from '../components/transactions/TransactionFormModal.vue'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { loadDemoData } from '../db/demoData'
import type { Account, AccountType } from '../types/models'

const accounts = useAccountsStore()
const transactions = useTransactionsStore()
const router = useRouter()

const TABS: { value: AccountType; label: string }[] = [
  { value: 'regular', label: 'Звичайний' },
  { value: 'loan', label: 'Позика' },
  { value: 'savings', label: 'Збереження' },
]
const activeTab = ref<AccountType>('regular')

const showArchived = ref(false)
const showForm = ref(false)
const editingAccount = ref<Account | null>(null)
const confirmDelete = ref<Account | null>(null)
const demoLoading = ref(false)
const showTxForm = ref(false)
const txPresetAccountId = ref<string | undefined>(undefined)
const historyAccount = ref<Account | null>(null)

function openAddOperation(account: Account) {
  txPresetAccountId.value = account.id
  showTxForm.value = true
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

function openAddOperationGeneric() {
  txPresetAccountId.value = undefined
  showTxForm.value = true
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
const archivedAccounts = computed(() => accounts.archived.filter((a) => a.type === activeTab.value))
const hasAnyAccounts = computed(() => accounts.active.length > 0 || accounts.archived.length > 0)

function openCreate() {
  editingAccount.value = null
  showForm.value = true
}

function openEdit(account: Account) {
  editingAccount.value = account
  showForm.value = true
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
  if (!editingAccount.value) return
  confirmDelete.value = editingAccount.value
  showForm.value = false
}

async function handleDeleteConfirmed() {
  if (!confirmDelete.value) return
  await accounts.remove(confirmDelete.value.id)
  confirmDelete.value = null
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

    <TransitionGroup tag="div" name="account-card" class="list">
      <AccountCard
        v-for="account in activeAccounts"
        :key="account.id"
        :account="account"
        :balance="balanceOf(account)"
        :pending="accounts.isPending(account.id)"
        @click="openEdit(account)"
        @add-operation="openAddOperation(account)"
        @history="historyAccount = account"
      />
    </TransitionGroup>

    <button class="add-account" @click="openCreate">
      <MdiIcon name="mdiPlus" :size="20" color="var(--accent)" />
      <span>Додати рахунок</span>
    </button>

    <div v-if="archivedAccounts.length" class="archived-section">
      <button class="archived-toggle" @click="showArchived = !showArchived">
        <MdiIcon :name="showArchived ? 'mdiChevronUp' : 'mdiChevronDown'" :size="18" />
        Архівовані рахунки ({{ archivedAccounts.length }})
      </button>
      <div v-if="showArchived" class="list">
        <AccountCard
          v-for="account in archivedAccounts"
          :key="account.id"
          :account="account"
          :balance="balanceOf(account)"
          @click="openEdit(account)"
          @history="historyAccount = account"
        />
      </div>
    </div>

    <div v-if="!activeAccounts.length && !archivedAccounts.length && !hasAnyAccounts" class="empty-state">
      <p class="empty">Рахунків ще немає. Додайте перший, щоб почати облік фінансів.</p>
      <button class="btn btn-secondary demo-btn" :disabled="demoLoading" @click="handleLoadDemo">
        {{ demoLoading ? 'Додаємо…' : 'Або спробувати на демо-даних' }}
      </button>
    </div>

    <div v-else-if="!activeAccounts.length && !archivedAccounts.length" class="empty-state">
      <p class="empty">У цій вкладці ще немає рахунків.</p>
    </div>

    <!-- Teleported to <body>: position:fixed only escapes the page-transition's
         transform (App.vue animates route roots with `transform`) if the fab
         isn't a descendant of the transformed element — otherwise that
         transform makes it fixed's containing block, and the fab briefly
         renders at the transformed box's edges before snapping to its real
         viewport-fixed spot once the transition ends. -->
    <Teleport to="body">
      <button v-if="hasAnyAccounts" class="fab" aria-label="Додати операцію" @click="openAddOperationGeneric">
        <MdiIcon name="mdiPlus" :size="26" color="#fff" />
      </button>
    </Teleport>

    <AccountFormModal
      v-if="showForm"
      :account="editingAccount"
      :default-type="activeTab"
      @close="showForm = false"
      @save="handleSave"
      @archived="handleArchiveToggle"
      @deleted="handleDeleteRequest"
    />

    <TransactionFormModal
      v-if="showTxForm"
      :preset-account-id="txPresetAccountId"
      @close="showTxForm = false"
      @saved="showTxForm = false"
      @deleted="showTxForm = false"
    />

    <ConfirmDialog
      v-if="confirmDelete"
      title="Видалити рахунок?"
      :message="`Рахунок «${confirmDelete.name}» та всі пов'язані з ним операції буде видалено безповоротно.`"
      confirm-label="Видалити"
      danger
      @close="confirmDelete = null"
      @confirm="handleDeleteConfirmed"
    />

    <AccountDetailModal
      v-if="historyAccount"
      :account="historyAccount"
      @close="historyAccount = null"
      @edit="openEditFromDetail"
      @add-operation="openAddOperationFromDetail"
      @view-operations="openOperationsFromDetail"
    />
  </div>
</template>

<style scoped>
.view {
  padding: 8px 16px 90px;
  max-width: 640px;
  margin: 0 auto;
}

.tabs {
  margin-bottom: 14px;
  position: sticky;
  top: 0;
  z-index: 10;
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
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.account-card-enter-from,
.account-card-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
.account-card-leave-active {
  position: absolute;
  width: 100%;
}

.add-account {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 14px;
  padding: 14px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s ease;
}

.add-account:active {
  transform: scale(0.97);
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
