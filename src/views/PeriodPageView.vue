<script setup lang="ts">
  import PeriodSwitcher from '../components/layout/PeriodSwitcher.vue'
  import { usePeriodStore } from '../stores/period'

  const period = usePeriodStore()

  // Swipe left/right over the page content switches the period (like paging
  // through a gallery: swipe left brings in the next period, swipe right
  // brings back the previous one). Only fires once the gesture is clearly
  // horizontal (past both the distance threshold and the vertical drift) so
  // it never hijacks normal vertical scrolling.
  const SWIPE_THRESHOLD = 60
  let touchStartX = 0
  let touchStartY = 0

  function onTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
  }

  function onTouchEnd(e: TouchEvent) {
    if (period.granularity === 'all') return // no prev/next in this granularity — mirrors the hidden chevrons
    const touch = e.changedTouches[0]
    const dx = touch.clientX - touchStartX
    const dy = touch.clientY - touchStartY
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) period.next()
    else period.prev()
  }
</script>

<template>
  <div class="view">
    <PeriodSwitcher />
    <div class="view-scroll" @touchstart="onTouchStart" @touchend="onTouchEnd">
      <div class="view-scroll-content">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-scroll {
  /* Let the browser handle vertical panning as usual but stop it from
     interpreting a horizontal drag here as an edge-swipe back/forward
     navigation gesture — our own touch handlers own that axis instead. */
  touch-action: pan-y;
}
</style>
