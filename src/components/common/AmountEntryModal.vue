<script setup lang="ts">
import { ref, watch } from 'vue'
import Modal from './Modal.vue'
import AmountKeypad from '../transactions/AmountKeypad.vue'
import type { CurrencyDisplayStyle } from '../../utils/format'

// A one-value calculator popup for editing a plain money number anywhere in
// the app (initial balance, a budget, a filter bound, ...) — wraps
// AmountKeypad the same way TransactionFormModal.vue does, just outside a
// transaction form. See AmountFieldButton.vue for the field it's meant to
// sit behind.
const props = defineProps<{
  open: boolean
  title: string
  initialValue?: number | null
  currency: string
  // The entity (account/category) this amount belongs to's own Settings →
  // "Формат валюти" override, if any — forwarded straight to AmountKeypad.
  currencyDisplay?: CurrencyDisplayStyle | null
  label: string
  accentColor?: string
}>()
const emit = defineEmits<{ close: []; confirm: [number] }>()

const pending = ref<number | undefined>(props.initialValue ?? undefined)
// AmountKeypad keeps its typed expression as purely-internal state — bump
// this on every (re)open to force a remount back to `initialValue`, same
// trick TransactionFormModal.vue uses for its own keypad.
const keypadKey = ref(0)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    pending.value = props.initialValue ?? undefined
    keypadKey.value++
  },
)

function confirm() {
  emit('confirm', pending.value ?? 0)
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="title" @close="emit('close')">
    <AmountKeypad
      :key="keypadKey"
      :initial-value="initialValue ?? undefined"
      :currency="currency"
      :currency-display="currencyDisplay"
      :label="label"
      :accent-color="accentColor"
      @update:model-value="(v) => (pending = v)"
      @submit="confirm"
    />
  </Modal>
</template>
