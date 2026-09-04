<script setup lang="ts">
import { computed, ref } from 'vue'
import MdiIcon from './MdiIcon.vue'
import { ICON_NAMES, POPULAR_ICONS, iconLabel } from '../../utils/icons'
import { t } from '../../i18n'

const props = defineProps<{ modelValue: string; color: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const query = ref('')

const results = computed(() => {
  if (!query.value.trim()) return POPULAR_ICONS
  const q = query.value.trim().toLowerCase()
  return ICON_NAMES.filter((n) => iconLabel(n).toLowerCase().includes(q)).slice(0, 150)
})

function pick(name: string) {
  emit('update:modelValue', name)
}
</script>

<template>
  <div class="picker">
    <input v-model="query" type="text" :placeholder="t('common.searchIcon')" class="search" />
    <div class="grid scrollbar-none">
      <button
        v-for="name in results"
        :key="name"
        class="cell"
        :class="{ selected: name === props.modelValue }"
        :title="iconLabel(name)"
        @click="pick(name)"
      >
        <MdiIcon :name="name" :size="22" :color="name === props.modelValue ? props.color : 'var(--text-secondary)'" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 6px;
  max-height: 220px;
  @include overflow(y);
  padding: 4px;
}

.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  cursor: pointer;
}

.cell.selected {
  border-color: currentColor;
  background: var(--surface);
}
</style>
