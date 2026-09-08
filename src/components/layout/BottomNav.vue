<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import MdiIcon from '../common/MdiIcon.vue'
import { NAV_TABS as tabs } from '../../utils/navTabs'
import { usePeriodStore } from '../../stores/period'
import { requestPeriodTransition } from '../../composables/usePeriodTransition'
import { t } from '../../i18n'

const route = useRoute()
const period = usePeriodStore()

// Repeat-clicking the already-active tab doesn't navigate anywhere (we're
// already there) — jump the period back to "current" instead, on tabs that
// show one. Granularity (day/week/month/year) is left untouched. Runs the
// same slide animation as the period chevrons/swipe (see
// usePeriodTransition.ts) — direction depends on whether today is ahead of or
// behind whatever period is currently shown; `null` means we're already on
// today's period, so there's nothing to jump to or animate.
function onTabClick(tab: (typeof tabs)[number]) {
  if (!tab.hasPeriod || route.path !== tab.to) return
  const direction = period.directionToToday()
  if (direction) requestPeriodTransition(direction, () => period.goToToday())
}

// ---------- Sliding active-tab indicator ----------
// A pill (same `--surface-2` highlight SideNav.vue uses for its own active
// item) glides behind whichever tab is active instead of the state just
// snapping over. Positioned from measured DOM rects rather than a flat
// `activeIndex * 100%` transform: tabs are `flex: 1` but capped at
// `max-width: 110px`, so past that width `justify-content: space-around`
// opens gaps between them and their slots stop being evenly spaced.
const navRef = ref<HTMLElement | null>(null)
const indicator = ref({ left: 0, width: 0, visible: false })

function updateIndicator() {
  const nav = navRef.value
  const activeEl = nav?.querySelector<HTMLElement>('.tab.active')
  if (!nav || !activeEl) {
    indicator.value = { ...indicator.value, visible: false }
    return
  }
  const navRect = nav.getBoundingClientRect()
  const elRect = activeEl.getBoundingClientRect()
  indicator.value = { left: elRect.left - navRect.left, width: elRect.width, visible: true }
}

onMounted(() => {
  updateIndicator()
  window.addEventListener('resize', updateIndicator)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateIndicator))
watch(() => route.path, () => nextTick(updateIndicator))
</script>

<template>
  <nav class="bottom-nav" ref="navRef">
    <div
      class="tab-indicator"
      :class="{ visible: indicator.visible }"
      :style="{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }"
    />
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="tab"
      active-class="active"
      @click="onTabClick(tab)"
    >
      <MdiIcon :name="tab.icon" :size="24" />
      <span>{{ t(tab.labelKey) }}</span>
    </RouterLink>
  </nav>
</template>

<style lang="scss" scoped>
.bottom-nav {
  position: relative;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
  z-index: 20;
}

.tab-indicator {
  position: absolute;
  top: 6px;
  bottom: calc(6px + env(safe-area-inset-bottom, 0px));
  left: 0;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  opacity: 0;
  pointer-events: none;
  transition:
    transform 0.25s ease,
    width 0.25s ease,
    opacity 0.15s ease;
}

.tab-indicator.visible {
  opacity: 1;
}

.tab {
  position: relative;
  z-index: 1;
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
  @include transition();
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
