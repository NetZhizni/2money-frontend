<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import FieldRow from '../common/FieldRow.vue'
import Segmented from '../common/Segmented.vue'
import AmountEntryModal from '../common/AmountEntryModal.vue'
import AccountPickerModal from '../transactions/AccountPickerModal.vue'
import CategoryPickerModal from '../transactions/CategoryPickerModal.vue'
import TagPickerModal from '../transactions/TagPickerModal.vue'
import OperationDateModal from '../transactions/OperationDateModal.vue'
import RecurrencePicker from './RecurrencePicker.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useAllAccountsStore } from '../../stores/allAccounts'
import { useCategoriesStore } from '../../stores/categories'
import { useTagsStore } from '../../stores/tags'
import { useTransactionsStore } from '../../stores/transactions'
import { useTemplatesStore } from '../../stores/templates'
import { useSettingsStore } from '../../stores/settings'
import { useProfilesStore } from '../../stores/profiles'
import { useAuthStore } from '../../stores/auth'
import { isFinished, scheduledNext } from '../../db/recurring'
import { accountGroupLabel } from '../../utils/accountLabel'
import { resolveCategoryCurrency } from '../../utils/currencies'
import { dateFromKey, dateKey, endOfDay, formatMoney, fullDateLabel } from '../../utils/format'
import { t } from '../../i18n'
import type { RecurringFrequency, RecurringTemplate, TransactionType } from '../../types/models'
import type { AccountPickerItem } from '../../types/pickerItems'

// Create or edit one recurring template (see views/RecurringView.vue) — the
// same "what" as TransactionFormModal.vue (type, accounts, category, amount,
// tags), plus the schedule. Deleting is the caller's (it needs its own
// confirm dialog, which shouldn't stack on top of this one); pausing and
// resuming happen right here.
const props = defineProps<{ open: boolean; template?: RecurringTemplate | null }>()
const emit = defineEmits<{ close: []; saved: []; deleted: [] }>()

const accounts = useAccountsStore()
const allAccounts = useAllAccountsStore()
const categories = useCategoriesStore()
const tagsStore = useTagsStore()
const transactions = useTransactionsStore()
const templates = useTemplatesStore()
const settings = useSettingsStore()
const profiles = useProfilesStore()
const authStore = useAuthStore()

const isEdit = computed(() => !!props.template)

function buildForm() {
  const tpl = props.template
  return {
    type: (tpl?.type ?? 'expense') as TransactionType,
    accountId: tpl?.accountId ?? accounts.active[0]?.id ?? '',
    toAccountId: tpl?.toAccountId ?? '',
    categoryId: tpl?.categoryId ?? '',
    subcategoryId: tpl?.subcategoryId ?? '',
    amount: tpl?.amount ?? null as number | null,
    toAmount: tpl?.toAmount ?? null as number | null,
    note: tpl?.note ?? '',
    tagIds: tpl?.tagIds ? [...tpl.tagIds] : ([] as string[]),
    frequency: (tpl?.frequency ?? 'monthly') as RecurringFrequency,
    interval: tpl?.interval ?? 1,
    nextDate: dateKey(tpl ? scheduledNext(tpl) : Date.now()),
    endDate: tpl?.endDate ? dateKey(tpl.endDate) : '',
    requireConfirm: tpl?.requireConfirm ?? false,
  }
}

const form = reactive(buildForm())
const showAccountPicker = ref<'from' | 'to' | null>(null)
const showCategoryPicker = ref(false)
const showTagPicker = ref(false)
const showAmountEntry = ref<'amount' | 'toAmount' | null>(null)
const showDatePicker = ref<'next' | 'end' | null>(null)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(form, buildForm())
    showAccountPicker.value = null
    showCategoryPicker.value = false
    showTagPicker.value = false
    showAmountEntry.value = null
    showDatePicker.value = null
  },
)

// accounts.all rather than .active: a template can outlive its account's
// archiving, and should still show (and keep) what it points at.
const sourceAccount = computed(() => accounts.all.find((a) => a.id === form.accountId))
const destAccount = computed(() => allAccounts.byId(form.toAccountId))
const currency = computed(() => sourceAccount.value?.currency ?? props.template?.currency ?? settings.baseCurrency)
const selectedCategory = computed(() => categories.byId(form.categoryId))
const subcategories = computed(() => (selectedCategory.value ? categories.childrenOf(selectedCategory.value.id) : []))
const kindForCategories = computed(() => (form.type === 'income' ? 'income' : 'expense'))

// Same rule as TransactionFormModal.vue's isDualCurrency: a second amount in
// the other side's currency, for a cross-currency transfer or a category
// with a currency of its own.
const otherCurrency = computed(() => {
  if (form.type === 'transfer') return destAccount.value && destAccount.value.currency !== currency.value ? destAccount.value.currency : null
  if (!selectedCategory.value) return null
  const categoryCurrency = resolveCategoryCurrency(selectedCategory.value, settings.baseCurrency, transactions.all)
  return categoryCurrency !== currency.value ? categoryCurrency : null
})

const fromItems = computed<AccountPickerItem[]>(() =>
  accounts.active.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    color: a.color,
    currency: a.currency,
    currencyDisplay: a.currencyDisplay,
    balance: accounts.balanceOf(a),
    group: accountGroupLabel(a),
  })),
)

const toItems = computed<AccountPickerItem[]>(() => [
  ...accounts.active
    .filter((a) => a.id !== form.accountId)
    .map((a) => ({
      id: a.id,
      name: `${a.name} (${a.currency})`,
      icon: a.icon,
      color: a.color,
      currency: a.currency,
      currencyDisplay: a.currencyDisplay,
      balance: accounts.balanceOf(a),
      group: accountGroupLabel(a),
    })),
  ...allAccounts.all
    .filter((a) => a.ownerId !== authStore.uid && !a.archived)
    .map((a) => ({
      id: a.id,
      name: `${a.name} (${a.currency})`,
      icon: a.icon,
      color: a.color,
      currency: a.currency,
      currencyDisplay: a.currencyDisplay,
      group: profiles.byId(a.ownerId)?.displayName ?? t('transactions.picker.otherProfile'),
    })),
])

const typeOptions = computed(() => [
  { value: 'expense', label: t('categories.form.expenseType') },
  { value: 'income', label: t('categories.form.incomeType') },
  { value: 'transfer', label: t('transactions.form.typeTransfer') },
])

function setType(type: TransactionType) {
  if (form.type === type) return
  form.type = type
  form.categoryId = ''
  form.subcategoryId = ''
  form.toAmount = null
}

function selectAccount(id: string) {
  if (showAccountPicker.value === 'to') form.toAccountId = id
  else form.accountId = id
  form.toAmount = null
  showAccountPicker.value = null
}

function selectCategory(id: string) {
  form.categoryId = id
  form.subcategoryId = ''
  form.toAmount = null
}

function pickSubcategory(id: string) {
  form.subcategoryId = form.subcategoryId === id ? '' : id
}

const fromName = computed(() => sourceAccount.value?.name ?? t('transactions.form.chooseAccount'))
const toName = computed(() =>
  form.type === 'transfer'
    ? (destAccount.value?.name ?? t('transactions.form.chooseAccount'))
    : (selectedCategory.value?.name ?? t('transactions.form.chooseCategory')),
)
const toIcon = computed(() =>
  form.type === 'transfer' ? (destAccount.value?.icon ?? 'mdiWalletOutline') : (selectedCategory.value?.icon ?? 'mdiShapeOutline'),
)
const toColor = computed(() => (form.type === 'transfer' ? destAccount.value?.color : selectedCategory.value?.color))

const tagsSummary = computed(() => {
  const names = form.tagIds.map((id) => tagsStore.byId(id)?.name).filter((name): name is string => !!name)
  return names.length ? names.join(', ') : t('transactions.form.noTags')
})

const interval = computed(() => Number(form.interval))

// The saved schedule's own anchor (see RecurringTemplate.startDate) while
// the form still describes exactly that schedule — the moment its date,
// frequency or interval changes, saving re-anchors it on the new next date
// (see submit), so the previews must count from there too.
const scheduleAnchor = computed(() => {
  const tpl = props.template
  if (!tpl || form.nextDate !== dateKey(scheduledNext(tpl)) || form.frequency !== tpl.frequency || interval.value !== tpl.interval) return undefined
  return tpl.startDate
})

const error = computed(() => {
  if (!form.accountId) return t('transactions.form.errorChooseAccount')
  if (form.type === 'transfer' && !form.toAccountId) return t('transactions.form.errorChooseDestAccount')
  if (form.type === 'transfer' && form.toAccountId === form.accountId) return t('transactions.form.errorAccountsMustDiffer')
  if (form.type !== 'transfer' && !form.categoryId) return t('transactions.form.errorChooseCategory')
  if (!form.amount || form.amount <= 0) return t('transactions.form.errorAmountPositive')
  if (!Number.isInteger(interval.value) || interval.value < 1) return t('recurring.form.errorInterval')
  if (!form.nextDate) return t('transactions.form.errorChooseDate')
  if (form.endDate && form.endDate < form.nextDate) return t('recurring.form.errorEndBeforeNext')
  return ''
})

async function submit() {
  if (error.value || !form.amount) return
  const tpl = props.template
  const originalNext = tpl ? scheduledNext(tpl) : null
  // An untouched date keeps its exact timestamp (time of day included); a
  // changed one starts at that local day's midnight. The end date covers its
  // whole day, whatever time of day the occurrences carry.
  const nextDate = originalNext != null && form.nextDate === dateKey(originalNext) ? originalNext : dateFromKey(form.nextDate).getTime()
  const endDate = form.endDate ? endOfDay(dateFromKey(form.endDate).getTime()) : null
  // A changed schedule re-anchors on its new next date (see
  // RecurringTemplate.startDate) — otherwise a monthly payment moved from
  // the 31st to the 15th would snap back to the 31st a month later.
  const scheduleChanged = !tpl || nextDate !== originalNext || tpl.frequency !== form.frequency || tpl.interval !== interval.value
  // A paused template stays paused (resuming is its own button); anything
  // else is active for as long as its schedule hasn't run out.
  const paused = !!tpl && !tpl.active && !isFinished(tpl)
  const record = {
    type: form.type,
    accountId: form.accountId,
    toAccountId: form.type === 'transfer' ? form.toAccountId : undefined,
    categoryId: form.type !== 'transfer' ? form.categoryId : undefined,
    subcategoryId: form.type !== 'transfer' ? form.subcategoryId || null : null,
    amount: form.amount,
    toAmount: otherCurrency.value && form.toAmount ? form.toAmount : null,
    currency: currency.value,
    note: form.note.trim() || undefined,
    tagIds: [...form.tagIds],
    frequency: form.frequency,
    interval: interval.value,
    startDate: scheduleChanged ? nextDate : tpl!.startDate,
    endDate,
    nextDate,
    requireConfirm: form.requireConfirm,
    active: !paused && (endDate == null || nextDate <= endDate),
  }
  if (tpl) await templates.update(tpl.id, record)
  else await templates.add(record)
  emit('saved')
}

const paused = computed(() => !!props.template && !props.template.active && !isFinished(props.template))

async function togglePause() {
  if (!props.template) return
  await templates.setPaused(props.template.id, !paused.value)
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="isEdit ? t('recurring.form.editTitle') : t('recurring.form.newTitle')" wide @close="emit('close')">
    <Segmented class="type-toggle" :model-value="form.type" :options="typeOptions" @update:model-value="(v) => setType(v as TransactionType)" />

    <div class="op-header">
      <button
        type="button"
        class="op-half"
        :class="{ placeholder: !sourceAccount }"
        :style="sourceAccount ? { background: sourceAccount.color } : undefined"
        @click="showAccountPicker = 'from'"
      >
        <span class="op-icon-bubble">
          <MdiIcon :name="sourceAccount?.icon ?? 'mdiWalletOutline'" :size="19" :color="sourceAccount?.color" />
        </span>
        <span class="op-text">
          <span class="op-label">{{ form.type === 'transfer' ? t('transactions.form.fromAccount') : t('transactions.form.account') }}</span>
          <span class="op-value">{{ fromName }}</span>
        </span>
      </button>
      <button
        type="button"
        class="op-half"
        :class="{ placeholder: !toColor }"
        :style="toColor ? { background: toColor } : undefined"
        @click="form.type === 'transfer' ? (showAccountPicker = 'to') : (showCategoryPicker = true)"
      >
        <span class="op-icon-bubble">
          <MdiIcon :name="toIcon" :size="19" :color="toColor" />
        </span>
        <span class="op-text">
          <span class="op-label">{{ form.type === 'transfer' ? t('transactions.form.toAccount') : t('transactions.form.category') }}</span>
          <span class="op-value">{{ toName }}</span>
        </span>
      </button>
    </div>

    <div v-if="form.type !== 'transfer' && subcategories.length" class="subcat-row scrollbar-none">
      <button
        v-for="s in subcategories"
        :key="s.id"
        type="button"
        class="subcat-chip"
        :class="{ selected: s.id === form.subcategoryId }"
        :style="s.id === form.subcategoryId ? { background: s.color, borderColor: s.color } : undefined"
        @click="pickSubcategory(s.id)"
      >
        <MdiIcon :name="s.icon" :size="15" :color="s.id === form.subcategoryId ? '#fff' : s.color" />
        <span>{{ s.name }}</span>
      </button>
    </div>

    <FieldRow tag="button" icon="mdiCash" :label="t('recurring.form.amount')" @click="showAmountEntry = 'amount'">
      <span class="field-row-value" :class="{ muted: form.amount == null }">
        {{ form.amount != null ? formatMoney(form.amount, currency, { currencyDisplay: sourceAccount?.currencyDisplay }) : '—' }}
      </span>
    </FieldRow>
    <template v-if="otherCurrency">
      <FieldRow tag="button" icon="mdiSwapHorizontal" :label="t('transactions.form.credited')" @click="showAmountEntry = 'toAmount'">
        <span class="field-row-value" :class="{ muted: form.toAmount == null }">
          {{ form.toAmount != null ? formatMoney(form.toAmount, otherCurrency) : '—' }}
        </span>
      </FieldRow>
      <span class="hint below">{{ t('recurring.form.creditedHint') }}</span>
    </template>

    <FieldRow icon="mdiNoteTextOutline" :label="t('transactions.form.noteLabel')">
      <input v-model="form.note" type="text" class="field-row-value" :placeholder="t('transactions.form.notePlaceholder')" />
    </FieldRow>

    <FieldRow tag="button" icon="mdiTagOutline" :label="t('transactions.form.tagsLabel')" @click="showTagPicker = true">
      <span class="field-row-value">{{ tagsSummary }}</span>
      <template #trailing>
        <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
      </template>
    </FieldRow>

    <div class="schedule">
      <FieldRow tag="button" icon="mdiCalendarArrowRight" :label="t('recurring.form.nextDate')" @click="showDatePicker = 'next'">
        <span class="field-row-value">{{ fullDateLabel(dateFromKey(form.nextDate)) }}</span>
        <template #trailing>
          <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
        </template>
      </FieldRow>
      <RecurrencePicker
        v-model:frequency="form.frequency"
        v-model:interval="form.interval"
        :start="dateFromKey(form.nextDate).getTime()"
        :anchor="scheduleAnchor"
      />
      <FieldRow tag="button" icon="mdiCalendarEnd" :label="t('transactions.form.endDateLabel')" @click="showDatePicker = 'end'">
        <span class="field-row-value" :class="{ muted: !form.endDate }">
          {{ form.endDate ? fullDateLabel(dateFromKey(form.endDate)) : t('recurring.form.noEndDate') }}
        </span>
        <template #trailing>
          <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
        </template>
      </FieldRow>
      <FieldRow tag="label" icon="mdiCheckDecagramOutline" class="toggle-row">
        <span class="field-row-value">{{ t('recurring.form.requireConfirm') }}</span>
        <template #trailing>
          <input v-model="form.requireConfirm" type="checkbox" class="field-row-toggle" />
        </template>
      </FieldRow>
      <span class="hint">{{ t('recurring.form.requireConfirmHint') }}</span>
    </div>

    <span v-if="error" class="field-error submit-error">{{ error }}</span>
    <button class="btn btn-primary submit" :disabled="!!error" @click="submit">
      {{ isEdit ? t('common.save') : t('common.add') }}
    </button>

    <div v-if="isEdit" class="danger-zone">
      <button v-if="template && !isFinished(template)" class="btn btn-secondary" @click="togglePause">
        {{ paused ? t('recurring.form.resume') : t('recurring.form.pause') }}
      </button>
      <button class="btn btn-danger" @click="emit('deleted')">{{ t('common.delete') }}</button>
    </div>
  </Modal>

  <AccountPickerModal
    :open="showAccountPicker !== null"
    :title="showAccountPicker === 'to' ? t('transactions.form.toAccount') : t('transactions.form.account')"
    :items="showAccountPicker === 'to' ? toItems : fromItems"
    :selected-id="showAccountPicker === 'to' ? form.toAccountId : form.accountId"
    @close="showAccountPicker = null"
    @select="selectAccount"
  />

  <CategoryPickerModal
    :open="showCategoryPicker"
    :kind="kindForCategories"
    :categories="categories.topLevel(kindForCategories)"
    :selected-id="form.categoryId"
    @close="showCategoryPicker = false"
    @select="selectCategory"
  />

  <OperationDateModal
    :open="showDatePicker !== null"
    :date="showDatePicker === 'end' ? form.endDate : form.nextDate"
    :title="showDatePicker === 'end' ? t('transactions.form.endDateLabel') : t('recurring.form.nextDate')"
    :clear-label="showDatePicker === 'end' ? t('recurring.form.noEndDate') : undefined"
    @close="showDatePicker = null"
    @update:date="(v) => (showDatePicker === 'end' ? (form.endDate = v) : (form.nextDate = v))"
  />

  <TagPickerModal :open="showTagPicker" :selected-ids="form.tagIds" @close="showTagPicker = false" @update:selected-ids="(ids) => (form.tagIds = ids)" />

  <AmountEntryModal
    :open="showAmountEntry !== null"
    :title="showAmountEntry === 'toAmount' ? t('transactions.form.credited') : t('recurring.form.amount')"
    :initial-value="showAmountEntry === 'toAmount' ? form.toAmount : form.amount"
    :currency="showAmountEntry === 'toAmount' ? (otherCurrency ?? currency) : currency"
    :currency-display="showAmountEntry === 'toAmount' ? undefined : sourceAccount?.currencyDisplay"
    :label="showAmountEntry === 'toAmount' ? t('transactions.form.credited') : t('recurring.form.amount')"
    @close="showAmountEntry = null"
    @confirm="(v) => (showAmountEntry === 'toAmount' ? (form.toAmount = v || null) : (form.amount = v))"
  />
</template>

<style lang="scss" scoped>
.type-toggle {
  margin-bottom: 14px;
}

.op-header {
  display: flex;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 10px;
}

.op-half {
  flex: 1 1 50%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  color: #fff;
  padding: 14px;
  cursor: pointer;
  text-align: left;
}

.op-half + .op-half {
  border-left: 1px solid rgba(255, 255, 255, 0.25);
}

.op-half.placeholder {
  background: var(--surface-2);
  color: var(--text-secondary);
}

.op-half.placeholder + .op-half.placeholder {
  border-left-color: var(--border);
}

.op-icon-bubble {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.op-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.op-label {
  font-size: 11.5px;
  opacity: 0.85;
}

.op-value {
  font-size: 14.5px;
  font-weight: 700;
  max-width: 100%;
  @include lineClamp(1);
}

.op-half.placeholder .op-value {
  color: var(--text-muted);
  font-weight: 600;
}

.subcat-row {
  display: flex;
  gap: 8px;
  @include overflow(x);
  padding: 2px 2px 10px;
}

.subcat-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  padding: 7px 13px;
  font-size: 12.5px;
  cursor: pointer;
  flex-shrink: 0;
}

.subcat-chip.selected {
  color: #fff;
  border-color: transparent;
}

.muted {
  color: var(--text-muted);
}

.schedule {
  margin: 6px 0 14px;
  padding: 12px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.toggle-row {
  margin-bottom: 4px;
}

.hint {
  display: block;
  font-size: 11.5px;
  color: var(--text-muted);
}

.hint.below {
  margin: -2px 2px 10px;
}

.submit-error {
  display: block;
  text-align: center;
  margin-bottom: 8px;
}

.submit {
  width: 100%;
}

.danger-zone {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.danger-zone .btn {
  flex: 1;
}
</style>
