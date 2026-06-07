<template>
  <div class="date-header">
    <div class="date-header-left">
      <span class="day-num">{{ dateParts.day }}</span>
      <div class="day-text">
        {{ dateParts.weekday }}<br />{{ dateParts.month }} {{ dateParts.year }}
      </div>
    </div>
    <div class="date-header-right">{{ props.total }}</div>
  </div>
  <slot></slot>
</template>

<script setup>
  import { ref, defineProps, defineEmits, computed } from 'vue'
  const props = defineProps({
    dateValue: { type: String, required: true, default: '2000-01-01T00:00:00.000Z' },
    total: { type: String, required: true, default: '0' },
  })

  const dateParts = computed(() => {
    if (!props.dateValue) return null
    const dateObj = new Date(props.dateValue)
    if (isNaN(dateObj.getTime())) return { day: '', weekday: '', month: '', year: '' }
    const formatter = new Intl.DateTimeFormat('uk-UA', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    const parts = formatter.formatToParts(dateObj)
    return parts.reduce((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value
      }
      return acc
    }, {})
  })
</script>

<style scoped>
  .date-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 15px;
    border-bottom: 1px solid #efefef;
    margin-bottom: 15px;
  }

  .date-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .date-header-left .day-num {
    text-align: right;
    width: 40px;
    font-size: 32px;
    font-weight: 300;
    color: #888;
  }

  .date-header-left .day-text {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    line-height: 1.2;
  }

  .date-header-right {
    font-size: 16px;
    font-weight: 500;
    color: #34a88b; /* Default green */
  }
  .date-header-right.expense-total {
    color: #d65a76;
  }
</style>
