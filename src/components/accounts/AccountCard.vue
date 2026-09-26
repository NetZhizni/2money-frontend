<script setup lang="ts">
import { computed } from 'vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import OwnerAvatar from '../common/OwnerAvatar.vue'
import { formatMoney } from '../../utils/format'
import { accountTypeLabel } from '../../utils/accountTypes'
import { hasGoal } from '../../utils/savingsGoal'
import { creditStatus } from '../../utils/creditLimit'
import { t } from '../../i18n'
import type { Account, Profile } from '../../types/models'

// `owner` is set only in "view as all" (see stores/viewAs.ts), where this
// list mixes accounts from every family member — badges whose account each
// card is. Left unset the rest of the time, since there's only one owner in view.
const props = defineProps<{ account: Account; balance: number; pending?: boolean; readonly?: boolean; owner?: Profile | null }>()
defineEmits<{ click: [] }>()

const typeLabel = computed(() => accountTypeLabel(props.account.type, props.balance))

// A savings goal's progress, as a percentage of the target (see utils/savingsGoal.ts) — null without a goal.
const goalPercent = computed(() =>
  hasGoal(props.account) ? Math.round(Math.min(1, Math.max(0, props.balance / props.account.goalAmount!)) * 100) : null,
)

// With a credit limit, what can still be spent (see utils/creditLimit.ts) — null without one.
const credit = computed(() => creditStatus(props.account, props.balance))
const money = (amount: number) => formatMoney(amount, props.account.currency, { currencyDisplay: props.account.currencyDisplay })
</script>

<template>
  <div class="card">
    <button class="card-main" @click="$emit('click')">
      <div class="icon-wrap">
        <IconCircle :icon="account.icon" :color="account.color" :size="48" square />
        <span v-if="owner" class="owner-badge">
          <OwnerAvatar :profile="owner" :size="18" />
        </span>
        <span v-if="pending" class="pending-badge" :title="t('common.pendingSync')" :aria-label="t('common.pendingSync')">
          <MdiIcon name="mdiClockOutline" :size="11" color="#fff" />
        </span>
      </div>
      <div class="info">
        <span class="name">{{ account.name }}</span>
        <span class="meta">
          {{ typeLabel }}
          <MdiIcon v-if="!account.includeInTotal" name="mdiEyeOffOutline" :size="13" color="var(--text-muted)" />
        </span>
        <span v-if="goalPercent !== null" class="goal" :aria-label="t('accounts.goal.percent', { pct: goalPercent })">
          <span class="goal-track">
            <span class="goal-fill" :style="{ width: `${goalPercent}%`, background: account.color }" />
          </span>
          <span class="goal-pct">{{ t('accounts.goal.percent', { pct: goalPercent }) }}</span>
        </span>
      </div>
      <!-- Same stacked layout as a cross-currency operation's second amount (OperationsDataView.vue's .row-amount-col). -->
      <span class="amount-col">
        <span class="balance" :class="{ negative: balance < 0 }">{{ money(balance) }}</span>
        <span v-if="credit" class="credit" :class="{ over: credit.overLimit > 0 }">
          {{ credit.overLimit > 0 ? t('accounts.credit.overLimit', { amount: money(credit.overLimit) }) : t('accounts.credit.available', { amount: money(credit.available) }) }}
        </span>
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.card {
  display: flex;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.icon-wrap {
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

.card-main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  padding: 14px 16px;
  cursor: pointer;
  text-align: left;
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: 15px;
  font-weight: 600;
  @include lineClamp(1);
}

.meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.goal {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.goal-track {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: var(--surface-2);
  overflow: hidden;
}

.goal-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
}

.goal-pct {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  flex-shrink: 0;
}

.amount-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex-shrink: 0;
}

.balance {
  font-size: 15px;
  font-weight: 700;
}

/* Wraps between words instead of staying on one line: an over-limit note
   ("Ліміт перевищено на 152 011,30 ₴", longer still in other languages) would
   otherwise widen the whole list past the screen. The amount itself never
   breaks — formatMoney joins it with no-break spaces. */
.credit {
  max-width: 13em;
  font-size: 11.5px;
  font-weight: 600;
  text-align: right;
  color: var(--text-secondary);
  opacity: 0.75;
}

.credit.over {
  color: var(--expense);
  opacity: 1;
}

.balance.negative {
  color: var(--expense);
}
</style>
