<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useAccountsStore } from '../../stores/accounts'
import { useDisplayCurrencyStore } from '../../stores/displayCurrency'
import { useLatestRun } from '../../composables/useLatestRun'
import { useCountUp } from '../../composables/useCountUp'
import { formatMoney } from '../../utils/format'
import MdiIcon from '../common/MdiIcon.vue'
import CurrencyPickerModal from './CurrencyPickerModal.vue'
import SearchModal from './SearchModal.vue'
import SettingsModal from './SettingsModal.vue'
import SyncStatusBadge from './SyncStatusBadge.vue'

const accounts = useAccountsStore()
const displayCurrency = useDisplayCurrencyStore()

const totalBalance = ref<number | null>(null)
const totalBalanceGuard = useLatestRun()
watchEffect(async () => {
  const run = totalBalanceGuard.start()
  const value = await accounts.totalBalanceInBase(displayCurrency.effective)
  if (!totalBalanceGuard.isCurrent(run)) return // a newer recompute started meanwhile (e.g. another profile's data arrived) — discard
  totalBalance.value = value
})
const animatedTotalBalance = useCountUp(totalBalance)

const showSearch = ref(false)
const showCurrencyPicker = ref(false)
const showSettings = ref(false)
</script>

<template>
  <header class="top-header">
    <div class="header-row">
      <button class="icon-btn" aria-label="Налаштування" @click="showSettings = true">
        <MdiIcon name="mdiAccountCircleOutline" :size="26" />
      </button>
      <div class="icon-btn-spacer" aria-hidden="true"></div>
      <div class="balance-wrap">
        <button class="balance" @click="showCurrencyPicker = true">
          <span class="label">
            Всі рахунки
            <MdiIcon name="mdiChevronDown" :size="13" color="var(--text-secondary)" />
          </span>
          <span class="value" :class="{ negative: (totalBalance ?? 0) < 0 }">
            {{ totalBalance === null ? '…' : formatMoney(animatedTotalBalance ?? 0, displayCurrency.effective) }}
          </span>
        </button>
      </div>
      <SyncStatusBadge />
      <button class="icon-btn" aria-label="Пошук" @click="showSearch = true">
        <MdiIcon name="mdiMagnify" :size="24" />
      </button>
    </div>
  </header>

  <CurrencyPickerModal v-if="showCurrencyPicker" @close="showCurrencyPicker = false" />
  <SearchModal v-if="showSearch" @close="showSearch = false" />
  <SettingsModal v-if="showSettings" @close="showSettings = false" />
</template>

<style scoped>
.top-header {
  background: var(--page-bg);
  padding: 14px 12px 10px;
  z-index: 30;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-primary);
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  transition: transform 0.12s ease;
}

.icon-btn:active {
  transform: scale(0.88);
}

.icon-btn-spacer {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.balance-wrap {
  flex: 1;
  min-width: 0;
}

.balance {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px 6px;
  width: 100%;
  min-width: 0;
  transition: transform 0.12s ease;
}

.balance:active {
  transform: scale(0.96);
}

.balance .label {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
}

.balance .value {
  font-size: 18px;
  font-weight: 700;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.balance .value.negative {
  color: var(--expense);
}
</style>
