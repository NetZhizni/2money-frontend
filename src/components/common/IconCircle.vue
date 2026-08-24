<script setup lang="ts">
import { computed } from 'vue'
import MdiIcon from './MdiIcon.vue'
import { withAlpha } from '../../utils/color'

const props = withDefaults(
  defineProps<{
    icon: string
    color: string
    size?: number
    muted?: boolean // greys out when the category/account has no activity yet
  }>(),
  { size: 56 },
)

const bg = computed(() => (props.muted ? withAlpha('#9a9a9e', 0.16) : withAlpha(props.color, 0.8)))
const iconColor = computed(() => (props.muted ? '#9a9a9e' : '#ffffff'))
const iconSize = computed(() => Math.round(props.size * 0.46))
</script>

<template>
  <div class="icon-circle" :style="{ width: `${size}px`, height: `${size}px`, background: bg }">
    <MdiIcon :name="icon" :size="iconSize" :color="iconColor" />
  </div>
</template>

<style scoped>
.icon-circle {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
