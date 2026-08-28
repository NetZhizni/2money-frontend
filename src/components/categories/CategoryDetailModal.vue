<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import { useCategoriesStore } from '../../stores/categories'
import { useBudgetsStore } from '../../stores/budgets'
import { budgetProgress } from '../../utils/budget'
import { formatMoney } from '../../utils/format'
import type { Category } from '../../types/models'

const props = defineProps<{
  category: Category
  totals: Record<string, number> // categoryId -> amount for the active period
  currency: string
  readonly?: boolean
}>()

const emit = defineEmits<{
  close: []
  edit: [Category]
  addSubcategory: [Category]
  editSubcategory: [Category]
  viewOperations: [Category]
  addOperation: [Category]
}>()

const categories = useCategoriesStore()
const budgets = useBudgetsStore()
const children = computed(() => categories.childrenOf(props.category.id, true))
const total = computed(() => props.totals[props.category.id] ?? 0)

const existingBudget = computed(() => budgets.forCategory(props.category.id))
const budgetInput = ref(existingBudget.value?.amount?.toString() ?? '')
const editingBudget = ref(!existingBudget.value)

const progress = computed(() => budgetProgress(total.value, existingBudget.value?.amount))

async function saveBudget() {
  const amount = Number(budgetInput.value)
  if (!amount || amount <= 0) return
  if (existingBudget.value) {
    await budgets.update(existingBudget.value.id, { amount, currency: props.currency })
  } else {
    await budgets.add({ categoryId: props.category.id, amount, currency: props.currency, period: 'monthly' })
  }
  editingBudget.value = false
}

async function removeBudget() {
  if (!existingBudget.value) return
  await budgets.remove(existingBudget.value.id)
  budgetInput.value = ''
  editingBudget.value = true
}
</script>

<template>
  <Modal title="Категорія" @close="emit('close')">
    <div class="head">
      <IconCircle :icon="category.icon" :color="category.color" :size="64" />
      <div class="head-text">
        <span class="name">{{ category.name }}</span>
        <span class="amount" :style="{ color: category.color }">{{ formatMoney(total, currency) }}</span>
      </div>
    </div>

    <div class="quick-actions">
      <button v-if="!readonly" class="btn btn-primary" @click="emit('addOperation', category)">+ Додати операцію</button>
      <button class="btn btn-secondary" @click="emit('viewOperations', category)">Операції за період</button>
    </div>
    <button v-if="!readonly" class="btn btn-ghost edit-btn" @click="emit('edit', category)">Редагувати категорію</button>

    <div v-if="category.kind === 'expense' && (existingBudget || !readonly)" class="budget-section">
      <div class="sub-header">
        <span>Місячний бюджет</span>
      </div>
      <div v-if="!editingBudget && existingBudget" class="budget-view">
        <div class="budget-track">
          <div
            class="budget-fill"
            :class="{ over: progress?.over }"
            :style="{ width: `${progress?.pct ?? 0}%`, background: progress?.over ? 'var(--expense)' : category.color }"
          />
        </div>
        <div class="budget-row">
          <span :class="{ over: progress?.over }">
            {{ formatMoney(total, currency) }} з {{ formatMoney(existingBudget.amount, currency) }}
          </span>
          <div v-if="!readonly" class="budget-actions">
            <button class="link" @click="editingBudget = true">Змінити</button>
            <button class="link danger" @click="removeBudget">Прибрати</button>
          </div>
        </div>
      </div>
      <div v-else-if="!readonly" class="budget-edit">
        <input v-model="budgetInput" type="number" min="0" step="1" inputmode="numeric" :placeholder="`Сума в ${currency}`" />
        <button class="btn btn-secondary" @click="saveBudget">Зберегти</button>
      </div>
    </div>

    <div class="sub-section">
      <div class="sub-header">
        <span>Підкатегорії</span>
        <button v-if="!readonly" class="link" @click="emit('addSubcategory', category)">+ Додати</button>
      </div>
      <p v-if="!children.length" class="empty">Підкатегорій ще немає.</p>
      <ul v-else class="sub-list">
        <li
          v-for="child in children"
          :key="child.id"
          class="sub-item"
          :class="{ 'sub-item--static': readonly }"
          @click="!readonly && emit('editSubcategory', child)"
        >
          <IconCircle :icon="child.icon" :color="child.color" :size="36" />
          <span class="sub-name" :class="{ archived: child.archived }">{{ child.name }}</span>
          <span class="sub-amount" :style="{ color: child.color }">
            {{ formatMoney(totals[child.id] ?? 0, currency) }}
          </span>
        </li>
      </ul>
    </div>
  </Modal>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.head-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.name {
  font-size: 17px;
  font-weight: 700;
}
.amount {
  font-size: 15px;
  font-weight: 600;
}
.edit-btn {
  width: 100%;
  margin-top: 8px;
}
.quick-actions {
  display: flex;
  gap: 10px;
}
.quick-actions .btn {
  flex: 1;
}
.sub-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.sub-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}
.link {
  border: none;
  background: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
.empty {
  color: var(--text-muted);
  font-size: 13px;
}
.sub-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sub-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.sub-item:hover {
  background: var(--surface-2);
}

.sub-item--static {
  cursor: default;
}

.sub-item--static:hover {
  background: none;
}
.sub-name {
  flex: 1;
  font-size: 14px;
}
.sub-name.archived {
  color: var(--text-muted);
  font-style: italic;
}
.sub-amount {
  font-size: 13px;
  font-weight: 600;
}

.budget-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.budget-track {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  overflow: hidden;
  margin-bottom: 8px;
}

.budget-fill {
  height: 100%;
  border-radius: var(--radius-pill);
}

.budget-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.budget-row .over {
  color: var(--expense);
  font-weight: 600;
}

.budget-actions {
  display: flex;
  gap: 10px;
}

.link.danger {
  color: var(--expense);
}

.budget-edit {
  display: flex;
  gap: 8px;
}

.budget-edit input {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
}
</style>
