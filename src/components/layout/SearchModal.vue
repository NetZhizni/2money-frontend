<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import OwnerAvatar from '../common/OwnerAvatar.vue'
import { useTransactionsStore } from '../../stores/transactions'
import { useAllAccountsStore } from '../../stores/allAccounts'
import { useProfilesStore } from '../../stores/profiles'
import { useCategoriesStore } from '../../stores/categories'
import { useViewAsStore } from '../../stores/viewAs'
import { usePopupsStore } from '../../stores/popups'
import { formatMoney, fullDateLabel } from '../../utils/format'
import { resolveAccountLabel } from '../../utils/accountLabel'
import { TRANSFER_CATEGORY_COLOR } from '../../utils/transferAnalytics'
import { t } from '../../i18n'
import type { Profile, Transaction } from '../../types/models'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const transactions = useTransactionsStore()
const allAccounts = useAllAccountsStore()
const profiles = useProfilesStore()
const categories = useCategoriesStore()
const viewAs = useViewAsStore()
const popups = usePopupsStore()
const readOnly = computed(() => viewAs.isReadOnly)

const query = ref('')

// Stays permanently mounted — always starts from an empty search on reopen.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) query.value = ''
  },
)

function rowMeta(tx: Transaction) {
  if (tx.type === 'transfer') {
    const from = resolveAccountLabel(tx.accountId, viewAs.effectiveUid, allAccounts.all, profiles.all)
    const to = resolveAccountLabel(tx.toAccountId, viewAs.effectiveUid, allAccounts.all, profiles.all)
    // Shown with the source account's own icon/color, styled the same
    // (square) way as on the Accounts tab — falls back to the generic swap
    // icon only if the source account can no longer be resolved.
    const fromAccount = allAccounts.byId(tx.accountId)
    return {
      icon: fromAccount?.icon ?? 'mdiSwapHorizontal',
      color: fromAccount?.color ?? TRANSFER_CATEGORY_COLOR,
      square: true,
      title: t('transactions.search.transferTitle'),
      subtitle: `${from} → ${to}`,
      amountClass: 'transfer',
      searchable: `${t('transactions.search.transferTitle').toLowerCase()} ${from} ${to} ${tx.note ?? ''}`,
      // Both endpoints (possibly two different people) are already spelled
      // out above — a single corner badge would misattribute a cross-profile
      // transfer to whichever owner happened to be picked.
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
    searchable: `${category?.name ?? ''} ${sub?.name ?? ''} ${account?.name ?? ''} ${tx.note ?? ''}`,
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
    .filter((tx) => {
      const meta = rowMeta(tx)
      if (meta.searchable.toLowerCase().includes(q)) return true
      return String(tx.amount).includes(q)
    })
    .slice(0, 60)
})

function openResult(tx: Transaction) {
  popups.openTransactionForm({ transaction: tx })
}
</script>

<template>
  <Modal :open="open" :title="t('transactions.search.title')" @close="emit('close')">
    <input
      v-model="query"
      type="text"
      class="search-input"
      :placeholder="t('transactions.search.placeholder')"
      autofocus
    />

    <p v-if="!query.trim()" class="hint">{{ t('transactions.search.hint') }}</p>
    <p v-else-if="!results.length" class="hint">{{ t('transactions.search.noResults') }}</p>

    <div class="results">
      <button
        v-for="tx in results"
        :key="tx.id"
        class="row"
        :class="{ 'row--static': readOnly }"
        @click="!readOnly && openResult(tx)"
      >
        <div class="row-icon-wrap">
          <IconCircle :icon="rowMeta(tx).icon" :color="rowMeta(tx).color" :square="rowMeta(tx).square" :size="40" />
          <span v-if="rowMeta(tx).owner" class="owner-badge">
            <OwnerAvatar :profile="rowMeta(tx).owner!" :size="16" />
          </span>
        </div>
        <div class="row-text">
          <span class="row-title">{{ rowMeta(tx).title }}</span>
          <span class="row-sub">{{ rowMeta(tx).subtitle }} · {{ fullDateLabel(new Date(tx.date)) }}</span>
        </div>
        <span class="row-amount" :class="rowMeta(tx).amountClass">
          {{ tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : '' }}{{ formatMoney(tx.amount, tx.currency, { currencyDisplay: allAccounts.byId(tx.accountId)?.currencyDisplay }) }}
        </span>
      </button>
    </div>
  </Modal>
</template>

<style lang="scss" scoped>
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
  @include overflow(y);
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
  @include lineClamp(1);
}

.row-sub {
  font-size: 11.5px;
  color: var(--text-muted);
  @include lineClamp(1);
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
