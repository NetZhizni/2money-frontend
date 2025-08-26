<template>
  <div class="container__calculator">
    <div>{{ props.label }}</div>
    <div
      class="calculator__result"
      @click="openCreate"
    >
      {{ integerFormatter(props.modelValue) }} {{ props.currency }}
    </div>
    <UIMyPopup
      popupType="medium"
      v-model:modelValue="isOpenAmountEditor"
      title="Редагування"
      @close="closeCreate"
    >
      <div class="calculator__popup">
        <div class="popup__result">{{ result }} {{ props.currency }}</div>
        <div class="popup__grid">
          <button
            v-for="btn in buttons"
            :key="btn.label"
            :class="['grid__btn', btn.class]"
            @pointerdown="onButtonClick(btn)"
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
  import { ref, defineProps, defineEmits, watch } from 'vue'
  import { Icon } from '@iconify/vue'
  import { integerFormatter } from '@/helpers/numberToLocal'

  const props = defineProps({
    label: { type: String, required: false, default: '' },
    modelValue: { type: String, required: true, default: '0' },
    currency: { type: String, required: false, default: '' },
    readonly: { type: Boolean, required: false, default: false },
  })
  const emit = defineEmits({
    'update:modelValue': (value) => typeof value === 'string',
  })

  const isOpenAmountEditor = ref(false)
  const result = ref('0')
  const comma = '.'

  const buttons = [
    { label: '7' },
    { label: '8' },
    { label: '9' },
    { label: 'clear', icon: 'delete-outline' },

    { label: '4' },
    { label: '5' },
    { label: '6' },
    { label: 'backspace', icon: 'backspace-outline' },

    { label: '1' },
    { label: '2' },
    { label: '3' },
    { label: 'check', icon: 'check', class: 'btn__equal' },

    { label: '00' },
    { label: '0' },
    { label: comma },
  ]

  const openCreate = () => {
    if (props.readonly) return
    isOpenAmountEditor.value = true
  }

  const closeCreate = () => {
    isOpenAmountEditor.value = false
  }

  const confirmCreate = () => {
    emit('update:modelValue', result.value)
    closeCreate()
  }

  const onButtonClick = (btn) => {
    if (btn.label === 'check') {
      confirmCreate()
      return
    }

    if (btn.label === 'clear') {
      result.value = '0'
      return
    }

    if (btn.label === 'backspace') {
      if (result.value?.length === 1) {
        result.value = '0'
        return
      }
      result.value = result.value.slice(0, -1)
      return
    }

    if (result.value.includes(comma)) {
      if (result.value.split(comma)[1].length === 2) return
    }

    if (btn.label === '00') {
      if (result.value === '0') return
      if (result.value.includes(comma)) return
      result.value += btn.label
      return
    }

    if (result.value === '0') {
      if (btn.label === '0') return
      result.value = btn.label
      return
    }
    if (btn.label === comma) {
      if (result.value.includes(comma)) return
      result.value += btn.label
      return
    }

    if (['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(btn.label)) {
      result.value += btn.label
      return
    }
  }

  watch(
    () => isOpenAmountEditor.value,
    (value) => {
      if (value) {
        result.value = props.modelValue
      } else {
        result.value = '0'
      }
    },
  )
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
    margin: 8px 0px;
    cursor: pointer;
    text-align: center;
    @include transition();
  }

  .calculator__popup {
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
    // transition: background 0.2s;
  }

  // .grid__btn:active {
  //   background: #eee;
  // }

  .btn__equal {
    background: #3949ab;
    color: white;
    grid-row: span 4;
  }
</style>
