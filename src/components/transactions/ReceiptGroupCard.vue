<script setup lang="ts">
import { computed } from 'vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import OwnerAvatar from '../common/OwnerAvatar.vue'
import { pluralize } from '../../utils/format'
import { t } from '../../i18n'
import type { Transaction, Profile } from '../../types/models'

/**
 * Один "чек" у списку операцій (views/OperationsDataView.vue) — усі
 * транзакції, збережені з одного скану чи об'єднані вручну
 * (Transaction.receiptId), згорнуті в одну картку із загальною сумою замість
 * того, щоб займати N окремих рядків. Рендер окремого пункту всередині
 * навмисно повторює вигляд звичайного `.row` там (той самий IconCircle/
 * owner-badge/pending-badge), просто трохи компактніший — це той самий
 * список, лише вкладений.
 */
const props = defineProps<{
  items: Transaction[]
  merchant: string | null
  accountName: string | null
  owner: Profile | null
  readOnly: boolean
  rowMeta: (t: Transaction) => {
    icon: string
    color: string
    square: boolean
    title: string
    subtitle: string
    amountClass: string
    owner: Profile | null
  }
  primaryAmountLabel: (t: Transaction) => string
  secondaryAmountLabel: (t: Transaction) => string | null
  isPending: (id: string) => boolean
  formatNet: (net: number) => string
  netOf: (t: Transaction) => number
}>()
const emit = defineEmits<{ editItem: [Transaction]; editReceipt: [] }>()

const total = computed(() => props.items.reduce((sum, t) => sum + props.netOf(t), 0))

const itemCountLabel = computed(() =>
  pluralize(props.items.length, {
    one: t('receipts.itemCount.one'),
    few: t('receipts.itemCount.few'),
    many: t('receipts.itemCount.many'),
    other: t('receipts.itemCount.other'),
  }),
)
</script>

<template>
  <div class="receipt-card">
    <button type="button" class="receipt-header" @click="!readOnly && emit('editReceipt')">
      <div class="row-icon-wrap">
        <IconCircle icon="mdiReceiptTextOutline" color="#6c6f7d" :size="44" />
        <span v-if="owner" class="owner-badge">
          <OwnerAvatar :profile="owner" :size="18" />
        </span>
      </div>
      <div class="receipt-text">
        <span class="receipt-title">{{ merchant || t('receipts.fallbackTitle') }}</span>
        <span class="receipt-sub">
          {{ items.length }} {{ itemCountLabel }}<template v-if="accountName"> · {{ accountName }}</template>
        </span>
      </div>
      <span class="receipt-amount" :class="{ negative: total < 0 }">{{ formatNet(total) }}</span>
    </button>

    <div class="receipt-items">
      <button
        v-for="tx in items"
        :key="tx.id"
        class="receipt-item"
        :class="{ 'receipt-item--static': readOnly }"
        @click="!readOnly && emit('editItem', tx)"
      >
        <div class="row-icon-wrap">
          <IconCircle :icon="rowMeta(tx).icon" :color="rowMeta(tx).color" :square="rowMeta(tx).square" :size="36" />
          <span v-if="isPending(tx.id)" class="pending-badge" :title="t('common.pendingSync')" :aria-label="t('common.pendingSync')">
            <MdiIcon name="mdiClockOutline" :size="10" color="#fff" />
          </span>
        </div>
        <div class="row-text">
          <span class="row-title">{{ rowMeta(tx).title }}</span>
          <span v-if="tx.note" class="row-note">{{ tx.note }}</span>
        </div>
        <span class="row-amount-col">
          <span class="row-amount" :class="rowMeta(tx).amountClass">
            {{ primaryAmountLabel(tx) }}
          </span>
          <span v-if="secondaryAmountLabel(tx)" class="row-amount row-amount-secondary" :class="rowMeta(tx).amountClass">
            {{ secondaryAmountLabel(tx) }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.receipt-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  margin-bottom: 6px;
  overflow: hidden;
}

.receipt-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
}

.receipt-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.receipt-title {
  font-size: 14.5px;
  font-weight: 600;
  @include lineClamp(1);
}

.receipt-sub {
  font-size: 12px;
  color: var(--text-muted);
  @include lineClamp(1);
}

.receipt-amount {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--expense);
  flex-shrink: 0;
}

.receipt-amount.negative {
  color: var(--expense);
}

.receipt-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px 8px;
}

.receipt-item {
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

.receipt-item--static {
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

.pending-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-muted);
  border: 2px solid var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.row-title {
  font-size: 13.5px;
  font-weight: 600;
  @include lineClamp(1);
}

.row-note {
  font-size: 11.5px;
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
  font-size: 13.5px;
  font-weight: 700;
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
  font-size: 11px;
  font-weight: 600;
  opacity: 0.75;
}
</style>
