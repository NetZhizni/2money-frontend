<script setup lang="ts">
import { computed, ref } from 'vue'
import MdiIcon from '../common/MdiIcon.vue'
import { currencySymbol } from '../../utils/format'

// A calculator-style amount entry: digits are typed onto a running operand,
// +−×÷ commit that operand into a left-to-right accumulator (no operator
// precedence — matches how a physical/pocket calculator works, not a math
// parser), and the checkmark both resolves the expression and submits the
// form. `initialValue` is read once at creation — the parent forces a remount
// via a `:key` bump (see TransactionFormModal's formResetKey) whenever the
// form itself resets, which is simpler and less failure-prone than an
// imperative reset() method racing the `open` transition.
const props = defineProps<{
  initialValue?: number
  currency: string
  label: string
  accentColor?: string
  submitDisabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [number | undefined]; submit: []; openDate: [] }>()

type Op = '+' | '−' | '×' | '÷'

function numberToCommaString(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return String(rounded).replace('.', ',')
}

const accumulator = ref<number | null>(null)
const pendingOp = ref<Op | null>(null)
const currentText = ref(props.initialValue != null ? numberToCommaString(props.initialValue) : '')

function parseNum(text: string): number {
  if (text === '' || text === ',') return 0
  return parseFloat(text.replace(',', '.')) || 0
}

function applyOp(a: number, op: Op, b: number): number {
  if (op === '+') return a + b
  if (op === '−') return a - b
  if (op === '×') return a * b
  return b === 0 ? a : a / b // ÷0 left as-is rather than emitting Infinity/NaN into the form
}

function groupInt(intPart: string): string {
  return (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function formatForDisplay(text: string): string {
  const [intPart, fracPart] = text.split(',')
  const grouped = groupInt(intPart)
  return fracPart !== undefined ? `${grouped},${fracPart}` : grouped
}

// The whole expression renders on one line, e.g. "2 + 3" — not split across
// a hint row and a result row.
const displayText = computed(() => {
  if (accumulator.value == null) {
    return currentText.value !== '' ? formatForDisplay(currentText.value) : '0'
  }
  const accStr = formatForDisplay(numberToCommaString(accumulator.value))
  const curStr = currentText.value !== '' ? ` ${formatForDisplay(currentText.value)}` : ''
  return `${accStr} ${pendingOp.value ?? ''}${curStr}`
})

const currencySym = computed(() => currencySymbol(props.currency))

const resolvedValue = computed(() => {
  const curNum = currentText.value !== '' ? parseNum(currentText.value) : null
  if (accumulator.value == null) return curNum ?? 0
  if (pendingOp.value == null || curNum == null) return accumulator.value
  return applyOp(accumulator.value, pendingOp.value, curNum)
})

const hasAnyInput = computed(() => currentText.value !== '' || accumulator.value != null)

function emitValue() {
  emit('update:modelValue', hasAnyInput.value ? Math.round(resolvedValue.value * 100) / 100 : undefined)
}

// A pending operator in the line means there's a math operation to resolve —
// swap the submit checkmark for "=" until it's collapsed back into a plain
// number, then hand the key back to submit.
const showEquals = computed(() => accumulator.value != null)

function pressEquals() {
  const result = resolvedValue.value
  accumulator.value = null
  pendingOp.value = null
  currentText.value = numberToCommaString(result)
  emitValue()
}

function pressDigit(d: string) {
  if (currentText.value.length >= 12) return
  currentText.value = currentText.value === '0' ? d : currentText.value + d
  emitValue()
}

function pressDecimal() {
  if (currentText.value.includes(',')) return
  currentText.value = currentText.value === '' ? '0,' : currentText.value + ','
  emitValue()
}

function pressOperator(op: Op) {
  const curNum = currentText.value !== '' ? parseNum(currentText.value) : null
  if (accumulator.value == null) {
    accumulator.value = curNum ?? 0
  } else if (curNum != null && pendingOp.value != null) {
    accumulator.value = applyOp(accumulator.value, pendingOp.value, curNum)
  }
  pendingOp.value = op
  currentText.value = ''
  emitValue()
}

function backspace() {
  if (currentText.value !== '') {
    currentText.value = currentText.value.slice(0, -1)
  } else {
    // Nothing mid-typed — clear the whole expression rather than leaving a
    // half-cancelled accumulator/operator around.
    accumulator.value = null
    pendingOp.value = null
  }
  emitValue()
}
</script>

<template>
  <div class="amount-keypad">
    <div class="amount-display">
      <span class="amount-type-label">{{ label }}</span>
      <div class="amount-line">
        <span class="amount-number">{{ displayText }}</span>
        <span class="amount-currency">{{ currencySym }}</span>
      </div>
    </div>

    <slot />

    <div class="keypad" :style="{ '--key-accent': accentColor ?? 'var(--accent)' }">
      <button type="button" class="key op" :class="{ active: pendingOp === '÷' }" @click="pressOperator('÷')">÷</button>
      <button type="button" class="key" @click="pressDigit('7')">7</button>
      <button type="button" class="key" @click="pressDigit('8')">8</button>
      <button type="button" class="key" @click="pressDigit('9')">9</button>
      <button type="button" class="key util" aria-label="Стерти" @click="backspace">
        <MdiIcon name="mdiBackspaceOutline" :size="20" />
      </button>

      <button type="button" class="key op" :class="{ active: pendingOp === '×' }" @click="pressOperator('×')">×</button>
      <button type="button" class="key" @click="pressDigit('4')">4</button>
      <button type="button" class="key" @click="pressDigit('5')">5</button>
      <button type="button" class="key" @click="pressDigit('6')">6</button>
      <button type="button" class="key util" aria-label="Дата" @click="$emit('openDate')">
        <MdiIcon name="mdiCalendarBlankOutline" :size="20" />
      </button>

      <button type="button" class="key op" :class="{ active: pendingOp === '−' }" @click="pressOperator('−')">−</button>
      <button type="button" class="key" @click="pressDigit('1')">1</button>
      <button type="button" class="key" @click="pressDigit('2')">2</button>
      <button type="button" class="key" @click="pressDigit('3')">3</button>
      <button
        type="button"
        class="key submit"
        :class="{ disabled: submitDisabled && !showEquals }"
        :aria-label="showEquals ? 'Дорівнює' : 'Зберегти'"
        @click="showEquals ? pressEquals() : $emit('submit')"
      >
        <MdiIcon :name="showEquals ? 'mdiEqual' : 'mdiCheck'" :size="24" color="#fff" />
      </button>

      <button type="button" class="key op" :class="{ active: pendingOp === '+' }" @click="pressOperator('+')">+</button>
      <button type="button" class="key" @click="pressDigit('0')">0</button>
      <button type="button" class="key" :disabled="currentText.includes(',')" @click="pressDecimal">,</button>
    </div>
  </div>
</template>

<style scoped>
.amount-keypad {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.amount-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 0 2px;
}

.amount-type-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.amount-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.amount-number {
  font-size: 34px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.amount-currency {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
}

.keypad {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.key {
  appearance: none;
  border: none;
  background: var(--surface-2);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  min-height: 52px;
  font-size: 19px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.12s ease, transform 0.1s ease;
}

.key:active {
  transform: scale(0.95);
}

.key:disabled {
  opacity: 0.4;
  cursor: default;
}

.key.op {
  color: var(--text-secondary);
  font-weight: 600;
}

.key.op.active {
  background: color-mix(in srgb, var(--key-accent) 18%, var(--surface-2));
  color: var(--key-accent);
}

.key.util {
  color: var(--text-secondary);
}

.key.submit {
  grid-row: span 2;
  background: var(--key-accent);
}

.key.submit:active {
  transform: scale(0.96);
}

.key.submit.disabled {
  opacity: 0.45;
}
</style>
