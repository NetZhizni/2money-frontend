<script setup lang="ts">
import { computed } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { formatMoney } from '../../utils/format'
import type { AccountPickerItem } from '../../types/pickerItems'

const props = defineProps<{ open: boolean; title: string; items: AccountPickerItem[]; selectedId?: string }>()
const emit = defineEmits<{ close: []; select: [string] }>()

// "Рахунки" / "Заощадження" always lead (matches the reference app's Счета /
// Сбережения order); any other group (a family member's name, for a
// transfer's foreign destinations) falls in after, alphabetically.
const GROUP_ORDER = ['Рахунки', 'Заощадження']

const groups = computed(() => {
  const byLabel = new Map<string, AccountPickerItem[]>()
  for (const item of props.items) {
    if (!byLabel.has(item.group)) byLabel.set(item.group, [])
    byLabel.get(item.group)!.push(item)
  }
  const labels = [...byLabel.keys()].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a)
    const bi = GROUP_ORDER.indexOf(b)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? GROUP_ORDER.length : ai) - (bi === -1 ? GROUP_ORDER.length : bi)
    return a.localeCompare(b)
  })
  return labels.map((label) => ({ label, items: byLabel.get(label)! }))
})

function choose(id: string) {
  emit('select', id)
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="title" top @close="emit('close')">
    <div v-if="!items.length" class="empty">Немає доступних рахунків.</div>
    <template v-for="group in groups" :key="group.label">
      <p class="group-label">{{ group.label }}</p>
      <button
        v-for="item in group.items"
        :key="item.id"
        class="row"
        :class="{ selected: item.id === selectedId }"
        @click="choose(item.id)"
      >
        <IconCircle :icon="item.icon" :color="item.color" :size="44" square />
        <span class="name">{{ item.name }}</span>
        <span
          v-if="item.balance != null"
          class="balance"
          :class="{ negative: item.balance < 0, zero: item.balance === 0 }"
        >
          {{ formatMoney(item.balance, item.currency) }}
        </span>
        <MdiIcon v-if="item.id === selectedId" name="mdiCheck" :size="18" color="var(--accent)" />
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.group-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 14px 6px 4px;
}

.group-label:first-of-type {
  margin-top: 4px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  background: none;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
}

.row:hover {
  background: var(--surface-2);
}

.row.selected {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.balance {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--income);
  flex-shrink: 0;
}

.balance.negative {
  color: var(--expense);
}

.balance.zero {
  color: var(--text-muted);
}

.empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 12px 4px;
  text-align: center;
}
</style>
