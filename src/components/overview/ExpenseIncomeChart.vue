<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { useECharts } from '../../composables/useECharts'
import { formatMoney } from '../../utils/format'
import { withAlpha } from '../../utils/color'
import { t } from '../../i18n'
import Segmented from '../common/Segmented.vue'
import type { EChartsOption } from 'echarts'

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

/**
 * `kind` narrows the chart to a single series (Overview's Витрати/Доходи
 * toggle) — omitted, it renders the original combined view (both bars plus
 * the net-balance line), same as before that toggle existed.
 */
const props = defineProps<{ bars: PeriodBar[]; currency: string; kind?: 'expense' | 'income' }>()

const { colors } = useChartColors()

const title = computed(() => {
  if (props.kind === 'expense') return t('overview.expenses')
  if (props.kind === 'income') return t('overview.income')
  return t('overview.expenseIncomeTitle')
})

const chartEl = ref<HTMLElement | null>(null)

type ViewMode = 'bars' | 'trend'
const view = ref<ViewMode>('bars')
const viewOptions = computed(() => [
  { value: 'bars', label: t('overview.viewBars') },
  { value: 'trend', label: t('overview.viewLine') },
])

// Only label roughly every Nth bar to avoid crowding, plus first/last — N
// scales with the bar count so this reads fine whether there are 7 (week),
// 31 (month), 12 (year) or however many years ("all").
const labelStep = computed(() => Math.max(1, Math.ceil(props.bars.length / 5)))

// Blank out the skipped categories up front rather than filtering them in an
// axisLabel.formatter callback, so the skip logic lives in one place instead
// of being re-derived from the label's position in a callback.
const xCategories = computed(() =>
  props.bars.map((b, i) => (i % labelStep.value === 0 || i === props.bars.length - 1 ? b.label : '')),
)

interface AxisTooltipParam {
  dataIndex: number
  seriesName?: string
  value?: number
  marker?: string
}

// Shared by both views: header is the hovered bar's full tooltipLabel (the
// x-axis itself only shows the thinned-out `xCategories`), followed by one
// money-formatted row per series in the tooltip, using the little colored
// `marker` dot ECharts hands back for each series.
function axisTooltipFormatter(params: unknown): string {
  const points = (Array.isArray(params) ? params : [params]) as AxisTooltipParam[]
  const header = props.bars[points[0]?.dataIndex ?? 0]?.tooltipLabel ?? ''
  const rows = points
    .map((p) => `${p.marker ?? ''}${p.seriesName ?? ''}: ${formatMoney(p.value ?? 0, props.currency)}`)
    .join('<br/>')
  return `${header}<br/>${rows}`
}

const sharedAxes = computed(() => ({
  grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true } as const,
  xAxis: {
    type: 'category' as const,
    data: xCategories.value,
    axisLabel: { color: colors.value.textMuted },
    axisLine: { show: false },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value' as const,
    axisLabel: { color: colors.value.textMuted, formatter: (v: number) => formatMoney(v, props.currency) },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: colors.value.border, type: 'dashed' as const } },
  },
  tooltip: {
    trigger: 'axis' as const,
    backgroundColor: colors.value.surface,
    borderColor: colors.value.border,
    textStyle: { color: colors.value.textPrimary },
    formatter: axisTooltipFormatter,
  },
}))

// Default (no `kind`) view: expense/income columns with the net-balance
// trend overlaid as a line on the same axis — replaces what used to be two
// separate cards (a bar chart and a standalone "Динаміка чистого балансу"
// area chart) with one chart that shows both at a glance. With `kind` set,
// this is just that one series' columns — Overview renders it as its own
// card instead of sharing one chart between both types.
const barsOption = computed<EChartsOption>(() => {
  if (props.kind) {
    const color = props.kind === 'expense' ? colors.value.expense : colors.value.income
    return {
      backgroundColor: 'transparent',
      color: [color],
      ...sharedAxes.value,
      series: [
        {
          name: title.value,
          type: 'bar',
          data: props.bars.map((b) => b[props.kind!]),
          barCategoryGap: '35%',
          itemStyle: { borderRadius: 4 },
        },
      ],
    }
  }
  return {
    backgroundColor: 'transparent',
    color: [colors.value.expense, colors.value.income, colors.value.accent],
    ...sharedAxes.value,
    legend: {
      bottom: 0,
      textStyle: { color: colors.value.textSecondary },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [
      {
        name: t('overview.expenses'),
        type: 'bar',
        data: props.bars.map((b) => b.expense),
        barCategoryGap: '35%',
        itemStyle: { borderRadius: 4 },
      },
      {
        name: t('overview.income'),
        type: 'bar',
        data: props.bars.map((b) => b.income),
        itemStyle: { borderRadius: 4 },
      },
      {
        name: t('overview.netBalance'),
        type: 'line',
        data: props.bars.map((b) => b.income - b.expense),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 3 },
      },
    ],
  }
})

// Trend view: an area chart for a cleaner read of the overall direction
// across the period without the column clutter — net balance by default,
// or (with `kind` set) that one series' own value trend.
const trendOption = computed<EChartsOption>(() => {
  const color = props.kind === 'expense' ? colors.value.expense : props.kind === 'income' ? colors.value.income : colors.value.accent
  const data = props.kind ? props.bars.map((b) => b[props.kind!]) : props.bars.map((b) => b.income - b.expense)
  return {
    backgroundColor: 'transparent',
    ...sharedAxes.value,
    series: [
      {
        name: props.kind ? title.value : t('overview.netBalance'),
        type: 'line',
        data,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5, color },
        itemStyle: { color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(color, 0.35) },
              { offset: 1, color: withAlpha(color, 0) },
            ],
          },
        },
      },
    ],
  }
})

const option = computed<EChartsOption>(() => (view.value === 'bars' ? barsOption.value : trendOption.value))

useECharts(chartEl, option)
</script>

<template>
  <div class="chart-wrap">
    <div class="chart-head">
      <h3 class="section-title">{{ title }}</h3>
      <Segmented class="view-toggle" :model-value="view" :options="viewOptions" @update:model-value="(v) => (view = v as ViewMode)" />
    </div>
    <div class="chart-body">
      <Transition name="chart-fade" mode="out-in">
        <div :key="view" ref="chartEl" class="chart" />
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

/* Reserves the chart's footprint before echarts (loaded async, see
   useECharts.ts) actually mounts, so the surrounding layout doesn't jump
   once it appears. */
.chart-body {
  min-height: 240px;
}

.chart {
  width: 100%;
  height: 240px;
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
