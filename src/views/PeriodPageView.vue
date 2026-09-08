<script setup lang="ts">
  import { nextTick, onUnmounted, ref } from 'vue'
  import PeriodSwitcher from '../components/layout/PeriodSwitcher.vue'
  import { usePeriodStore } from '../stores/period'
  import {
    registerPeriodNavigator,
    type PeriodTransitionDirection,
  } from '../composables/usePeriodTransition'

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
    navigate(dx < 0 ? 'next' : 'prev')
  }

  // ---------- Slide transition ----------
  // Same animation for a swipe, the chevron clicks (PeriodSwitcher.vue emits
  // instead of calling the store directly, see there), AND double-tapping the
  // active bottom/side-nav tab to jump back to today (see
  // usePeriodTransition.ts — that one calls in from outside this component
  // entirely). `runSlide()` owns the choreography: slide the current period
  // out, run the caller's `mutate` (whatever store change it actually wants),
  // then slide the new period in from the opposite edge. Done with plain
  // classList/timers rather than <Transition> because there's nothing to
  // mount/unmount here — RouterView's component instance stays alive across a
  // period change (it just re-renders reactively), so a key-based
  // <Transition> would force an unwanted remount (losing scroll/select-mode
  // state, flashing the Teleport-ed FAB in OperationsDataView.vue) just to get
  // an enter/leave hook.
  const SLIDE_OUT_MS = 160
  const SLIDE_IN_MS = 220

  const contentEl = ref<HTMLElement | null>(null)
  const navigating = ref(false)

  function wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  async function runSlide(direction: PeriodTransitionDirection, mutate: () => void) {
    if (navigating.value) return
    const el = contentEl.value
    if (!el) {
      mutate()
      return
    }
    navigating.value = true

    el.classList.add(direction === 'next' ? 'slide-exit-next' : 'slide-exit-prev')
    await wait(SLIDE_OUT_MS)

    mutate()
    await nextTick() // let the new period's content actually paint before it slides in

    // Snap the (now new) content to the opposite edge with transitions
    // disabled, force layout so the browser commits that as a real frame,
    // then drop back to the base class — the resulting change (edge → resting
    // position) is what animates in.
    el.classList.remove('slide-exit-next', 'slide-exit-prev')
    el.classList.add('slide-snap', direction === 'next' ? 'slide-enter-next' : 'slide-enter-prev')
    void el.offsetWidth
    el.classList.remove('slide-snap', 'slide-enter-next', 'slide-enter-prev')

    await wait(SLIDE_IN_MS)
    navigating.value = false
  }

  function navigate(direction: PeriodTransitionDirection) {
    if (period.granularity === 'all') return
    runSlide(direction, () => (direction === 'next' ? period.next() : period.prev()))
  }

  const unregisterPeriodNavigator = registerPeriodNavigator(runSlide)
  onUnmounted(unregisterPeriodNavigator)
</script>

<template>
  <div class="view">
    <PeriodSwitcher @prev="navigate('prev')" @next="navigate('next')" />
    <div class="view-scroll" @touchstart="onTouchStart" @touchend="onTouchEnd">
      <div
        ref="contentEl"
        class="view-scroll-content"
        :class="{ 'is-navigating': navigating }"
      >
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

.view-scroll-content {
  transition: transform 0.22s ease-out, opacity 0.22s ease-out;
}

.view-scroll-content.is-navigating {
  /* Blocks taps on rows/buttons mid-slide instead of letting a stray tap
     land on content that's still animating into place. */
  pointer-events: none;
}

.view-scroll-content.slide-exit-next,
.view-scroll-content.slide-exit-prev {
  transition-duration: 0.16s;
  transition-timing-function: ease-in;
}
.view-scroll-content.slide-exit-next {
  transform: translateX(-100%);
  opacity: 0;
}
.view-scroll-content.slide-exit-prev {
  transform: translateX(100%);
  opacity: 0;
}

.view-scroll-content.slide-snap {
  transition: none;
}
.view-scroll-content.slide-enter-next {
  transform: translateX(100%);
  opacity: 0;
}
.view-scroll-content.slide-enter-prev {
  transform: translateX(-100%);
  opacity: 0;
}
</style>
