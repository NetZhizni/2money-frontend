<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { formatMoney } from '../../utils/format'
import { t } from '../../i18n'

// ApexCharts is a large dependency (~500KB+) — load it only once a chart
// actually needs to render instead of bundling it into every route that
// merely imports this component, which was making page/route loads feel slow.
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))

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

const { colors, mode } = useChartColors()

const series = computed(() => props.segments.map((s) => s.amount))
const labels = computed(() => props.segments.map((s) => s.name))

const options = computed(() => ({
  chart: { type: 'donut' as const, background: 'transparent' },
  theme: { mode: mode.value },
  labels: labels.value,
  colors: props.segments.map((s) => s.color),
  dataLabels: { enabled: false },
  legend: { position: 'bottom' as const, labels: { colors: colors.value.textSecondary }, markers: { size: 5 } },
  stroke: { colors: [colors.value.surface] },
  tooltip: { theme: mode.value, y: { formatter: (v: number) => formatMoney(v, props.currency) } },
  plotOptions: { pie: { donut: { labels: { show: false } } } },
}))
</script>

<template>
  <div class="chart-wrap" :style="{ minHeight: `${CHART_HEIGHT}px` }">
    <p v-if="!segments.length" class="empty">{{ t('overview.noExpensesForPeriod') }}</p>
    <VueApexCharts v-else type="donut" :height="CHART_HEIGHT" :options="options" :series="series" />
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
.empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
