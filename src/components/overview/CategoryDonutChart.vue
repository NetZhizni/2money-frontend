<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { useECharts } from '../../composables/useECharts'
import { formatMoney } from '../../utils/format'
import { t } from '../../i18n'
import type { EChartsOption } from 'echarts'

export interface DonutSegment {
  id: string
  name: string
  color: string
  amount: number
}

const props = defineProps<{ segments: DonutSegment[]; currency: string }>()

// Fixed rather than a prop (no caller needs to vary it today) — kept as a
// single constant so the empty-state placeholder below can reserve exactly
// the same footprint as the real chart.
const CHART_HEIGHT = 260

const { colors } = useChartColors()

const chartEl = ref<HTMLElement | null>(null)

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  legend: {
    bottom: 0,
    textStyle: { color: colors.value.textSecondary },
    itemWidth: 10,
    itemHeight: 10,
  },
  tooltip: {
    trigger: 'item',
    backgroundColor: colors.value.surface,
    borderColor: colors.value.border,
    textStyle: { color: colors.value.textPrimary },
    valueFormatter: (v) => formatMoney(v as number, props.currency),
  },
  series: [
    {
      type: 'pie',
      radius: ['55%', '80%'],
      center: ['50%', '42%'],
      avoidLabelOverlap: false,
      label: { show: false },
      itemStyle: { borderColor: colors.value.surface, borderWidth: 2 },
      data: props.segments.map((s) => ({ name: s.name, value: s.amount, itemStyle: { color: s.color } })),
    },
  ],
}))

useECharts(chartEl, option)
</script>

<template>
  <div class="chart-wrap" :style="{ minHeight: `${CHART_HEIGHT}px` }">
    <p v-if="!segments.length" class="empty">{{ t('overview.noExpensesForPeriod') }}</p>
    <div v-else ref="chartEl" class="chart" :style="{ height: `${CHART_HEIGHT}px` }" />
  </div>
</template>

<style scoped>
/* min-height matches CHART_HEIGHT so the "no expenses" placeholder reserves
   the same footprint as the real donut — otherwise the surrounding layout
   jumps every time segments empties out or fills back in (switching period,
   filtering, background sync). */
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
