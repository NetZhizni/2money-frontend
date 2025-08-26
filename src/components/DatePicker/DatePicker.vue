<template>
  <div class="container__date">
    <div>{{ props.label }}</div>
    <div
      class="date__result"
      @click="isOpenDatePicher = true"
    >
      {{ computedDate(props.modelValue) }}
    </div>
    <UIMyPopup
      v-model:modelValue="isOpenDatePicher"
      title="Редагування"
      btnCancelLabel="Відмінити"
      btnConfirmLabel="Обрати"
      @confirm="confirmCreate"
      @cancel="closeCreate"
      @close="closeCreate"
    >
      <q-date
        class="date__picker"
        v-model="result"
        flat
        minimal
        :locale="generateLocale()"
      />
    </UIMyPopup>
  </div>
</template>

<script setup>
  import { ref, watch } from 'vue'
  import dateToLocal from '@/helpers/dateToLocal'

  const props = defineProps({
    label: { type: String, required: false, default: '' },
    modelValue: { type: String, required: false, default: null },
  })
  const emit = defineEmits({
    'update:modelValue': (value) => typeof value === 'string',
  })

  const isOpenDatePicher = ref(false)
  const result = ref('0')

  const closeCreate = () => {
    isOpenDatePicher.value = false
  }

  const confirmCreate = () => {
    emit('update:modelValue', result.value)
    closeCreate()
  }

  const computedDate = (value) => {
    if (value) return dateToLocal(value, { dateStyle: 'long' })
    return null
  }

  // Допоміжна функція — зробити першу літеру великою
  const capitalize = (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  const generateLocale = (locale = 'uk-UA', firstDayOfWeek = 1) => {
    const formatDay = new Intl.DateTimeFormat(locale, { weekday: 'long' })
    const formatDayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const formatMonth = new Intl.DateTimeFormat(locale, { month: 'long' })
    const formatMonthShort = new Intl.DateTimeFormat(locale, { month: 'short' })

    // Дні тижня (неділя = 0)
    const baseDate = new Date(2021, 0, 3) // Неділя, 3 січня 2021
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(baseDate)
      date.setDate(baseDate.getDate() + i)
      return capitalize(formatDay.format(date))
    })

    const daysShort = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(baseDate)
      date.setDate(baseDate.getDate() + i)
      return capitalize(formatDayShort.format(date))
    })

    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2021, i, 1)
      return capitalize(formatMonth.format(date))
    })

    const monthsShort = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2021, i, 1)
      return capitalize(formatMonthShort.format(date))
    })

    return {
      days,
      daysShort,
      months,
      monthsShort,
      firstDayOfWeek,
      format24h: true,
      pluralDay: 'days',
    }
  }

  watch(
    () => isOpenDatePicher.value,
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
  .date__result {
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

  .date__picker {
    max-width: 100%;
    width: 100%;
  }
</style>
