<script setup lang="ts">
import { RouterLink } from 'vue-router'
import MdiIcon from '../common/MdiIcon.vue'
import { NAV_TABS as tabs } from '../../utils/navTabs'
</script>

<template>
  <nav class="side-nav">
    <div class="brand">
      <MdiIcon name="mdiWalletOutline" :size="26" color="var(--accent)" />
      <span>2Money</span>
    </div>
    <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.to" class="item" active-class="active">
      <MdiIcon :name="tab.icon" :size="20" />
      <span>{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.side-nav {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 17px;
  padding: 0 10px 20px;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.item:hover {
  background: var(--surface-2);
}

.item:active {
  transform: scale(0.98);
}

.item.active {
  background: var(--surface-2);
  color: var(--nav-active);
}
</style>
