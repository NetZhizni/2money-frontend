<template>
  <div
    class="nav-item"
    :class="{ 'active': props.isActive }"
  >
    <Icon
      class="i"
      :icon="`mdi:${props.icon}`"
    />
    <span>{{ props.name }}</span>
  </div>
</template>

<script setup>
  import { ref, defineProps, defineEmits } from 'vue'
  import { Icon } from '@iconify/vue'
  const props = defineProps({
    icon: { type: String, required: true, default: '' },
    name: { type: String, required: true, default: '' },
    isActive: { type: Boolean, required: false, default: false },
  })
  const emit = defineEmits({
    'update:modelValue': (value) => typeof value === 'string',
  })
</script>

<style scoped>
  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #999;
    cursor: pointer;
  }

  .nav-item .i {
    font-size: 24px;
    margin-bottom: 4px;
  }

  .nav-item span {
    font-size: 11px;
    font-weight: 500;
  }

  .nav-item.active {
    color: #333;
  }

  .nav-item.active .i {
    font-weight: bold;
  }
</style>
