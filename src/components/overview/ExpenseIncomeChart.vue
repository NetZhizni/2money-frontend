<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { formatMoney } from '../../utils/format'

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
const labelStep = computed(() => Math.max(1, Math.ceil(props.bars.length / 8)))

const xLabelFormatter = (val: string, _ts?: number, opts?: any) =>
  opts && opts.i % labelStep.value !== 0 && opts.i !== props.bars.length - 1 ? '' : val

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
// hit that lossy update path, by keying on everything the options embed.
const chartFingerprint = computed(() =>
  JSON.stringify([props.currency, mode.value, colors.value.accent, props.bars]),
)

// Default view: expense/income columns with the net-balance trend overlaid as
// a line on the same axis — replaces what used to be two separate cards
// (a bar chart and a standalone "Динаміка чистого балансу" area chart) with
// one chart that shows both at a glance.
const barsSeries = computed(() => [
  { name: 'Витрати', type: 'column', data: props.bars.map((b) => b.expense) },
  { name: 'Доходи', type: 'column', data: props.bars.map((b) => b.income) },
  { name: 'Чистий баланс', type: 'line', data: props.bars.map((b) => b.income - b.expense) },
])

const barsOptions = computed(() => ({
  chart: { type: 'line' as const, toolbar: { show: false }, background: 'transparent', animations: { speed: 400 } },
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
    categories: props.bars.map((b) => b.label),
    labels: { style: { colors: colors.value.textMuted }, formatter: xLabelFormatter },
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
const trendSeries = computed(() => [{ name: 'Чистий баланс', data: props.bars.map((b) => b.income - b.expense) }])

const trendOptions = computed(() => ({
  chart: { type: 'area' as const, toolbar: { show: false }, background: 'transparent', animations: { speed: 400 } },
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
    categories: props.bars.map((b) => b.label),
    labels: { style: { colors: colors.value.textMuted }, formatter: xLabelFormatter },
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
      <h3 class="section-title">Витрати / Доходи</h3>
      <div class="segmented view-toggle">
        <button :class="{ active: view === 'bars' }" @click="view = 'bars'">Стовпчики</button>
        <button :class="{ active: view === 'trend' }" @click="view = 'trend'">Лінія</button>
      </div>
    </div>
    <Transition name="chart-fade" mode="out-in">
      <VueApexCharts
        v-if="view === 'bars'"
        :key="`bars-${chartFingerprint}`"
        type="line"
        height="240"
        :options="barsOptions"
        :series="barsSeries"
      />
      <VueApexCharts
        v-else
        :key="`trend-${chartFingerprint}`"
        type="area"
        height="220"
        :options="trendOptions"
        :series="trendSeries"
      />
    </Transition>
  </div>
</template>

<style scoped>
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

.chart-fade-enter-active,
.chart-fade-leave-active {
  transition: opacity 0.18s ease;
}
.chart-fade-enter-from,
.chart-fade-leave-to {
  opacity: 0;
}
</style>
