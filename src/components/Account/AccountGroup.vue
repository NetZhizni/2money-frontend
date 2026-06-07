<template>
  <div class="section-header">
    <div class="sec-title">{{ props.name }}</div>
    <div
      class="sec-total"
      :class="textColor(props.total)"
    >
      {{ customCurrencyFormatter(props.total) }}
    </div>
  </div>
  <slot></slot>
</template>

<script setup>
  import { defineProps, defineEmits } from 'vue'
  import textColor from '@/helpers/textColor'
  import { customCurrencyFormatter } from '@/helpers/numberToLocal'
  const props = defineProps({
    name: { type: String, required: true, default: '' },
    total: { type: Number, required: true, default: 0 },
  })
</script>

<style scoped>
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    margin-top: 5px;
  }

  .section-header:not(:first-child) {
    margin-top: 25px;
  }

  .sec-title {
    font-size: 16px;
    color: #27699f;
    font-weight: 500;
  }

  .sec-total {
    font-size: 15px;
    font-weight: 500;
  }
</style>
