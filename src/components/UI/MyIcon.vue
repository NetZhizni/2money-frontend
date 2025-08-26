<template>
  <Icon
    :style="{ fontSize: props.size }"
    :icon="props.icon"
  />
</template>

<script setup>
  import { Icon } from '@iconify/vue'
  const props = defineProps({
    icon: { type: String, required: true, default: '' },
    size: { type: String, required: false, default: '24px' },
  })
</script>

<style scoped></style>
