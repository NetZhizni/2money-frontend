<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { formatMoney, MONTHS_SHORT, type CurrencyDisplayStyle } from '../../utils/format'
import { t } from '../../i18n'
import type { BalancePoint } from '../../utils/balanceHistory'

// ApexCharts is a large dependency (~500KB+) — load it only once a chart
// actually needs to render instead of bundling it into every route that
// merely imports this component, which was making page/route loads feel slow.
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))

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

const { colors, mode } = useChartColors()

function shortDateLabel(ts: number): string {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

const series = computed(() => [
  { name: t('accounts.balanceChart.seriesName'), data: props.points.map((p) => ({ x: p.date, y: p.balance })) },
])

const lineColor = computed(() => props.color ?? colors.value.accent)

const options = computed(() => ({
  chart: { type: 'area' as const, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent' },
  theme: { mode: mode.value },
  colors: [lineColor.value],
  stroke: { curve: 'straight' as const, width: 2 },
  dataLabels: { enabled: false },
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] },
  },
  grid: { borderColor: colors.value.border, strokeDashArray: 3 },
  xaxis: {
    type: 'datetime' as const,
    labels: { style: { colors: colors.value.textMuted }, formatter: shortDateLabel },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { colors: colors.value.textMuted }, formatter: (v: number) => formatMoney(v, props.currency, { currencyDisplay: props.currencyDisplay }) },
  },
  tooltip: {
    theme: mode.value,
    x: { formatter: (val: number) => shortDateLabel(val) },
    y: { formatter: (v: number) => formatMoney(v, props.currency, { currencyDisplay: props.currencyDisplay }) },
  },
}))
</script>

<template>
  <div class="chart-wrap">
    <p v-if="points.length < 2" class="empty">{{ t('accounts.balanceChart.notEnoughData') }}</p>
    <VueApexCharts v-else type="area" :height="height" :options="options" :series="series" />
  </div>
</template>

<style scoped>
.chart-wrap {
  width: 100%;
}
.empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px 0;
}
</style>
