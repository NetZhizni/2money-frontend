<script setup lang="ts">
import { reactive, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import AmountFieldButton from '../common/AmountFieldButton.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useCategoriesStore } from '../../stores/categories'
import { useSettingsStore } from '../../stores/settings'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n'
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

const props = defineProps<{ open: boolean; modelValue: OperationsFilters }>()
const emit = defineEmits<{ 'update:modelValue': [OperationsFilters]; close: [] }>()

const accounts = useAccountsStore()
const categories = useCategoriesStore()
const settings = useSettingsStore()
const form = reactive<OperationsFilters>({ ...props.modelValue })

// Stays permanently mounted — re-stage the draft from the committed filters
// every time it's reopened, so a dismissed-without-applying edit never lingers.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) Object.assign(form, props.modelValue)
  },
)

const TYPE_OPTIONS: Array<{ value: TransactionType; labelKey: MessageKey }> = [
  { value: 'expense', labelKey: 'categories.form.expenseType' },
  { value: 'income', labelKey: 'categories.form.incomeType' },
  { value: 'transfer', labelKey: 'transactions.form.typeTransfer' },
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
  <Modal :open="open" :title="t('transactions.filter.title')" @close="emit('close')">
    <div class="field">
      <label>{{ t('transactions.filter.accounts') }}</label>
      <div class="chip-grid">
        <button
          v-for="a in accounts.all"
          :key="a.id"
          class="acc-chip"
          :class="{ selected: form.accountIds.includes(a.id) }"
          @click="toggleAccount(a.id)"
        >
          <IconCircle :icon="a.icon" :color="a.color" :size="28" square />
          <span>{{ a.name }}</span>
        </button>
      </div>
    </div>

    <div class="field">
      <label>{{ t('transactions.filter.categories') }}</label>
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
      <label>{{ t('transactions.filter.type') }}</label>
      <div class="segmented multi">
        <button
          v-for="opt in TYPE_OPTIONS"
          :key="opt.value"
          :class="{ active: form.types.includes(opt.value) }"
          @click="toggleType(opt.value)"
        >
          {{ t(opt.labelKey) }}
        </button>
      </div>
    </div>

    <div class="row-2">
      <div class="field">
        <label>{{ t('transactions.filter.amountFrom') }}</label>
        <AmountFieldButton
          v-model="form.minAmount"
          :currency="settings.baseCurrency"
          :label="t('transactions.filter.amountFrom')"
          placeholder="0"
          clearable
        />
      </div>
      <div class="field">
        <label>{{ t('transactions.filter.amountTo') }}</label>
        <AmountFieldButton
          v-model="form.maxAmount"
          :currency="settings.baseCurrency"
          :label="t('transactions.filter.amountTo')"
          placeholder="∞"
          clearable
        />
      </div>
    </div>

    <div class="field">
      <label>{{ t('transactions.filter.customPeriod') }}</label>
      <div class="row-2">
        <input v-model="form.dateFrom" type="date" />
        <input v-model="form.dateTo" type="date" />
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" @click="resetAll">{{ t('transactions.filter.resetAll') }}</button>
      <button class="btn btn-primary" @click="apply">{{ t('transactions.filter.apply') }}</button>
    </div>
  </Modal>
</template>

<style lang="scss" scoped>
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
  @include overflow(y);
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
