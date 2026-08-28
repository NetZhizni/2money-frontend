<script setup lang="ts">
import { RouterLink } from 'vue-router'
import MdiIcon from '../common/MdiIcon.vue'
import { NAV_TABS as tabs } from '../../utils/navTabs'
</script>

<template>
  <nav class="bottom-nav">
    <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.to" class="tab" active-class="active">
      <MdiIcon :name="tab.icon" :size="24" />
      <span>{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
  z-index: 20;
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  flex: 1;
  max-width: 110px;
  transition: color 0.15s ease, transform 0.15s ease;
}

.tab:active {
  transform: scale(0.92);
}

.tab.active {
  color: var(--nav-active);
}

.tab.active :deep(svg) {
  animation: nav-pop 0.25s ease;
}

@keyframes nav-pop {
  from {
    transform: scale(0.7);
  }
}
</style>
