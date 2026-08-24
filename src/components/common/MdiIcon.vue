<script setup lang="ts">
import { computed } from 'vue'
import { getIconPath } from '../../utils/icons'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number | string
    color?: string
  }>(),
  { size: 20 },
)

const path = computed(() => getIconPath(props.name))
const dimension = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <svg
    :width="dimension"
    :height="dimension"
    viewBox="0 0 24 24"
    :fill="color ?? 'currentColor'"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="path" />
  </svg>
</template>
