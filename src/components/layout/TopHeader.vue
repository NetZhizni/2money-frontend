<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { usePeriodStore } from '../../stores/period'
import { useAccountsStore } from '../../stores/accounts'
import { useDisplayCurrencyStore } from '../../stores/displayCurrency'
import { useLatestRun } from '../../composables/useLatestRun'
import { useCountUp } from '../../composables/useCountUp'
import { formatMoney, MONTHS_UK, MONTHS_UK_SHORT, MONTHS_UK_GENITIVE } from '../../utils/format'
import MdiIcon from '../common/MdiIcon.vue'
import PeriodPickerPopover from './PeriodPickerPopover.vue'
import CurrencyPickerModal from './CurrencyPickerModal.vue'
import SearchModal from './SearchModal.vue'
import SettingsModal from './SettingsModal.vue'
import SyncStatusBadge from './SyncStatusBadge.vue'

const route = useRoute()
const period = usePeriodStore()
const accounts = useAccountsStore()
const displayCurrency = useDisplayCurrencyStore()

// The period filter only affects Categories/Operations/Overview (they filter
// by `period`) — showing it on Accounts/Total/Settings looked like it should
// do something there too, but silently did nothing.
const PERIOD_AWARE_ROUTES = new Set(['categories', 'operations', 'overview'])
const showPeriodRow = computed(() => PERIOD_AWARE_ROUTES.has(String(route.name ?? '')))

const totalBalance = ref<number | null>(null)
const totalBalanceGuard = useLatestRun()
watchEffect(async () => {
  const run = totalBalanceGuard.start()
  const value = await accounts.totalBalanceInBase(displayCurrency.effective)
  if (!totalBalanceGuard.isCurrent(run)) return // a newer recompute started meanwhile (e.g. another profile's data arrived) — discard
  totalBalance.value = value
})
const animatedTotalBalance = useCountUp(totalBalance)

const showPeriodPicker = ref(false)
const showSearch = ref(false)
const showCurrencyPicker = ref(false)
const showSettings = ref(false)

function daysInCurrentMonth(): number {
  return new Date(period.year, period.month + 1, 0).getDate()
}

const periodLabel = computed(() => {
  switch (period.granularity) {
    case 'day': {
      const d = new Date(period.anchor)
      return `${d.getDate()} ${MONTHS_UK_GENITIVE[d.getMonth()]} ${d.getFullYear()}`
    }
    case 'week': {
      const s = new Date(period.start)
      const e = new Date(period.end)
      return s.getMonth() === e.getMonth()
        ? `${s.getDate()}–${e.getDate()} ${MONTHS_UK_SHORT[s.getMonth()]}`
        : `${s.getDate()} ${MONTHS_UK_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_UK_SHORT[e.getMonth()]}`
    }
    case 'month':
      return `${MONTHS_UK[period.month]} ${period.year}`
    case 'year':
      return String(period.year)
    case 'all':
      return 'Весь час'
  }
})
</script>

<template>
  <header class="top-header">
    <div class="row">
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

    <div v-if="showPeriodRow" class="row period-row">
      <button
        v-if="period.granularity !== 'all'"
        class="chevron"
        aria-label="Попередній період"
        @click="period.prev()"
      >
        <MdiIcon name="mdiChevronLeft" :size="22" />
      </button>

      <button class="period-pill" @click="showPeriodPicker = true">
        <span v-if="period.granularity === 'month'" class="day-badge">{{ daysInCurrentMonth() }}</span>
        <span>{{ periodLabel }}</span>
        <MdiIcon name="mdiChevronDown" :size="16" />
      </button>
      <PeriodPickerPopover v-if="showPeriodPicker" @close="showPeriodPicker = false" />

      <button
        v-if="period.granularity !== 'all'"
        class="chevron"
        aria-label="Наступний період"
        @click="period.next()"
      >
        <MdiIcon name="mdiChevronRight" :size="22" />
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

.row {
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

.period-row {
  justify-content: center;
  gap: 24px;
  margin-top: 10px;
}

.chevron {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.period-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-pill);
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.day-badge {
  background: var(--surface-2);
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

</style>
