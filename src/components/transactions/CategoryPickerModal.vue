<script setup lang="ts">
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import type { Category, CategoryKind } from '../../types/models'

const props = defineProps<{ open: boolean; kind: CategoryKind; categories: Category[]; selectedId?: string }>()
const emit = defineEmits<{ close: []; select: [string] }>()

function choose(id: string) {
  emit('select', id)
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="props.kind === 'expense' ? 'Категорія витрат' : 'Категорія доходів'" top @close="emit('close')">
    <div v-if="!categories.length" class="empty">Категорій ще немає.</div>
    <div class="grid">
      <button
        v-for="c in categories"
        :key="c.id"
        class="cell"
        :class="{ selected: c.id === selectedId }"
        @click="choose(c.id)"
      >
        <IconCircle :icon="c.icon" :color="c.color" :size="52" />
        <span class="name">{{ c.name }}</span>
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 85px);
  justify-content: space-around;
  justify-items: center;
  align-items: center;
  align-content: center;
  gap: 14px 3px;
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 4px 0;
  cursor: pointer;
}

.cell.selected :deep(.icon-circle) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.name {
  font-size: 11.5px;
  color: var(--text-secondary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.cell.selected .name {
  color: var(--text-primary);
  font-weight: 600;
}

.empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 12px 4px;
  text-align: center;
}
</style>
