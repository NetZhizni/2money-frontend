<script setup lang="ts">
import { computed } from 'vue'
import MdiIcon from '../common/MdiIcon.vue'
import { withAlpha } from '../../utils/color'

/**
 * A category icon whose circle fills from the BOTTOM up, like a liquid
 * gauge, to `pct` of the way to the top — used wherever a category's
 * spend-vs-budget progress shows next to its own numbers (CategoryTile.vue's
 * grid tiles, CategoryDetailModal.vue's budget section, BudgetDataView.vue's
 * rows), replacing an earlier conic-gradient ring design.
 *
 * The glyph is always white, same as the plain (no-budget) IconCircle, so a
 * grid of tiles reads consistently regardless of which ones happen to have a
 * budget set. The empty track is a fixed dark mix of the category's color
 * (not a transparency blend) so it stays dark enough for white to read on
 * top of it no matter the hue (a light color like yellow would otherwise
 * blend to a too-pale tint in light mode) or the theme's own background.
 */
const props = withDefaults(
  defineProps<{
    icon: string
    color: string
    pct: number // 0..100
    over?: boolean
    size?: number
  }>(),
  { size: 44 },
)

const trackBg = computed(() => `color-mix(in srgb, ${props.color} 40%, black)`)
const fillBg = computed(() => (props.over ? 'var(--expense)' : withAlpha(props.color, 0.9)))
const fillHeight = computed(() => `${Math.max(0, Math.min(100, props.pct))}%`)
const iconSize = computed(() => Math.round(props.size * 0.46))
</script>

<template>
  <div class="fill-icon" :style="{ width: `${size}px`, height: `${size}px`, background: trackBg }">
    <div class="fill-icon-level" :style="{ height: fillHeight, background: fillBg }" />
    <MdiIcon :name="icon" :size="iconSize" color="#ffffff" class="fill-icon-glyph" />
  </div>
</template>

<style lang="scss" scoped>
.fill-icon {
  position: relative;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.fill-icon-level {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  @include transition(height);
}

.fill-icon-glyph {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
