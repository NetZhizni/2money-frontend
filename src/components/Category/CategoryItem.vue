<template>
  <div class="category">
    <div class="category-name">{{ props.name }}</div>
    <div
      class="icon-circle"
      :style="{ color: props.color }"
    >
      <Icon :icon="`mdi:${props.icon}`" />
    </div>
    <div class="category-amount">{{ props.amount }}</div>
  </div>
</template>

<script setup>
  import { ref, defineProps, defineEmits } from 'vue'
  import { Icon } from '@iconify/vue'
  const props = defineProps({
    name: { type: String, required: true, default: '' },
    amount: { type: String, required: true, default: '' },
    icon: { type: String, required: true, default: '' },
    color: { type: String, required: true, default: '' },
  })
  // const emit = defineEmits({
  // 'update:modelValue': (value) => typeof value === 'string',
  // })
</script>

<style scoped>
  .category {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
  }

  .category-name {
    font-size: 12px;
    color: #333;
    margin-bottom: 8px;
    font-weight: 500;
    white-space: nowrap;
  }

  .icon-circle {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 26px;
    margin-bottom: 6px;
    background-color: color-mix(in srgb, currentColor 25%, transparent);
  }

  .category-amount {
    font-size: 11px;
    color: #999;
  }
</style>
