<script setup lang="ts">
import { reactive } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useCategoriesStore } from '../../stores/categories'
import type { TransactionType } from '../../types/models'

export interface OperationsFilters {
  accountIds: string[]
  types: TransactionType[]
  categoryIds: string[] // top-level and/or subcategory ids, matched against a transaction's own categoryId/subcategoryId
  minAmount: number | null
  maxAmount: number | null
  dateFrom: string // yyyy-mm-dd, empty = unset
  dateTo: string
}

const props = defineProps<{ modelValue: OperationsFilters }>()
const emit = defineEmits<{ 'update:modelValue': [OperationsFilters]; close: [] }>()

const accounts = useAccountsStore()
const categories = useCategoriesStore()
const form = reactive<OperationsFilters>({ ...props.modelValue })

const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Витрата' },
  { value: 'income', label: 'Дохід' },
  { value: 'transfer', label: 'Переказ' },
]

// Both kinds (expense + income) — operations aren't scoped to one kind.
const topCategories = categories.topLevel()

function toggleAccount(id: string) {
  const idx = form.accountIds.indexOf(id)
  if (idx === -1) form.accountIds.push(id)
  else form.accountIds.splice(idx, 1)
}

function toggleType(t: TransactionType) {
  const idx = form.types.indexOf(t)
  if (idx === -1) form.types.push(t)
  else form.types.splice(idx, 1)
}

function toggleCategory(id: string) {
  const idx = form.categoryIds.indexOf(id)
  if (idx === -1) form.categoryIds.push(id)
  else form.categoryIds.splice(idx, 1)
}

function apply() {
  emit('update:modelValue', { ...form })
  emit('close')
}

function resetAll() {
  form.accountIds = []
  form.types = []
  form.categoryIds = []
  form.minAmount = null
  form.maxAmount = null
  form.dateFrom = ''
  form.dateTo = ''
  emit('update:modelValue', { ...form })
  emit('close')
}
</script>

<template>
  <Modal title="Фільтри операцій" @close="emit('close')">
    <div class="field">
      <label>Рахунки</label>
      <div class="chip-grid">
        <button
          v-for="a in accounts.all"
          :key="a.id"
          class="acc-chip"
          :class="{ selected: form.accountIds.includes(a.id) }"
          @click="toggleAccount(a.id)"
        >
          <IconCircle :icon="a.icon" :color="a.color" :size="28" />
          <span>{{ a.name }}</span>
        </button>
      </div>
    </div>

    <div class="field">
      <label>Категорії</label>
      <div class="cat-filter-list scrollbar-none">
        <div v-for="c in topCategories" :key="c.id" class="cat-filter-group">
          <button
            class="acc-chip"
            :class="{ selected: form.categoryIds.includes(c.id) }"
            @click="toggleCategory(c.id)"
          >
            <IconCircle :icon="c.icon" :color="c.color" :size="28" />
            <span>{{ c.name }}</span>
          </button>
          <div v-if="categories.childrenOf(c.id).length" class="subcat-chips">
            <button
              v-for="s in categories.childrenOf(c.id)"
              :key="s.id"
              class="subcat-chip-sm"
              :class="{ selected: form.categoryIds.includes(s.id) }"
              @click="toggleCategory(s.id)"
            >
              {{ s.name }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="field">
      <label>Тип операції</label>
      <div class="segmented multi">
        <button
          v-for="t in TYPE_OPTIONS"
          :key="t.value"
          :class="{ active: form.types.includes(t.value) }"
          @click="toggleType(t.value)"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <div class="row-2">
      <div class="field">
        <label>Сума від</label>
        <input v-model.number="form.minAmount" type="number" min="0" placeholder="0" />
      </div>
      <div class="field">
        <label>Сума до</label>
        <input v-model.number="form.maxAmount" type="number" min="0" placeholder="∞" />
      </div>
    </div>

    <div class="field">
      <label>Довільний період (замінює вибір місяця)</label>
      <div class="row-2">
        <input v-model="form.dateFrom" type="date" />
        <input v-model="form.dateTo" type="date" />
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" @click="resetAll">Скинути все</button>
      <button class="btn btn-primary" @click="apply">Застосувати</button>
    </div>
  </Modal>
</template>

<style scoped>
.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.acc-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-pill);
  padding: 5px 12px 5px 5px;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
}

.acc-chip.selected {
  border-color: var(--accent);
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.cat-filter-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 2px;
}

.cat-filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.subcat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 34px;
}

.subcat-chip-sm {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  padding: 4px 12px;
  font-size: 11.5px;
  cursor: pointer;
}

.subcat-chip-sm.selected {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.segmented.multi button.active {
  background: var(--accent);
  color: #fff;
}

.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.actions .btn {
  flex: 1;
}
</style>
