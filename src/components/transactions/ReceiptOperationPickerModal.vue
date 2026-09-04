<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { useTransactionsStore } from '../../stores/transactions'
import { useCategoriesStore } from '../../stores/categories'
import { useAccountsStore } from '../../stores/accounts'
import { isMergeable } from '../../utils/receiptMerge'
import { dateKey, formatMoney } from '../../utils/format'
import { t } from '../../i18n'
import type { Transaction } from '../../types/models'

/**
 * "Додати операцію в чек" — opened from ReceiptEditModal.vue. Candidates are
 * every OWN operation that already shares the chek's account + calendar day
 * (the same "one account, one day" invariant a scan applies uniformly to its
 * drafts) and isn't already spoken for by another real chek — same
 * eligibility rule as the "Об'єднати в чек" multi-select on the Operations
 * page (see utils/receiptMerge.ts). Multi-select via checkbox, confirmed at
 * once; ReceiptEditModal decides what to do with the picked ids (attach
 * immediately for an already-existing chek, stage locally for one still being
 * created — see its own onOperationsPicked()).
 */
const props = defineProps<{ open: boolean; accountId: string; dateKeyVal: string; excludeIds: string[] }>()
const emit = defineEmits<{ close: []; confirm: [string[]] }>()

const transactions = useTransactionsStore()
const categories = useCategoriesStore()
const accounts = useAccountsStore()

// Every candidate below shares this same `accountId` (see the doc comment
// above) — its own Settings → "Формат валюти" override, if any, for the
// amount column.
const accountCurrencyDisplay = computed(() => accounts.all.find((a) => a.id === props.accountId)?.currencyDisplay)

const selected = ref<Set<string>>(new Set())

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    selected.value = new Set()
  },
)

const candidates = computed<Transaction[]>(() =>
  transactions.all.filter(
    (tx) =>
      tx.accountId === props.accountId &&
      dateKey(tx.date) === props.dateKeyVal &&
      !props.excludeIds.includes(tx.id) &&
      isMergeable(transactions.all, tx),
  ),
)

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function itemIcon(tx: Transaction): string {
  const sub = categories.byId(tx.subcategoryId ?? undefined)
  const cat = categories.byId(tx.categoryId ?? undefined)
  return sub?.icon ?? cat?.icon ?? 'mdiHelpCircleOutline'
}
function itemColor(tx: Transaction): string {
  const sub = categories.byId(tx.subcategoryId ?? undefined)
  const cat = categories.byId(tx.categoryId ?? undefined)
  return sub?.color ?? cat?.color ?? '#9a9a9e'
}
function itemTitle(tx: Transaction): string {
  const sub = categories.byId(tx.subcategoryId ?? undefined)
  const cat = categories.byId(tx.categoryId ?? undefined)
  return cat ? (sub ? `${cat.name} (${sub.name})` : cat.name) : '—'
}

function confirm() {
  if (!selected.value.size) return
  emit('confirm', [...selected.value])
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="t('receipts.pickerTitle')" top @close="emit('close')">
    <div v-if="!candidates.length" class="empty">
      {{ t('receipts.pickerEmpty') }}
    </div>

    <div v-else class="op-list">
      <button v-for="tx in candidates" :key="tx.id" type="button" class="op-row" @click="toggle(tx.id)">
        <MdiIcon
          :name="selected.has(tx.id) ? 'mdiCheckCircle' : 'mdiCircleOutline'"
          :size="20"
          :color="selected.has(tx.id) ? 'var(--accent)' : 'var(--text-muted)'"
        />
        <IconCircle :icon="itemIcon(tx)" :color="itemColor(tx)" :size="38" />
        <span class="op-text">
          <span class="op-title">{{ itemTitle(tx) }}</span>
          <span v-if="tx.note" class="op-note">{{ tx.note }}</span>
        </span>
        <span class="op-amount" :class="tx.type">
          {{ tx.type === 'income' ? '+' : '-' }}{{ formatMoney(tx.amount, tx.currency, { currencyDisplay: accountCurrencyDisplay }) }}
        </span>
      </button>
    </div>

    <button type="button" class="btn btn-primary confirm-btn" :disabled="!selected.size" @click="confirm">
      {{ t('receipts.pickerAdd') }}{{ selected.size ? ` (${selected.size})` : '' }}
    </button>
  </Modal>
</template>

<style lang="scss" scoped>
.empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 20px 4px;
  text-align: center;
}

.op-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.op-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: var(--surface-2);
  border: none;
  border-radius: var(--radius-sm, 8px);
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
}

.op-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.op-title {
  font-size: 13.5px;
  font-weight: 600;
  @include lineClamp(1);
}

.op-note {
  font-size: 11.5px;
  color: var(--text-muted);
  font-style: italic;
}

.op-amount {
  font-size: 13.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.op-amount.expense {
  color: var(--expense);
}
.op-amount.income {
  color: var(--income);
}

.confirm-btn {
  width: 100%;
  margin-top: 14px;
}
</style>
