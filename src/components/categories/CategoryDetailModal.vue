<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import FieldRow from '../common/FieldRow.vue'
import AmountEntryModal from '../common/AmountEntryModal.vue'
import { useCategoriesStore } from '../../stores/categories'
import { useBudgetsStore } from '../../stores/budgets'
import { budgetProgress } from '../../utils/budget'
import { formatMoney } from '../../utils/format'
import { t } from '../../i18n'
import type { Category } from '../../types/models'

// `category` is nullable because this component stays permanently mounted
// (see the `open` prop / popups pattern) — it's only ever null before the
// first open, since Modal's own `v-if="open"` never renders the slot content
// (and so never reads `category`) until a caller has set it.
const props = defineProps<{
  open: boolean
  category: Category | null
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
const children = computed(() => (props.category ? categories.childrenOf(props.category.id, true) : []))
const total = computed(() => (props.category ? props.totals[props.category.id] ?? 0 : 0))

// The top-level category's own Settings → "Формат валюти" override, if any
// (see Category.currencyDisplay) — every amount below (this category's
// total, its budget, and each subcategory's own total) is in `currency`
// (the top-level category's), so they all share this same override; a
// subcategory never carries one of its own to read instead.
const currencyDisplay = computed(() => props.category?.currencyDisplay)

const existingBudget = computed(() => (props.category ? budgets.forCategory(props.category.id) : undefined))
const budgetInput = ref<number | null>(null)
const editingBudget = ref(true)
const showBudgetEntry = ref(false)

// Reused across categories — re-derive the budget draft every time it's reopened.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    budgetInput.value = existingBudget.value?.amount ?? null
    editingBudget.value = !existingBudget.value
    showBudgetEntry.value = false
  },
)

const progress = computed(() => budgetProgress(total.value, existingBudget.value?.amount))

async function saveBudget() {
  if (!props.category) return
  const amount = budgetInput.value
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
  budgetInput.value = null
  editingBudget.value = true
}
</script>

<template>
  <Modal :open="open" :title="t('categories.detail.title')" @close="emit('close')">
    <template v-if="category">
      <div class="head">
        <IconCircle :icon="category.icon" :color="category.color" :size="64" />
        <div class="head-text">
          <span class="name">{{ category.name }}</span>
          <span class="amount" :style="{ color: category.color }">{{ formatMoney(total, currency, { currencyDisplay }) }}</span>
        </div>
      </div>

      <div class="quick-actions">
        <button v-if="!readonly" class="btn btn-primary" @click="emit('addOperation', category)">{{ t('categories.detail.addOperation') }}</button>
        <button class="btn btn-secondary" @click="emit('viewOperations', category)">{{ t('categories.detail.operationsForPeriod') }}</button>
      </div>
      <button v-if="!readonly" class="btn btn-secondary edit-btn" @click="emit('edit', category)">{{ t('categories.detail.editCategory') }}</button>

      <div v-if="category.kind === 'expense' && (existingBudget || !readonly)" class="budget-section">
        <div class="sub-header">
          <span>{{ t('categories.detail.monthlyBudget') }}</span>
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
              {{ t('categories.detail.spentOf', { spent: formatMoney(total, currency, { currencyDisplay }), budget: formatMoney(existingBudget.amount, currency, { currencyDisplay }) }) }}
            </span>
            <div v-if="!readonly" class="budget-actions">
              <button class="link" @click="editingBudget = true">{{ t('categories.detail.change') }}</button>
              <button class="link danger" @click="removeBudget">{{ t('categories.detail.remove') }}</button>
            </div>
          </div>
        </div>
        <div v-else-if="!readonly" class="budget-edit">
          <FieldRow tag="button" icon="mdiCashMultiple" :label="t('categories.detail.monthlyBudget')" @click="showBudgetEntry = true">
            <span class="field-row-value">
              {{ budgetInput != null ? formatMoney(budgetInput, currency, { currencyDisplay }) : t('categories.detail.amountIn', { currency }) }}
            </span>
          </FieldRow>
          <button class="btn btn-secondary" :disabled="!budgetInput || budgetInput <= 0" @click="saveBudget">{{ t('common.save') }}</button>
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-header">
          <span>{{ t('categories.detail.subcategories') }}</span>
          <button v-if="!readonly" class="link" @click="emit('addSubcategory', category)">{{ t('categories.detail.addSubcategory') }}</button>
        </div>
        <p v-if="!children.length" class="empty">{{ t('categories.detail.noSubcategories') }}</p>
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
              {{ formatMoney(totals[child.id] ?? 0, currency, { currencyDisplay }) }}
            </span>
          </li>
        </ul>
      </div>
    </template>
  </Modal>

  <AmountEntryModal
    :open="showBudgetEntry"
    :title="t('categories.detail.monthlyBudget')"
    :initial-value="budgetInput"
    :currency="currency"
    :currency-display="currencyDisplay"
    :label="t('categories.detail.monthlyBudget')"
    @close="showBudgetEntry = false"
    @confirm="(v) => (budgetInput = v)"
  />
</template>

<style lang="scss" scoped>
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

  @include hover() {
    background: var(--surface-2);
  }
}

.sub-item--static {
  cursor: default;

  @include hover() {
    background: none;
  }
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
  align-items: center;
}

.budget-edit :deep(.field-row) {
  flex: 1;
  margin-bottom: 0;
}
</style>
