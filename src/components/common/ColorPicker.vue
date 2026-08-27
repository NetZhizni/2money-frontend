<script setup lang="ts">
  const props = defineProps<{ modelValue: string }>()
  const emit = defineEmits<{ 'update:modelValue': [string] }>()

  // The app's core accent colors first (already used across existing accounts/
  // categories), then a broader Material-ish spread per hue so the picker has
  // enough range without the user falling back to the custom input every time.
  const SWATCHES = [
    '#2a78d6',
    '#eb6834',
    '#1baf7a',
    '#eda100',
    '#e87ba4',
    '#008300',
    '#4a3aa7',
    '#e34948',
    '#8d6e63',
    '#8a8d91',
    '#00838f',
    '#5d4037',
    '#c2185b',
    '#455a64',
    '#d32f2f',
    '#ff7043',
    '#f57f17',
    '#43a047',
    '#26a69a',
    '#42a5f5',
    '#7e57c2',
    '#ab47bc',
    '#ec407a',
    '#795548',
    '#c62828',
    '#ef5350',
    '#ffca28',
    '#66bb6a',
    '#4db6ac',
    '#1976d2',
    '#5e35b1',
    '#9c27b0',
    '#f06292',
    '#6d4c41',
    '#37474f',
    '#78909c',
    '#9a9a9e',
    '#616161',
    '#bdbdbd',
    '#212121',
  ]
</script>

<template>
  <div class="picker">
    <label class="custom">
      <span>Інший колір</span>
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

<style scoped>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, 30px);
    justify-items: center;
    gap: 10px;
    height: 220px;
    overflow-y: auto;
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
    width: 30px;
    height: 38px;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
  }
</style>
