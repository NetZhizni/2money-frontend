<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { formatMoney } from '../../utils/format'

// ApexCharts is a large dependency (~500KB+) — load it only once a chart
// actually needs to render instead of bundling it into every route that
// merely imports this component, which was making page/route loads feel slow.
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))

export interface RingSegment {
  id: string
  name?: string
  color: string
  amount: number
}

const props = withDefaults(
  defineProps<{
    segments: RingSegment[]
    expenseTotal: number
    incomeTotal: number
    currency: string
    kind?: 'expense' | 'income'
  }>(),
  { kind: 'expense' },
)

const { colors, mode } = useChartColors()

// The ring's segments always belong to whichever kind is active, so the
// centered title/primary figure must follow it too — otherwise switching to
// "Доходи" would still show a big "Витрати" total next to an income-colored ring.
const title = computed(() => (props.kind === 'income' ? 'Доходи' : 'Витрати'))
const primaryTotal = computed(() => (props.kind === 'income' ? props.incomeTotal : props.expenseTotal))
const secondaryTotal = computed(() => (props.kind === 'income' ? props.expenseTotal : props.incomeTotal))
const hasData = computed(() => props.expenseTotal > 0 || props.incomeTotal > 0)

const visibleSegments = computed(() => props.segments.filter((s) => s.amount > 0))
// An empty ring still needs one drawable slice — a single muted circle stands
// in for "no data yet" the same way the plain-SVG version used to.
const series = computed(() => (visibleSegments.value.length ? visibleSegments.value.map((s) => s.amount) : [1]))
const labels = computed(() => (visibleSegments.value.length ? visibleSegments.value.map((s) => s.name ?? '') : ['']))
const sliceColors = computed(() =>
  visibleSegments.value.length ? visibleSegments.value.map((s) => s.color) : [colors.value.surface2],
)

const options = computed(() => ({
  chart: { type: 'donut' as const, background: 'transparent', animations: { speed: 400 } },
  theme: { mode: mode.value },
  labels: labels.value,
  colors: sliceColors.value,
  dataLabels: { enabled: false },
  legend: { show: false },
  stroke: { colors: [colors.value.surface], width: visibleSegments.value.length ? 2 : 0 },
  states: { hover: { filter: { type: 'darken' as const, value: 0.9 } } },
  plotOptions: { pie: { donut: { size: '72%', labels: { show: false } } } },
  tooltip: {
    enabled: visibleSegments.value.length > 0,
    theme: mode.value,
    y: { formatter: (v: number) => formatMoney(v, props.currency) },
  },
}))
</script>

<template>
  <div class="ring-wrap">
    <VueApexCharts type="donut" width="220" height="220" :options="options" :series="series" />
    <div class="ring-center">
      <span class="ring-title">{{ title }}</span>
      <span
        class="ring-amount-primary"
        :class="[kind === 'income' ? 'ring-income' : 'ring-expense', { dim: !hasData }]"
      >
        {{ formatMoney(primaryTotal, currency) }}
      </span>
      <span
        class="ring-amount-secondary"
        :class="[kind === 'income' ? 'ring-expense' : 'ring-income', { dim: !hasData }]"
      >
        {{ formatMoney(secondaryTotal, currency) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.ring-wrap {
  position: relative;
  width: 220px;
  height: 220px;
  margin: 0 auto;
}

.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
}

.ring-title {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.ring-amount-primary {
  font-size: 17px;
  font-weight: 700;
}

.ring-amount-secondary {
  font-size: 15px;
  font-weight: 600;
}

.ring-expense {
  color: var(--expense);
}

.ring-income {
  color: var(--income);
}

.dim {
  color: var(--text-muted);
}
</style>
