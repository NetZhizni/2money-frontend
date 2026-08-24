import { onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * Smoothly animates a displayed number toward whatever `source` changes to,
 * instead of the figure just snapping — used for balance/total figures so a
 * period switch, currency switch, or a live data update reads as a
 * value "counting" to its new total rather than jumping.
 */
export function useCountUp<T extends number | null>(source: Ref<T>, duration = 500): Ref<T> {
  const display = ref(source.value) as Ref<T>
  let raf: number | null = null

  function animate(from: number, to: number) {
    if (raf != null) cancelAnimationFrame(raf)
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      display.value = (from + (to - from) * eased) as T
      raf = t < 1 ? requestAnimationFrame(step) : null
    }
    raf = requestAnimationFrame(step)
  }

  watch(source, (to, from) => {
    // Null means "loading" (not a real number) — jump straight through it
    // rather than animating from/to a placeholder.
    if (to == null || from == null) {
      if (raf != null) cancelAnimationFrame(raf)
      raf = null
      display.value = to
      return
    }
    animate(from, to)
  })

  onUnmounted(() => {
    if (raf != null) cancelAnimationFrame(raf)
  })

  return display
}
