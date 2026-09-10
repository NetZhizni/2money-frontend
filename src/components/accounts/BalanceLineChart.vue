<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { useECharts } from '../../composables/useECharts'
import { formatMoney, MONTHS_SHORT, type CurrencyDisplayStyle } from '../../utils/format'
import { withAlpha } from '../../utils/color'
import { t } from '../../i18n'
import type { BalancePoint } from '../../utils/balanceHistory'
import type { EChartsOption } from 'echarts'

const props = withDefaults(
  defineProps<{
    points: BalancePoint[]
    currency: string
    // The account's own Settings → "Формат валюти" override, if any (see
    // Account.currencyDisplay) — AccountDetailModal.vue is this chart's only
    // caller today and always has one to pass through.
    currencyDisplay?: CurrencyDisplayStyle | null
    color?: string
    height?: number
  }>(),
  { height: 220 },
)

const { colors } = useChartColors()

const chartEl = ref<HTMLElement | null>(null)

function shortDateLabel(ts: number): string {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

const lineColor = computed(() => props.color ?? colors.value.accent)

interface AxisTooltipParam {
  value: [number, number]
}

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true },
  xAxis: {
    type: 'time',
    axisLabel: { color: colors.value.textMuted, formatter: (val: number) => shortDateLabel(val) },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      color: colors.value.textMuted,
      formatter: (v: number) => formatMoney(v, props.currency, { currencyDisplay: props.currencyDisplay }),
    },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: colors.value.border, type: 'dashed' } },
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: colors.value.surface,
    borderColor: colors.value.border,
    textStyle: { color: colors.value.textPrimary },
    formatter: (params) => {
      const p = (Array.isArray(params) ? params[0] : params) as unknown as AxisTooltipParam
      const [x, y] = p.value
      return `${shortDateLabel(x)}<br/>${formatMoney(y, props.currency, { currencyDisplay: props.currencyDisplay })}`
    },
  },
  series: [
    {
      type: 'line',
      name: t('accounts.balanceChart.seriesName'),
      data: props.points.map((p) => [p.date, p.balance]),
      showSymbol: false,
      smooth: false,
      lineStyle: { color: lineColor.value, width: 2 },
      itemStyle: { color: lineColor.value },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: withAlpha(lineColor.value, 0.35) },
            { offset: 1, color: withAlpha(lineColor.value, 0) },
          ],
        },
      },
    },
  ],
}))

useECharts(chartEl, option)
</script>

<template>
  <div class="chart-wrap" :style="{ minHeight: `${height}px` }">
    <p v-if="points.length < 2" class="empty">{{ t('accounts.balanceChart.notEnoughData') }}</p>
    <div v-else ref="chartEl" class="chart" :style="{ height: `${height}px` }" />
  </div>
</template>

<style scoped>
/* min-height matches the chart's own :height prop so the "not enough data"
   placeholder reserves the same footprint as the real chart — otherwise the
   surrounding layout jumps every time points.length crosses the 2-point
   threshold (e.g. while data is loading, or a filter empties the range). */
.chart-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.chart {
  width: 100%;
}
.empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
