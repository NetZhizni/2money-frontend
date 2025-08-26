<template>
  <div class="month__chronology">
    <div class="chronology__item">
      <div class="item__title">{{ props.monthYear }}</div>
      <div class="item__amount">{{ props.amount }}</div>
    </div>
    <slot></slot>
  </div>
</template>

<script setup>
  const props = defineProps({
    monthYear: { type: String, required: true, default: '' },
    amount: { type: [String, Number], required: false, default: '' },
  })
</script>

<style scoped lang="scss">
  .month__chronology {
    display: grid;
    padding: 16px 16px 0;
  }

  .chronology__item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }

  .item__title {
    font-size: 14px;
    font-weight: 700;
    line-height: 20px;
    letter-spacing: 0;
    color: #1e293b;
    margin: 8px 0;
  }

  .item__amount {
    color: #94a3b8;
    font-weight: 900;
    margin: 8px 0;
  }
</style>
