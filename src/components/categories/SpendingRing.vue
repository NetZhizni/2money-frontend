<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChartColors } from '../../composables/useChartColors'
import { useECharts } from '../../composables/useECharts'
import { formatMoney } from '../../utils/format'
import { t } from '../../i18n'
import type { EChartsOption } from 'echarts'

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

const { colors } = useChartColors()

const chartEl = ref<HTMLElement | null>(null)

// The ring's segments always belong to whichever kind is active, so the
// centered title/primary figure must follow it too — otherwise switching to
// "Доходи" would still show a big "Витрати" total next to an income-colored ring.
const title = computed(() => (props.kind === 'income' ? t('categories.income') : t('categories.expense')))
const primaryTotal = computed(() => (props.kind === 'income' ? props.incomeTotal : props.expenseTotal))
const secondaryTotal = computed(() => (props.kind === 'income' ? props.expenseTotal : props.incomeTotal))
const hasData = computed(() => props.expenseTotal > 0 || props.incomeTotal > 0)

const visibleSegments = computed(() => props.segments.filter((s) => s.amount > 0))
// An empty ring still needs one drawable slice — a single muted circle stands
// in for "no data yet" the same way the plain-SVG version used to.
const sliceData = computed(() =>
  visibleSegments.value.length
    ? visibleSegments.value.map((s) => ({ name: s.name ?? '', value: s.amount, itemStyle: { color: s.color } }))
    : [{ name: '', value: 1, itemStyle: { color: colors.value.surface2 } }],
)

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  animationDuration: 400,
  series: [
    {
      type: 'pie',
      radius: ['65%', '90%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      silent: !visibleSegments.value.length,
      label: { show: false },
      itemStyle: { borderColor: colors.value.surface, borderWidth: visibleSegments.value.length ? 2 : 0 },
      emphasis: { scale: true, scaleSize: 6 },
      data: sliceData.value,
    },
  ],
  tooltip: {
    show: visibleSegments.value.length > 0,
    trigger: 'item',
    backgroundColor: colors.value.surface,
    borderColor: colors.value.border,
    textStyle: { color: colors.value.textPrimary },
    valueFormatter: (v) => formatMoney(v as number, props.currency),
  },
}))

useECharts(chartEl, option)
</script>

<template>
  <div class="ring-wrap">
    <div ref="chartEl" class="ring-chart" />
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

.ring-chart {
  width: 220px;
  height: 220px;
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
