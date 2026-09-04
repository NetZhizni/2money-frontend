<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import MdiIcon from '../common/MdiIcon.vue'
import { NAV_TABS as tabs } from '../../utils/navTabs'
import { usePeriodStore } from '../../stores/period'
import { t } from '../../i18n'

const route = useRoute()
const period = usePeriodStore()

// Repeat-clicking the already-active tab doesn't navigate anywhere (we're
// already there) — jump the period back to "current" instead, on tabs that
// show one. Granularity (day/week/month/year) is left untouched.
function onTabClick(tab: (typeof tabs)[number]) {
  if (tab.hasPeriod && route.path === tab.to) period.goToToday()
}
</script>

<template>
  <nav class="side-nav">
    <div class="brand">
      <MdiIcon name="mdiWalletOutline" :size="26" color="var(--accent)" />
      <span>2Money</span>
    </div>
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="item"
      active-class="active"
      @click="onTabClick(tab)"
    >
      <MdiIcon :name="tab.icon" :size="20" />
      <span>{{ t(tab.labelKey) }}</span>
    </RouterLink>
  </nav>
</template>

<style lang="scss" scoped>
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
  @include transition();

  @include hover() {
    background: var(--surface-2);
  }
}

.item:active {
  transform: scale(0.98);
}

.item.active {
  background: var(--surface-2);
  color: var(--nav-active);
}
</style>
