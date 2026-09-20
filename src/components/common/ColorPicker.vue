<script setup lang="ts">
  import { t } from '../../i18n'

  const props = defineProps<{ modelValue: string }>()
  const emit = defineEmits<{ 'update:modelValue': [string] }>()

  // Sorted as a continuous hue gradient (red -> orange -> yellow -> green ->
  // teal -> blue -> indigo -> purple -> pink), with a few colors added to
  // smooth out gaps in the spectrum (yellow, yellow-green, blue-violet).
  // Muted/neutral tones (brown, grey, blue-grey) have no meaningful hue, so
  // they're grouped separately at the end, ordered light to dark.
  const SWATCHES = [
    // Red
    '#c62828',
    '#d32f2f',
    '#e34948',
    '#ef5350',
    // Orange
    '#ff7043',
    '#eb6834',
    '#f57f17',
    // Amber / yellow
    '#eda100',
    '#ffca28',
    '#ffeb3b',
    // Yellow-green / green
    '#7cb342',
    '#008300',
    '#43a047',
    '#66bb6a',
    // Teal
    '#1baf7a',
    '#26a69a',
    '#4db6ac',
    '#00838f',
    // Blue
    '#42a5f5',
    '#1976d2',
    '#2a78d6',
    '#5c6bc0',
    // Indigo / purple
    '#4a3aa7',
    '#5e35b1',
    '#7e57c2',
    // Magenta / pink
    '#9c27b0',
    '#ab47bc',
    '#c2185b',
    '#ec407a',
    '#f06292',
    '#e87ba4',
    // Brown
    '#8d6e63',
    '#795548',
    '#6d4c41',
    '#5d4037',
    // Grey / blue-grey
    '#bdbdbd',
    '#9a9a9e',
    '#8a8d91',
    '#78909c',
    '#616161',
    '#455a64',
    '#37474f',
    '#212121',
  ]
</script>

<template>
  <div class="picker">
    <label class="custom">
      <span>{{ t('common.customColor') }}</span>
      <input
        type="color"
        :value="modelValue"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <div class="swatches scrollbar-none">
      <button
        v-for="c in SWATCHES"
        :key="c"
        class="swatch"
        :style="{ background: c }"
        :class="{ selected: c.toLowerCase() === props.modelValue?.toLowerCase() }"
        @click="emit('update:modelValue', c)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
    justify-items: center;
    align-items: center;
    gap: 10px;
    height: 220px;
    @include overflow(y);
    padding: 4px;
  }

  .swatch {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }

  .swatch.selected {
    border-color: var(--text-primary);
  }

  .custom {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .custom input {
    min-width: 30px;
    width: 30px;
    max-width: 30px;
    min-height: 30px;
    height: 30px;
    max-height: 30px;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
  }
</style>
