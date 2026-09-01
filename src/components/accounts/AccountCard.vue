<script setup lang="ts">
import { computed } from 'vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import OwnerAvatar from '../common/OwnerAvatar.vue'
import { formatMoney } from '../../utils/format'
import { accountTypeLabel } from '../../utils/accountTypes'
import type { Account, Profile } from '../../types/models'

// `owner` is set only in "view as all" (see stores/viewAs.ts), where this
// list mixes accounts from every family member — badges whose account each
// card is. Left unset the rest of the time, since there's only one owner in view.
const props = defineProps<{ account: Account; balance: number; pending?: boolean; readonly?: boolean; owner?: Profile | null }>()
defineEmits<{ click: [] }>()

const typeLabel = computed(() => accountTypeLabel(props.account.type, props.account.loanDirection))
</script>

<template>
  <div class="card">
    <button class="card-main" @click="$emit('click')">
      <div class="icon-wrap">
        <IconCircle :icon="account.icon" :color="account.color" :size="48" square />
        <span v-if="owner" class="owner-badge">
          <OwnerAvatar :profile="owner" :size="18" />
        </span>
        <span v-if="pending" class="pending-badge" title="Очікує синхронізації" aria-label="Очікує синхронізації">
          <MdiIcon name="mdiClockOutline" :size="11" color="#fff" />
        </span>
      </div>
      <div class="info">
        <span class="name">{{ account.name }}</span>
        <span class="meta">
          {{ typeLabel }}
          <MdiIcon v-if="!account.includeInTotal" name="mdiEyeOffOutline" :size="13" color="var(--text-muted)" />
        </span>
      </div>
      <span class="balance" :class="{ negative: balance < 0 }">{{ formatMoney(balance, account.currency) }}</span>
    </button>
  </div>
</template>

<style scoped>
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.balance {
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}

.balance.negative {
  color: var(--expense);
}
</style>
