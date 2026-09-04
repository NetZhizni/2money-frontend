<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import MdiIcon from '../common/MdiIcon.vue'
import { currencyDisplayText, type CurrencyDisplayStyle } from '../../utils/format'
import { t } from '../../i18n'

// A calculator-style amount entry: digits are typed onto a running operand,
// +−×÷ commit that operand into a left-to-right accumulator (no operator
// precedence — matches how a physical/pocket calculator works, not a math
// parser), and the checkmark both resolves the expression and submits the
// form. `initialValue` is read once at creation — the parent forces a remount
// via a `:key` bump (see TransactionFormModal's formResetKey) whenever the
// form itself resets, which is simpler and less failure-prone than an
// imperative reset() method racing the `open` transition.
//
// Optionally pairs with a second, currency-converted amount (`dual`) — e.g.
// an account/category pair with different currencies (see
// TransactionFormModal.vue's `dualConfig`) or a cross-currency transfer.
// Both tiles run their own independent calculator register; tapping one
// switches which register the keypad grid edits. Whichever tile hasn't been
// edited directly keeps tracking the other one via `dual.rate` (secondary
// units per 1 primary unit).
export interface DualAmountConfig {
  label: string
  currency: string
  // The secondary tile's own Settings → "Формат валюти" override, if any —
  // same resolution as the top-level `currencyDisplay` prop below (undefined
  // falls back to the current Settings choice).
  currencyDisplay?: CurrencyDisplayStyle | null
  value?: number
  rate?: number
}

const props = defineProps<{
  initialValue?: number
  currency: string
  // The primary tile's own Settings → "Формат валюти" override, if any (see
  // Account.currencyDisplay/Category.currencyDisplay) — undefined/null falls
  // back to the current Settings → "Формат валюти" choice, same as
  // formatMoney's own `opts.currencyDisplay`.
  currencyDisplay?: CurrencyDisplayStyle | null
  label: string
  accentColor?: string
  submitDisabled?: boolean
  dual?: DualAmountConfig
}>()
const emit = defineEmits<{
  'update:modelValue': [number | undefined]
  'update:dualValue': [number | undefined]
  submit: []
}>()

type Op = '+' | '−' | '×' | '÷'

function numberToCommaString(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return String(rounded).replace('.', ',')
}

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

/**
 * One independent calculator register (accumulator/pending operator/typed
 * operand) — used for the primary amount, and again for the secondary
 * "dual" tile when one is configured. Wrapped in `reactive()` so its
 * computed properties (`displayText`, `resolvedValue`, ...) auto-unwrap for
 * callers, both in script (`primary.resolvedValue`) and in the template.
 */
function makeRegister(initial?: number) {
  const accumulator = ref<number | null>(null)
  const pendingOp = ref<Op | null>(null)
  const currentText = ref(initial != null ? numberToCommaString(initial) : '')

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

  const resolvedValue = computed(() => {
    const curNum = currentText.value !== '' ? parseNum(currentText.value) : null
    if (accumulator.value == null) return curNum ?? 0
    if (pendingOp.value == null || curNum == null) return accumulator.value
    return applyOp(accumulator.value, pendingOp.value, curNum)
  })

  const hasAnyInput = computed(() => currentText.value !== '' || accumulator.value != null)

  // A pending operator in the line means there's a math operation to
  // resolve — the caller swaps the submit checkmark for "=" until it's
  // collapsed back into a plain number.
  const showEquals = computed(() => accumulator.value != null)

  function pressDigit(d: string) {
    if (currentText.value.length >= 12) return
    currentText.value = currentText.value === '0' ? d : currentText.value + d
  }

  function pressDecimal() {
    if (currentText.value.includes(',')) return
    currentText.value = currentText.value === '' ? '0,' : currentText.value + ','
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
  }

  function pressEquals() {
    const result = resolvedValue.value
    accumulator.value = null
    pendingOp.value = null
    currentText.value = numberToCommaString(result)
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
  }

  // Programmatic set (auto-derived from the other tile via the exchange
  // rate) — always collapses to a plain resolved number, same as pressEquals.
  function setValue(n: number) {
    accumulator.value = null
    pendingOp.value = null
    currentText.value = numberToCommaString(n)
  }

  return reactive({
    pendingOp,
    currentText,
    displayText,
    resolvedValue,
    hasAnyInput,
    showEquals,
    pressDigit,
    pressDecimal,
    pressOperator,
    pressEquals,
    backspace,
    setValue,
  })
}

const primary = makeRegister(props.initialValue)
// Always created (even without `dual`) so a mid-session switch into dual
// mode — e.g. picking a currency-fixed category after already typing an
// amount — has a register ready to populate, instead of needing a remount.
const secondary = makeRegister(props.dual?.value)
const activeSide = ref<'primary' | 'secondary'>('primary')
const secondaryTouched = ref(false)

const active = computed(() => (activeSide.value === 'secondary' && props.dual ? secondary : primary))
const showEquals = computed(() => active.value.showEquals)

function selectSide(side: 'primary' | 'secondary') {
  if (!props.dual) return
  activeSide.value = side
}

// Falling out of dual mode mid-session (e.g. switching to a category with no
// fixed currency) always hands the keypad back to the primary tile.
watch(
  () => !!props.dual,
  (hasDual) => {
    if (!hasDual) activeSide.value = 'primary'
  },
)

function emitPrimary() {
  emit('update:modelValue', primary.hasAnyInput ? Math.round(primary.resolvedValue * 100) / 100 : undefined)
}
function emitSecondary() {
  emit('update:dualValue', secondary.hasAnyInput ? Math.round(secondary.resolvedValue * 100) / 100 : undefined)
}

// Keeps the untouched secondary tile tracking the primary one, converted at
// `dual.rate` — re-runs whenever the primary amount changes (every keypress)
// or the rate itself changes (parent re-resolves it on date/currency
// changes). Once the user has typed into the secondary tile directly, it
// stops following and only the primary tile's own edits still emit.
watch(
  () => (props.dual ? ([primary.resolvedValue, props.dual.rate] as const) : null),
  (next) => {
    if (!next || secondaryTouched.value) return
    const [primaryValue, rate] = next
    secondary.setValue(Math.round(primaryValue * (rate ?? 1) * 100) / 100)
    emitSecondary()
  },
)

function afterEdit() {
  if (active.value === primary) {
    emitPrimary()
  } else {
    secondaryTouched.value = true
    emitSecondary()
  }
}

function pressDigit(d: string) {
  active.value.pressDigit(d)
  afterEdit()
}
function pressDecimal() {
  active.value.pressDecimal()
  afterEdit()
}
function pressOperator(op: Op) {
  active.value.pressOperator(op)
  afterEdit()
}
function backspace() {
  active.value.backspace()
  afterEdit()
}
function pressEquals() {
  active.value.pressEquals()
  afterEdit()
}

const currencySym = computed(() => currencyDisplayText(props.currency, { currencyDisplay: props.currencyDisplay }))
const dualCurrencySym = computed(() =>
  props.dual ? currencyDisplayText(props.dual.currency, { currencyDisplay: props.dual.currencyDisplay }) : '',
)
</script>

<template>
  <div class="amount-keypad">
    <div v-if="!dual" class="amount-display">
      <span class="amount-type-label">{{ label }}</span>
      <div class="amount-line">
        <span class="amount-number">{{ primary.displayText }}</span>
        <span class="amount-currency">{{ currencySym }}</span>
      </div>
    </div>

    <div v-else class="amount-display-dual">
      <button
        type="button"
        class="amount-tile"
        :class="{ active: activeSide === 'primary' }"
        @click="selectSide('primary')"
      >
        <span class="amount-type-label">{{ label }}</span>
        <div class="amount-line">
          <span class="amount-number">{{ primary.displayText }}</span>
          <span class="amount-currency">{{ currencySym }}</span>
        </div>
      </button>
      <button
        type="button"
        class="amount-tile"
        :class="{ active: activeSide === 'secondary' }"
        @click="selectSide('secondary')"
      >
        <span class="amount-type-label">{{ dual.label }}</span>
        <div class="amount-line">
          <span class="amount-number">{{ secondary.displayText }}</span>
          <span class="amount-currency">{{ dualCurrencySym }}</span>
        </div>
      </button>
    </div>

    <slot />

    <div class="keypad" :style="{ '--key-accent': accentColor ?? 'var(--accent)' }">
      <button type="button" class="key op" :class="{ active: active.pendingOp === '÷' }" @click="pressOperator('÷')">÷</button>
      <button type="button" class="key" @click="pressDigit('7')">7</button>
      <button type="button" class="key" @click="pressDigit('8')">8</button>
      <button type="button" class="key" @click="pressDigit('9')">9</button>
      <button type="button" class="key util" :aria-label="t('transactions.keypad.backspace')" @click="backspace">
        <MdiIcon name="mdiBackspaceOutline" :size="20" />
      </button>

      <button type="button" class="key op" :class="{ active: active.pendingOp === '×' }" @click="pressOperator('×')">×</button>
      <button type="button" class="key" @click="pressDigit('4')">4</button>
      <button type="button" class="key" @click="pressDigit('5')">5</button>
      <button type="button" class="key" @click="pressDigit('6')">6</button>
      <!-- Дата тепер живе окремим рядком за межами клавіатури (див.
           TransactionFormModal's FieldRow нижче) — цей інертний спейсер лише
           тримає геометрію 5-колонкової сітки, без нього наступні клавіші
           з'їхали б в цю клітинку. -->
      <button
        type="button"
        class="key submit"
        :class="{ disabled: submitDisabled && !showEquals }"
        :aria-label="showEquals ? t('transactions.keypad.equals') : t('common.save')"
        @click="showEquals ? pressEquals() : $emit('submit')"
      >
        <MdiIcon :name="showEquals ? 'mdiEqual' : 'mdiCheck'" :size="24" color="#fff" />
      </button>
      <button type="button" class="key op" :class="{ active: active.pendingOp === '−' }" @click="pressOperator('−')">−</button>
      <button type="button" class="key" @click="pressDigit('1')">1</button>
      <button type="button" class="key" @click="pressDigit('2')">2</button>
      <button type="button" class="key" @click="pressDigit('3')">3</button>
      <button type="button" class="key op" :class="{ active: active.pendingOp === '+' }" @click="pressOperator('+')">+</button>
      <button type="button" class="key" @click="pressDigit('0')">0</button>
      <button type="button" class="key" :disabled="active.currentText.includes(',')" @click="pressDecimal">,</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
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

.amount-display-dual {
  display: flex;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-2);
}

.amount-tile {
  flex: 1 1 50%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  padding: 12px 6px;
  cursor: pointer;
  @include transition();
}

.amount-tile + .amount-tile {
  border-left: 1px solid var(--border);
}

.amount-tile.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.amount-tile .amount-number,
.amount-tile .amount-currency {
  font-size: 17px;
}

.amount-type-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.amount-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
}

.amount-tile .amount-line {
  @include lineClamp(1);
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
  @include transition();
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
  grid-row: span 3;
  background: var(--key-accent);
}

.key.submit:active {
  transform: scale(0.96);
}

.key.submit.disabled {
  opacity: 0.45;
}

.key-spacer {
  pointer-events: none;
}
</style>
