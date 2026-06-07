<template>
  <div
    class="icon-base"
    :class="[`${props.type}-icon`]"
    :style="{
      color: props.color,
      width: props.size,
      height: props.size,
    }"
  >
    <Icon
      class="icon-wrapper"
      :icon="`mdi:${props.icon}`"
    />
  </div>
</template>

<script setup>
  import { ref, defineProps, defineEmits } from 'vue'
  import { Icon } from '@iconify/vue'

  const props = defineProps({
    color: { type: String, required: true, default: '' },
    icon: { type: String, required: true, default: '' },
    type: { type: String, required: false, default: 'account' },
    size: { type: String, required: false, default: '48px' },
  })
  const emit = defineEmits({
    'update:modelValue': (value) => typeof value === 'string',
  })
</script>

<style scoped>
  .icon-base {
    display: flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;

    background-color: color-mix(in srgb, currentColor 25%, transparent);
  }

  .icon-wrapper {
    width: 50%;
    height: 50%;
  }

  .transaction-icon {
    border-radius: 50%;
  }
  .account-icon {
    border-radius: 12px;
  }
</style>
