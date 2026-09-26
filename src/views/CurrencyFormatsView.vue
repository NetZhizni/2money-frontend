<script setup lang="ts">
import { computed, ref } from 'vue'
import CurrencyPickerModal from '../components/layout/CurrencyPickerModal.vue'
import OptionListModal, { type ListOption } from '../components/common/OptionListModal.vue'
import { useSettingsStore } from '../stores/settings'
import {
  formatMoneyAs,
  formatDateAs,
  getNumberFormatSetting,
  setNumberFormatSetting,
  getDateFormatSetting,
  setDateFormatSetting,
  getCurrencyDisplaySetting,
  setCurrencyDisplaySetting,
  type NumberFormatStyle,
  type DateFormatStyle,
  type CurrencyDisplayStyle,
} from '../utils/format'
import { t } from '../i18n'

// Base currency plus the number/date/currency-display format pickers (see
// utils/format.ts), reached from SettingsModal's "Валюта і формати" entry.
// The three format settings are per-device and reload the page to apply —
// which lands back on this same page, so the new choice shows up right here.

const settings = useSettingsStore()

const showCurrencyPicker = ref(false)
const showNumberFormatPicker = ref(false)
const showDateFormatPicker = ref(false)
const showCurrencyDisplayPicker = ref(false)
const numberFormatSetting = ref<NumberFormatStyle>(getNumberFormatSetting())
const dateFormatSetting = ref<DateFormatStyle>(getDateFormatSetting())
const currencyDisplaySetting = ref<CurrencyDisplayStyle>(getCurrencyDisplaySetting())

const PREVIEW_AMOUNT = 1234.56
const numberFormatOptions = computed<ListOption[]>(() => [
  { value: 'auto', label: t('layout.settings.numberFormatAuto'), sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, 'auto') },
  { value: 'uk', label: t('layout.settings.numberFormatUk'), sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, 'uk') },
  { value: 'us', label: t('layout.settings.numberFormatUs'), sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, 'us') },
  { value: 'eu', label: t('layout.settings.numberFormatEu'), sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, 'eu') },
])
const numberFormatLabel = computed(
  () => numberFormatOptions.value.find((o) => o.value === numberFormatSetting.value)?.sublabel ?? '',
)

const PREVIEW_DATE = new Date(2026, 3, 5) // 5 April — a day/month pair that reads unambiguously in every format below
const dateFormatOptions = computed<ListOption[]>(() => [
  { value: 'iso', label: t('layout.settings.dateFormatIso'), sublabel: formatDateAs(PREVIEW_DATE, 'iso') },
  { value: 'dmy', label: t('layout.settings.dateFormatDmy'), sublabel: formatDateAs(PREVIEW_DATE, 'dmy') },
  { value: 'mdy', label: t('layout.settings.dateFormatMdy'), sublabel: formatDateAs(PREVIEW_DATE, 'mdy') },
])
const dateFormatLabel = computed(
  () => dateFormatOptions.value.find((o) => o.value === dateFormatSetting.value)?.sublabel ?? '',
)

// Each option previewed at the CURRENT number-format setting — only the
// currencyDisplay axis varies here, matching what formatMoneyAs's `opts`
// override actually does (see AccountFormModal.vue/CategoryFormModal.vue for
// the identical per-entity picker, whose "базовий вигляд" option reads this
// setting's own preview back via formatMoney's default).
const currencyDisplayOptions = computed<ListOption[]>(() => [
  {
    value: 'narrowSymbol',
    label: t('layout.settings.currencyDisplayNarrowSymbol'),
    sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, numberFormatSetting.value, { currencyDisplay: 'narrowSymbol' }),
  },
  {
    value: 'symbol',
    label: t('layout.settings.currencyDisplaySymbol'),
    sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, numberFormatSetting.value, { currencyDisplay: 'symbol' }),
  },
  {
    value: 'code',
    label: t('layout.settings.currencyDisplayCode'),
    sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, numberFormatSetting.value, { currencyDisplay: 'code' }),
  },
  {
    value: 'name',
    label: t('layout.settings.currencyDisplayName'),
    sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, numberFormatSetting.value, { currencyDisplay: 'name' }),
  },
])
const currencyDisplayLabel = computed(
  () => currencyDisplayOptions.value.find((o) => o.value === currencyDisplaySetting.value)?.sublabel ?? '',
)

function chooseNumberFormat(value: string) {
  setNumberFormatSetting(value as NumberFormatStyle)
}
function chooseDateFormat(value: string) {
  setDateFormatSetting(value as DateFormatStyle)
}
function chooseCurrencyDisplay(value: string) {
  setCurrencyDisplaySetting(value as CurrencyDisplayStyle)
}
</script>

<template>
  <div class="view">
    <div>
      <h1 class="page-title">{{ t('layout.settings.section.currencyFormats') }}</h1>
    </div>
    <div class="view-scroll">
      <div class="view-scroll-content">
        <section class="card">
          <h3 class="card-title">{{ t('layout.settings.baseCurrency') }}</h3>
          <p class="hint">{{ t('layout.settings.baseCurrencyHint') }}</p>
          <button class="btn btn-secondary wide-btn" @click="showCurrencyPicker = true">
            {{ settings.baseCurrency }}
          </button>
        </section>

        <section class="card">
          <h3 class="card-title">{{ t('layout.settings.currencyDisplay') }}</h3>
          <p class="hint">{{ t('layout.settings.currencyDisplayHint') }}</p>
          <button class="btn btn-secondary wide-btn" @click="showCurrencyDisplayPicker = true">
            {{ currencyDisplayLabel }}
          </button>
        </section>

        <section class="card">
          <h3 class="card-title">{{ t('layout.settings.numberFormat') }}</h3>
          <button class="btn btn-secondary wide-btn" @click="showNumberFormatPicker = true">
            {{ numberFormatLabel }}
          </button>
        </section>

        <section class="card">
          <h3 class="card-title">{{ t('layout.settings.dateFormat') }}</h3>
          <p class="hint">{{ t('layout.settings.dateFormatHint') }}</p>
          <button class="btn btn-secondary wide-btn" @click="showDateFormatPicker = true">
            {{ dateFormatLabel }}
          </button>
        </section>
      </div>
    </div>

    <CurrencyPickerModal
      :open="showCurrencyPicker"
      :selected="settings.baseCurrency"
      :title="t('layout.settings.currencyModalTitle')"
      :hint="t('layout.settings.currencyModalHint')"
      @close="showCurrencyPicker = false"
      @select="settings.setBaseCurrency"
    />

    <OptionListModal
      :open="showCurrencyDisplayPicker"
      :title="t('layout.settings.currencyDisplay')"
      :options="currencyDisplayOptions"
      :selected="currencyDisplaySetting"
      @close="showCurrencyDisplayPicker = false"
      @select="chooseCurrencyDisplay"
    />

    <OptionListModal
      :open="showNumberFormatPicker"
      :title="t('layout.settings.numberFormat')"
      :options="numberFormatOptions"
      :selected="numberFormatSetting"
      @close="showNumberFormatPicker = false"
      @select="chooseNumberFormat"
    />

    <OptionListModal
      :open="showDateFormatPicker"
      :title="t('layout.settings.dateFormat')"
      :options="dateFormatOptions"
      :selected="dateFormatSetting"
      @close="showDateFormatPicker = false"
      @select="chooseDateFormat"
    />
  </div>
</template>

<style lang="scss" scoped>
.page-title {
  font-size: 20px;
  margin: 8px 0 4px;
}
.card {
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: 14px;
  margin-top: 12px;
}
.card-title {
  font-size: 14px;
  margin: 0 0 6px;
  color: var(--text-primary);
}
.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
}
.wide-btn {
  width: 100%;
  margin-top: 8px;
}
</style>
