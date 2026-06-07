<template>
  <div class="calculator__container">
    <div v-if="props.label">{{ props.label }}</div>

    <div
      class="calculator__result"
      @click="openCreate"
    >
      {{ customCurrencyFormatter(props.modelValue, props.currency, props.currency_display) }}
    </div>

    <UIMyPopup
      v-model="isOpenAmountEditor"
      popupType="medium"
      title="Редагування"
      @close="closeCreate"
    >
      <div>
        <div class="popup__result">
          <span
            v-if="operator"
            class="popup__sub-result"
          >
            {{ operand }} {{ getOperatorSymbol(operator) }}
          </span>
          {{ customCurrencyFormatter(Number(result) || 0, props.currency, props.currency_display) }}
        </div>

        <div class="popup__grid">
          <button
            v-for="btn in buttons"
            :key="btn.action || btn.label"
            :class="[
              'grid__btn',
              btn.class,
              { 'btn__operator--active': currentOperator === btn.action },
            ]"
            @pointerdown.prevent="onButtonClick(btn)"
          >
            <Icon
              v-if="btn.icon"
              :icon="`mdi:${btn.icon}`"
            />
            <span v-else>{{ btn.label }}</span>
          </button>
        </div>
      </div>
    </UIMyPopup>
  </div>
</template>

<script setup>
  import { ref, watch, computed } from 'vue'
  import { Icon } from '@iconify/vue'
  import { customCurrencyFormatter } from '@/helpers/numberToLocal'

  const props = defineProps({
    label: { type: String, default: '' },
    modelValue: { type: Number, required: true, default: 0 },
    currency: { type: String, default: '' },
    currency_display: { type: String, default: 'symbol' },
    readonly: { type: Boolean, default: false },
  })

  const emit = defineEmits(['update:modelValue'])

  const isOpenAmountEditor = ref(false)
  const result = ref('0')
  const DECIMAL_SEPARATOR = '.'

  const operand = ref(null)
  const operator = ref(null)
  const isWaitingForInput = ref(false)

  const currentOperator = computed(() => operator.value)

  const buttons = computed(() => {
    const isCalculating = operator.value !== null
    return [
      { action: 'add', icon: 'plus', class: 'btn__operator' },
      { action: 'subtract', icon: 'minus', class: 'btn__operator' },
      { action: 'multiply', icon: 'close', class: 'btn__operator' },
      { action: 'divide', icon: 'division', class: 'btn__operator' },

      { label: '7' },
      { label: '8' },
      { label: '9' },
      { action: 'clear', icon: 'delete-outline' },
      { label: '4' },
      { label: '5' },
      { label: '6' },
      { action: 'backspace', icon: 'backspace-outline' },
      { label: '1' },
      { label: '2' },
      { label: '3' },
      {
        action: 'check',
        icon: isCalculating ? 'equal' : 'check', // Динамічна іконка
        class: isCalculating ? 'btn__equal btn__equal--calculating' : 'btn__equal', // Можна навіть змінювати клас
      },
      { action: 'toggleSign', icon: 'plus-minus' },
      { label: '0' },
      { label: DECIMAL_SEPARATOR },
    ]
  })

  const openCreate = () => {
    if (!props.readonly) isOpenAmountEditor.value = true
  }

  const closeCreate = () => {
    isOpenAmountEditor.value = false
  }

  const confirmCreate = () => {
    const numericValue = Number(result.value) || 0
    emit('update:modelValue', numericValue)
    closeCreate()
  }

  const getOperatorSymbol = (op) => {
    const symbols = { add: '+', subtract: '−', multiply: '×', divide: '÷' }
    return symbols[op] || ''
  }

  const calculateResult = () => {
    if (operand.value === null || !operator.value) return

    const num1 = Number(operand.value)
    const num2 = Number(result.value)
    let total = 0

    switch (operator.value) {
      case 'add':
        total = num1 + num2
        break
      case 'subtract':
        total = num1 - num2
        break
      case 'multiply':
        total = num1 * num2
        break
      case 'divide':
        total = num2 !== 0 ? num1 / num2 : 0
        break
    }

    result.value = String(Math.round(total * 100) / 100)
    operand.value = null
    operator.value = null
  }

  const handleAction = (action) => {
    if (['add', 'subtract', 'multiply', 'divide'].includes(action)) {
      if (operator.value && !isWaitingForInput.value) {
        calculateResult()
      }
      operand.value = result.value
      operator.value = action
      isWaitingForInput.value = true
      return
    }

    switch (action) {
      case 'check':
        if (operator.value) {
          calculateResult()
          isWaitingForInput.value = true
        } else {
          confirmCreate()
        }
        break
      case 'clear':
        result.value = '0'
        operand.value = null
        operator.value = null
        isWaitingForInput.value = false
        break
      case 'backspace':
        if (isWaitingForInput.value) return
        if (result.value.length === 2 && result.value.startsWith('-')) {
          result.value = '0'
        } else {
          result.value = result.value.length > 1 ? result.value.slice(0, -1) : '0'
        }
        break
      case 'toggleSign':
        if (result.value !== '0' && result.value !== '0.') {
          result.value = result.value.startsWith('-') ? result.value.slice(1) : `-${result.value}`
        }
        break
    }
  }

  const handleInput = (input) => {
    if (isWaitingForInput.value) {
      result.value = input === DECIMAL_SEPARATOR ? '0.' : input
      isWaitingForInput.value = false
      return
    }

    const hasDecimal = result.value.includes(DECIMAL_SEPARATOR)

    if (hasDecimal && result.value.split(DECIMAL_SEPARATOR)[1].length >= 2) {
      return
    }

    if (input === DECIMAL_SEPARATOR) {
      if (!hasDecimal) result.value += input
      return
    }

    if (result.value === '0') {
      result.value = input === '0' ? '0' : input
    } else if (result.value === '-0') {
      result.value = input === '0' ? '-0' : `-${input}`
    } else {
      result.value += input
    }
  }

  const onButtonClick = (btn) => {
    if (btn.action) {
      handleAction(btn.action)
    } else {
      handleInput(btn.label)
    }
  }

  watch(isOpenAmountEditor, (isOpen) => {
    result.value = isOpen ? String(props.modelValue) : '0'
    operand.value = null
    operator.value = null
    isWaitingForInput.value = false
  })
</script>

<style lang="scss" scoped>
  .popup__result,
  .calculator__result {
    background: #f8f8f8;
    border: none;
    min-height: 62px;
    border-radius: 16px;
    font-size: 20px;
    padding: 16px;
    margin: 8px 0;
    cursor: pointer;
    text-align: center;
    @include transition();
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  .popup__sub-result {
    position: absolute;
    top: 4px;
    right: 16px;
    font-size: 12px;
    color: #9e9e9e;
  }

  .popup__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .grid__btn {
    background: #f8f8f8;
    border: none;
    border-radius: 16px;
    font-size: 20px;
    padding: 16px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    @include transition();

    &:active {
      background: #e0e0e0;
    }
  }

  .btn__operator {
    background: #f0f4c3;
    color: #33691e;

    &:active {
      background: #dce775;
    }
  }

  .btn__operator--active {
    background: #cddc39 !important;
    box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.2);
  }

  .btn__equal {
    background: #3949ab;
    color: white;
    grid-row: span 3;
    @include transition();

    &:active {
      background: #283593;
    }
  }

  .btn__equal--calculating {
    background: #f57c00;
    &:active {
      background: #e65100;
    }
  }
</style>
