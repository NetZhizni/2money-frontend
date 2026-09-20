<script setup lang="ts">
import { computed } from 'vue'
import IconCircle from '../common/IconCircle.vue'
import BudgetFillIcon from './BudgetFillIcon.vue'

/**
 * A category's icon wherever its budget progress matters — a ring in the
 * category's OWN color framing either a plain IconCircle (`pct` absent, no
 * budget set yet) or BudgetFillIcon's vertical fill (`pct` given). Shared by
 * CategoryTile.vue's grid, CategoryDetailModal.vue's budget section, and
 * BudgetDataView.vue's rows, so all three read as one visual language and a
 * future tweak (ring width, fill recipe, ...) only has to happen once.
 *
 * Deliberately never turns the fill red on an overspent budget (unlike
 * BudgetFillIcon's own `over` prop, still used bare where that IS wanted) —
 * flagging "over budget" on the icon itself would compete with the
 * category's own color for attention; each caller's remaining-figure TEXT is
 * where that actually gets called out instead.
 *
 * Extra attributes (e.g. a `title` tooltip) fall through to the ring `<div>`
 * automatically — this component has a single root element and doesn't
 * disable that.
 */
const props = withDefaults(
  defineProps<{
    icon: string
    color: string
    size?: number
    muted?: boolean
    /** 0..100 spend-vs-budget %, or null/undefined when no budget is set yet (renders a plain icon instead). */
    pct?: number | null
  }>(),
  { size: 56 },
)

const ringSize = computed(() => props.size + 4)
</script>

<template>
  <div class="category-icon" :style="{ width: `${ringSize}px`, height: `${ringSize}px`, borderColor: color }">
    <BudgetFillIcon v-if="pct != null" :icon="icon" :color="color" :pct="pct" :size="size" />
    <IconCircle v-else :icon="icon" :color="color" :muted="muted" :size="size" />
  </div>
</template>

<style lang="scss" scoped>
.category-icon {
  border-radius: 50%;
  border: 2px solid; // color set inline (props.color)
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
