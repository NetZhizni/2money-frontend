<script setup lang="ts">
import { computed } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { formatMoney } from '../../utils/format'
import { t } from '../../i18n'
import type { AccountPickerItem } from '../../types/pickerItems'

const props = defineProps<{ open: boolean; title: string; items: AccountPickerItem[]; selectedId?: string }>()
const emit = defineEmits<{ close: []; select: [string] }>()

// The plain-accounts / savings groups always lead (matches the reference
// app's Счета / Сбережения order); any other group (a family member's name,
// for a transfer's foreign destinations) falls in after, alphabetically.
const GROUP_ORDER = computed(() => [t('transactions.picker.groupAccounts'), t('transactions.picker.groupSavings')])

const groups = computed(() => {
  const byLabel = new Map<string, AccountPickerItem[]>()
  for (const item of props.items) {
    if (!byLabel.has(item.group)) byLabel.set(item.group, [])
    byLabel.get(item.group)!.push(item)
  }
  const labels = [...byLabel.keys()].sort((a, b) => {
    const order = GROUP_ORDER.value
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi)
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
    <div v-if="!items.length" class="empty">{{ t('transactions.picker.noAccounts') }}</div>
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
          {{ formatMoney(item.balance, item.currency, { currencyDisplay: item.currencyDisplay }) }}
        </span>
        <MdiIcon v-if="item.id === selectedId" name="mdiCheck" :size="18" color="var(--accent)" />
      </button>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
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

  @include hover() {
    background: var(--surface-2);
  }
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
  @include lineClamp(1);
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
