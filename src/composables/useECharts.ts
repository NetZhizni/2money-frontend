import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'

/**
 * Thin lifecycle wrapper around ECharts' imperative API, tailored to how
 * this app uses charts: lazy-loads the (large) echarts core + the chart
 * types/components it actually registers (see lib/echarts.ts) only once a
 * chart is about to mount — the same "don't pay for it on routes that never
 * render a chart" reasoning the ApexCharts setup used.
 *
 * Unlike vue3-apexcharts (which pushed every options change through a
 * `JSON.parse(JSON.stringify(...))` round-trip, silently dropping any
 * formatter functions after the first render), ECharts' own `setOption`
 * takes the live option object and diffs it internally, so formatter
 * functions in `option` keep working across updates with no remount hacks.
 *
 * `el` is watched (not just read once in onMounted) so a caller that swaps
 * in a *different* element for the same ref — e.g. ExpenseIncomeChart.vue
 * keys its chart container on the current view so switching views replays a
 * fade transition — gets its chart correctly torn down and re-created
 * against the new element, not left bound to a detached node.
 */
export function useECharts(el: Ref<HTMLElement | null | undefined>, option: Ref<EChartsOption>) {
  const chart = shallowRef<ECharts | null>(null)
  let resizeObserver: ResizeObserver | null = null

  function teardown() {
    resizeObserver?.disconnect()
    resizeObserver = null
    chart.value?.dispose()
    chart.value = null
  }

  async function mountTo(target: HTMLElement) {
    const { default: echarts } = await import('../lib/echarts')
    if (el.value !== target) return // el moved on (or unmounted) while the import was in flight
    teardown()
    const instance = echarts.init(target)
    instance.setOption(option.value)
    chart.value = instance
    resizeObserver = new ResizeObserver(() => instance.resize())
    resizeObserver.observe(target)
  }

  // flush: 'post' so this sees the post-render DOM — needed for the
  // keyed-element case described above, not just the initial mount.
  watch(
    el,
    (target) => {
      if (target) mountTo(target)
      else teardown()
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(teardown)

  // notMerge: true — this app always hands over a complete option object
  // (built fresh by a `computed`), so a full replace is both simpler and
  // safer than ECharts' default merge, which would otherwise leave stale
  // series/axis config around when a chart switches shape.
  watch(option, (opt) => {
    chart.value?.setOption(opt, { notMerge: true })
  })

  return { chart }
}
