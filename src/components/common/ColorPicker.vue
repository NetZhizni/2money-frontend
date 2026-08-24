<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const SWATCHES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948',
  '#8d6e63', '#8a8d91', '#00838f', '#5d4037', '#c2185b', '#455a64',
]
</script>

<template>
  <div class="picker">
    <div class="swatches">
      <button
        v-for="c in SWATCHES"
        :key="c"
        class="swatch"
        :style="{ background: c }"
        :class="{ selected: c.toLowerCase() === props.modelValue?.toLowerCase() }"
        @click="emit('update:modelValue', c)"
      />
    </div>
    <label class="custom">
      <span>Інший колір</span>
      <input
        type="color"
        :value="modelValue"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  height: 30px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}
</style>
