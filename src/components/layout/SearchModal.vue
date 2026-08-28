<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import OwnerAvatar from '../common/OwnerAvatar.vue'
import TransactionFormModal from '../transactions/TransactionFormModal.vue'
import { useTransactionsStore } from '../../stores/transactions'
import { useAllAccountsStore } from '../../stores/allAccounts'
import { useProfilesStore } from '../../stores/profiles'
import { useCategoriesStore } from '../../stores/categories'
import { useViewAsStore } from '../../stores/viewAs'
import { formatMoney, fullDateLabel } from '../../utils/format'
import { resolveAccountLabel } from '../../utils/accountLabel'
import { TRANSFER_CATEGORY_COLOR } from '../../utils/transferAnalytics'
import type { Profile, Transaction } from '../../types/models'

const emit = defineEmits<{ close: [] }>()

const transactions = useTransactionsStore()
const allAccounts = useAllAccountsStore()
const profiles = useProfilesStore()
const categories = useCategoriesStore()
const viewAs = useViewAsStore()
const readOnly = computed(() => viewAs.isReadOnly)

const query = ref('')

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
      searchable: `переказ ${from} ${to} ${t.note ?? ''}`,
      // Both endpoints (possibly two different people) are already spelled
      // out above — a single corner badge would misattribute a cross-profile
      // transfer to whichever owner happened to be picked.
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
    searchable: `${category?.name ?? ''} ${sub?.name ?? ''} ${account?.name ?? ''} ${t.note ?? ''}`,
    // "All" mode mixes every family member's operations in this list —
    // badge whose it is. Outside that mode there's only ever one owner in
    // view, so it would be redundant.
    owner: viewAs.mode === 'all' ? (profiles.byId(account?.ownerId) ?? null) : null,
  }
}

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return transactions.all
    .filter((t) => {
      const meta = rowMeta(t)
      if (meta.searchable.toLowerCase().includes(q)) return true
      return String(t.amount).includes(q)
    })
    .slice(0, 60)
})

const editingTransaction = ref<Transaction | null>(null)
function openResult(t: Transaction) {
  editingTransaction.value = t
}
async function handleDeleted() {
  if (!editingTransaction.value) return
  await transactions.remove(editingTransaction.value.id)
  editingTransaction.value = null
}
</script>

<template>
  <Modal title="Пошук операцій" @close="emit('close')">
    <input
      v-model="query"
      type="text"
      class="search-input"
      placeholder="Категорія, рахунок, нотатка або сума…"
      autofocus
    />

    <p v-if="!query.trim()" class="hint">
      Введіть текст, щоб знайти операції за категорією, рахунком, нотаткою чи сумою — за весь час.
    </p>
    <p v-else-if="!results.length" class="hint">Нічого не знайдено.</p>

    <div class="results">
      <button
        v-for="t in results"
        :key="t.id"
        class="row"
        :class="{ 'row--static': readOnly }"
        @click="!readOnly && openResult(t)"
      >
        <div class="row-icon-wrap">
          <IconCircle :icon="rowMeta(t).icon" :color="rowMeta(t).color" :size="40" />
          <span v-if="rowMeta(t).owner" class="owner-badge">
            <OwnerAvatar :profile="rowMeta(t).owner!" :size="16" />
          </span>
        </div>
        <div class="row-text">
          <span class="row-title">{{ rowMeta(t).title }}</span>
          <span class="row-sub">{{ rowMeta(t).subtitle }} · {{ fullDateLabel(new Date(t.date)) }}</span>
        </div>
        <span class="row-amount" :class="rowMeta(t).amountClass">
          {{ t.type === 'expense' ? '-' : t.type === 'income' ? '+' : '' }}{{ formatMoney(t.amount, t.currency) }}
        </span>
      </button>
    </div>
  </Modal>

  <TransactionFormModal
    v-if="editingTransaction"
    :transaction="editingTransaction"
    @close="editingTransaction = null"
    @saved="editingTransaction = null"
    @duplicated="editingTransaction = null"
    @deleted="handleDeleted"
  />
</template>

<style scoped>
.search-input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 11px 14px;
  font-size: 15px;
  color: var(--text-primary);
  outline: none;
  margin-bottom: 12px;
}
.search-input:focus {
  border-color: var(--accent);
}

.hint {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  margin: 16px 0;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 60vh;
  overflow-y: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: var(--surface-2);
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 12px;
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
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-sub {
  font-size: 11.5px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-amount {
  font-size: 14px;
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
</style>
