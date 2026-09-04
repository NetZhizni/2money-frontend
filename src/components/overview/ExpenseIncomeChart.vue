<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { formatMoney } from '../../utils/format'
import { t } from '../../i18n'

// ApexCharts is a large dependency (~500KB+) — load it only once a chart
// actually needs to render instead of bundling it into every route that
// merely imports this component, which was making page/route loads feel slow.
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))

/**
 * One bar of the chart, in whatever unit the current period granularity
 * uses (a day within a week/month, a month within a year, a year within
 * "all time") — the caller (OverviewView) is responsible for building these
 * per-granularity and providing display-ready labels, since "day of month"
 * stopped being the only shape once Day/Week/Month/Year/All views existed.
 */
export interface PeriodBar {
  key: string | number
  label: string // shown under the bar on the x-axis
  tooltipLabel: string // shown in the hover tooltip
  expense: number
  income: number
}

const props = defineProps<{ bars: PeriodBar[]; currency: string }>()

const { colors, mode } = useChartColors()

type ViewMode = 'bars' | 'trend'
const view = ref<ViewMode>('bars')

// Only label roughly every Nth bar to avoid crowding, plus first/last — N
// scales with the bar count so this reads fine whether there are 7 (week),
// 31 (month), 12 (year) or however many years ("all").
const labelStep = computed(() => Math.max(1, Math.ceil(props.bars.length / 5)))

// Blank out the skipped categories up front rather than filtering them in a
// labels.formatter callback: for a category (non-datetime) x-axis ApexCharts
// calls that formatter as (value, index) with no third `opts` argument, so an
// `opts.i`-based check silently never fires and every label ends up shown.
const xCategories = computed(() =>
  props.bars.map((b, i) => (i % labelStep.value === 0 || i === props.bars.length - 1 ? b.label : '')),
)

const tooltipXFormatter = (_val: number, opts?: { dataPointIndex: number }) =>
  props.bars[opts?.dataPointIndex ?? 0]?.tooltipLabel ?? ''

// vue3-apexcharts pushes every reactive `options` change through
// `updateOptions(JSON.parse(JSON.stringify(options)))` (see its
// vue3-apexcharts-core.js) — a JSON round-trip that silently drops the
// yaxis/tooltip formatter *functions* below, so the axis falls back to
// ApexCharts' raw default number formatting (e.g. "100000.00000000000000",
// no currency symbol) the moment anything (currency, theme, the bars data
// itself) changes after the initial mount. Only the mount path preserves
// functions, so we force a full remount on any change that would otherwise
// hit that lossy update path.
//
// This used to gate the remount on `JSON.stringify([...])` of the relevant
// inputs, i.e. only when their *content* actually changed. But the parent
// view keeps this component mounted across background-sync refreshes of the
// same period (see OverviewDataView.vue's own, coarser `:key`), and each
// refresh hands down a brand new `bars` array reference even when the totals
// haven't moved — same JSON, no remount, yet `barsOptions`/`trendOptions`
// still recompute to a new object and get pushed through the lossy update
// path, silently killing the formatter until the *content* next changes.
// Track raw reference changes instead so every actual prop/theme update
// forces a remount, whether or not the content happens to match.
const chartVersion = ref(0)
watch([() => props.bars, () => props.currency, mode, colors], () => {
  chartVersion.value++
})

// Default view: expense/income columns with the net-balance trend overlaid as
// a line on the same axis — replaces what used to be two separate cards
// (a bar chart and a standalone "Динаміка чистого балансу" area chart) with
// one chart that shows both at a glance.
const barsSeries = computed(() => [
  { name: t('overview.expenses'), type: 'column', data: props.bars.map((b) => b.expense) },
  { name: t('overview.income'), type: 'column', data: props.bars.map((b) => b.income) },
  { name: t('overview.netBalance'), type: 'line', data: props.bars.map((b) => b.income - b.expense) },
])

const barsOptions = computed(() => ({
  chart: {
    type: 'line' as const,
    toolbar: { show: false },
    zoom: { enabled: false },
    background: 'transparent',
    animations: { speed: 400 },
  },
  theme: { mode: mode.value },
  colors: [colors.value.expense, colors.value.income, colors.value.accent],
  stroke: { width: [0, 0, 3], curve: 'smooth' as const },
  markers: { size: [0, 0, 3], strokeWidth: 0 },
  plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
  fill: {
    type: ['gradient', 'gradient', 'solid'],
    gradient: { shadeIntensity: 1, opacityFrom: 0.9, opacityTo: 0.65, type: 'vertical' },
  },
  dataLabels: { enabled: false },
  grid: { borderColor: colors.value.border, strokeDashArray: 3 },
  legend: { position: 'bottom' as const, labels: { colors: colors.value.textSecondary }, markers: { size: 5 } },
  xaxis: {
    categories: xCategories.value,
    labels: { style: { colors: colors.value.textMuted } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { colors: colors.value.textMuted }, formatter: (v: number) => formatMoney(v, props.currency) },
  },
  tooltip: {
    theme: mode.value,
    x: { formatter: tooltipXFormatter },
    y: { formatter: (v: number) => formatMoney(v, props.currency) },
  },
}))

// Trend view: net-balance-only area chart, for a cleaner read of the overall
// direction across the period without the column clutter.
const trendSeries = computed(() => [{ name: t('overview.netBalance'), data: props.bars.map((b) => b.income - b.expense) }])

const trendOptions = computed(() => ({
  chart: {
    type: 'area' as const,
    toolbar: { show: false },
    zoom: { enabled: false },
    background: 'transparent',
    animations: { speed: 400 },
  },
  theme: { mode: mode.value },
  colors: [colors.value.accent],
  stroke: { curve: 'smooth' as const, width: 2.5 },
  dataLabels: { enabled: false },
  markers: { size: 0 },
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] },
  },
  grid: { borderColor: colors.value.border, strokeDashArray: 3 },
  xaxis: {
    categories: xCategories.value,
    labels: { style: { colors: colors.value.textMuted } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { colors: colors.value.textMuted }, formatter: (v: number) => formatMoney(v, props.currency) },
  },
  tooltip: {
    theme: mode.value,
    x: { formatter: tooltipXFormatter },
    y: { formatter: (v: number) => formatMoney(v, props.currency) },
  },
}))
</script>

<template>
  <div class="chart-wrap">
    <div class="chart-head">
      <h3 class="section-title">{{ t('overview.expenseIncomeTitle') }}</h3>
      <div class="segmented view-toggle">
        <button :class="{ active: view === 'bars' }" @click="view = 'bars'">{{ t('overview.viewBars') }}</button>
        <button :class="{ active: view === 'trend' }" @click="view = 'trend'">{{ t('overview.viewLine') }}</button>
      </div>
    </div>
    <div class="chart-body">
      <Transition name="chart-fade" mode="out-in">
        <VueApexCharts
          v-if="view === 'bars'"
          :key="`bars-${chartVersion}`"
          type="line"
          height="240"
          :options="barsOptions"
          :series="barsSeries"
        />
        <VueApexCharts
          v-else
          :key="`trend-${chartVersion}`"
          type="area"
          height="220"
          :options="trendOptions"
          :series="trendSeries"
        />
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chart-wrap {
  width: 100%;
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title {
  font-size: 14px;
  margin: 0;
  color: var(--text-primary);
  white-space: nowrap;
}

.view-toggle {
  max-width: 190px;
}

/* Reserves the chart's footprint before vue3-apexcharts (loaded async,
   see the defineAsyncComponent above) actually mounts, so the surrounding
   layout doesn't jump once it appears. */
.chart-body {
  min-height: 240px;
}

.chart-fade-enter-active,
.chart-fade-leave-active {
  @include transition();
}
.chart-fade-enter-from,
.chart-fade-leave-to {
  opacity: 0;
}
</style>
