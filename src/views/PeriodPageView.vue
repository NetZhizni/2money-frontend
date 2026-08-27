<script setup lang="ts">
// Shared parent-route shell for /categories, /operations and /overview —
// they only ever differed in the `.view` container's CSS, so one component
// covers all three; which variant applies is derived from the URL itself
// (no route.meta needed) since each is a distinct top-level path.
import { useRoute } from 'vue-router'
import PeriodSwitcher from '../components/layout/PeriodSwitcher.vue'

const route = useRoute()
</script>

<template>
  <div class="view" :class="`view--${route.path.slice(1)}`">
    <PeriodSwitcher />
    <RouterView />
  </div>
</template>

<style scoped>
.view {
  padding: 8px 16px 90px;
}

.view--operations {
  padding: 8px 16px 90px;
  max-width: 640px;
  margin: 0 auto;
  position: relative;
  min-height: 60vh;
}

.view--overview {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (min-width: 900px) {
  .view--overview {
    max-width: 900px;
  }
}
</style>
