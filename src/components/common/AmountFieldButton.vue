<script setup lang="ts">
import { ref } from 'vue'
import AmountEntryModal from './AmountEntryModal.vue'
import MdiIcon from './MdiIcon.vue'
import { formatMoney, type CurrencyDisplayStyle } from '../../utils/format'
import { t } from '../../i18n'

// Drop-in replacement for a plain `<input type="number">` money field —
// looks like the app's usual `.field` input, but tapping it opens the
// calculator (AmountEntryModal) instead of a native numeric keyboard. Used
// for the operations filter's amount range. Fields that sit in a FieldRow
// (account initial balance, category budget, ...) drive AmountEntryModal
// directly instead — a FieldRow's whole row needs to open the calculator,
// and nesting this component's own `<button>` inside FieldRow's `<button>`
// (when FieldRow itself is the click target) isn't valid HTML.
const props = defineProps<{
  modelValue?: number | null
  currency: string
  // The entity (account/category) this amount belongs to's own Settings →
  // "Формат валюти" override, if any — used for both this button's own
  // closed-state display and forwarded to the calculator it opens.
  currencyDisplay?: CurrencyDisplayStyle | null
  label: string
  placeholder?: string
  // Adds a small "×" to reset back to `null` (an unset filter bound) without
  // opening the calculator — not needed for fields that always hold a number.
  clearable?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [number | null] }>()

const open = ref(false)
</script>

<template>
  <div class="amount-field-btn-wrap">
    <button type="button" class="amount-field-btn" @click="open = true">
      <span class="value" :class="{ placeholder: modelValue == null }">
        {{ modelValue != null ? formatMoney(modelValue, currency, { currencyDisplay }) : (placeholder ?? '—') }}
      </span>
      <MdiIcon name="mdiCalculatorVariantOutline" :size="18" color="var(--text-muted)" />
    </button>
    <button
      v-if="clearable && modelValue != null"
      type="button"
      class="clear-btn"
      :aria-label="t('common.clear')"
      @click="emit('update:modelValue', null)"
    >
      <MdiIcon name="mdiClose" :size="15" />
    </button>
  </div>

  <AmountEntryModal
    :open="open"
    :title="label"
    :initial-value="modelValue"
    :currency="currency"
    :currency-display="currencyDisplay"
    :label="label"
    @close="open = false"
    @confirm="(v) => emit('update:modelValue', v)"
  />
</template>

<style lang="scss" scoped>
.amount-field-btn-wrap {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.amount-field-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 11px 14px;
  font-size: 15px;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  @include transition();
}

.amount-field-btn:active {
  transform: scale(0.99);
}

.value {
  flex: 1;
  min-width: 0;
  @include lineClamp(1);
}

.value.placeholder {
  color: var(--text-muted);
}

.clear-btn {
  flex-shrink: 0;
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
}
</style>
