<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useAllAccountsStore } from '../../stores/allAccounts'
import { useCategoriesStore } from '../../stores/categories'
import { useTransactionsStore } from '../../stores/transactions'
import { useSettingsStore } from '../../stores/settings'
import { useTemplatesStore } from '../../stores/templates'
import { useAuthStore } from '../../stores/auth'
import { useProfilesStore } from '../../stores/profiles'
import { getRateForDate, convertAmount } from '../../db/exchangeRates'
import { advance } from '../../db/recurring'
import { dateKey, formatMoney, fullDateLabel } from '../../utils/format'
import { resolveAccountLabel } from '../../utils/accountLabel'
import { TRANSFER_CATEGORY_COLOR } from '../../utils/transferAnalytics'
import type { Transaction, TransactionType, RecurringFrequency } from '../../types/models'

const props = defineProps<{
  transaction?: Transaction | null
  presetAccountId?: string
  presetCategoryId?: string
}>()
const emit = defineEmits<{ close: []; saved: []; deleted: []; duplicated: [] }>()

const router = useRouter()
const accounts = useAccountsStore()
const allAccountsStore = useAllAccountsStore()
const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const settings = useSettingsStore()
const templates = useTemplatesStore()
const authStore = useAuthStore()
const profilesStore = useProfilesStore()

// A transfer initiated by another profile (we're only the counterparty) is
// read-only here: the backend only lets the owning profile PATCH/DELETE it
// (see patchTransaction.js/removeTransaction.js), and re-purposing the full
// editable form for someone else's transaction
// looked confusing (source/destination account pickers can't resolve a
// foreign account the same way). Show a simple summary instead.
const isForeign = computed(() => !!props.transaction && props.transaction.ownerId !== authStore.uid)

const initiatorName = computed(() =>
  props.transaction ? profilesStore.byId(props.transaction.ownerId)?.displayName ?? '?' : '?',
)

interface TransferDestination {
  id: string
  label: string
  ownerId: string
  currency: string
}

const transferDestinations = computed<TransferDestination[]>(() => {
  const own = accounts.active
    .filter((a) => a.id !== form.accountId)
    .map((a) => ({ id: a.id, label: `${a.name} (${a.currency})`, ownerId: a.ownerId, currency: a.currency }))
  const foreign = allAccountsStore.all
    .filter((a) => a.ownerId !== authStore.uid && !a.archived)
    .map((a) => ({
      id: a.id,
      label: `${profilesStore.byId(a.ownerId)?.displayName ?? '?'} — ${a.name} (${a.currency})`,
      ownerId: a.ownerId,
      currency: a.currency,
    }))
  return [...own, ...foreign]
})

const isEdit = computed(() => !!props.transaction)

// Without at least one account there is nowhere to record money moving from/to,
// so the form itself would be permanently invalid — guide the user to create
// one first instead of showing an empty, always-erroring select.
const noAccounts = computed(() => accounts.active.length === 0)

function goCreateAccount() {
  emit('close')
  router.push('/accounts')
}

function todayDateInputValue(ts?: number): string {
  return dateKey(ts ?? Date.now())
}

// A category preset (from "Додати операцію" in the category detail sheet) may
// itself be a subcategory — resolve it to its top-level parent + sub id.
const presetCategory = props.presetCategoryId ? categories.byId(props.presetCategoryId) : undefined
const presetTopCategoryId = presetCategory
  ? presetCategory.parentId ?? presetCategory.id
  : undefined
const presetSubcategoryId = presetCategory?.parentId ? presetCategory.id : undefined

const form = reactive({
  type: (props.transaction?.type ?? (presetCategory?.kind === 'income' ? 'income' : 'expense')) as TransactionType,
  accountId: props.transaction?.accountId ?? props.presetAccountId ?? accounts.active[0]?.id ?? '',
  toAccountId: props.transaction?.toAccountId ?? '',
  categoryId: props.transaction?.categoryId ?? presetTopCategoryId ?? '',
  subcategoryId: props.transaction?.subcategoryId ?? presetSubcategoryId ?? '',
  amount: props.transaction?.amount ?? undefined as number | undefined,
  toAmount: props.transaction?.toAmount ?? undefined as number | undefined,
  exchangeRate: props.transaction?.exchangeRate ?? 1,
  toExchangeRate: 1,
  date: todayDateInputValue(props.transaction?.date),
  note: props.transaction?.note ?? '',
  makeRecurring: false,
  frequency: 'monthly' as RecurringFrequency,
  interval: 1,
  endDate: '',
})

const creditTouched = ref(false)
const toAmountTouched = ref(false)

const sourceAccount = computed(() => accounts.all.find((a) => a.id === form.accountId))
const destAccount = computed(
  () => accounts.all.find((a) => a.id === form.toAccountId) ?? allAccountsStore.byId(form.toAccountId),
)
const currency = computed(() => sourceAccount.value?.currency ?? settings.baseCurrency)
const isCrossCurrencyTransfer = computed(
  () => form.type === 'transfer' && !!destAccount.value && destAccount.value.currency !== currency.value,
)
const needsRate = computed(() => currency.value !== settings.baseCurrency)
// A cross-profile transfer is real money leaving/entering a person's own
// total, so (per the user's decision) it should count as an expense for the
// sender / income for the receiver in Overview & category analytics — unlike
// a same-profile transfer, which stays excluded (see utils/transferAnalytics.ts).
const isCrossProfileTransfer = computed(
  () => form.type === 'transfer' && !!destAccount.value && destAccount.value.ownerId !== authStore.uid,
)

watch(
  [() => form.type, () => form.date, currency, isCrossProfileTransfer],
  async () => {
    const shouldCompute = form.type === 'transfer' ? isCrossProfileTransfer.value : needsRate.value
    if (!shouldCompute || creditTouched.value) return
    // Rate FROM the transaction's currency TO the app's base currency — pivoted
    // through UAH rates, so this stays correct even when the base currency
    // itself isn't UAH (a raw exchange rate is always "UAH per unit").
    form.exchangeRate = await convertAmount(1, currency.value, settings.baseCurrency, new Date(form.date).getTime())
  },
  { immediate: true },
)

// "Сума зарахування" — the amount in the base currency, shown/edited directly
// instead of an abstract rate. Editing it only ever derives the internal rate;
// it must never write back to "Сума (валюта)" (form.amount).
const creditAmount = computed<number | undefined>({
  get() {
    if (form.amount == null) return undefined
    return Math.round(form.amount * form.exchangeRate * 100) / 100
  },
  set(val) {
    creditTouched.value = true
    if (val != null && form.amount) {
      form.exchangeRate = val / form.amount
    }
  },
})

watch(
  [() => form.date, destAccount, sourceAccount, () => form.amount],
  async () => {
    if (!isCrossCurrencyTransfer.value || toAmountTouched.value || !destAccount.value) return
    const when = new Date(form.date).getTime()
    const [fromRate, toRate] = await Promise.all([
      getRateForDate(currency.value, when),
      getRateForDate(destAccount.value.currency, when),
    ])
    if (form.amount != null && toRate > 0) {
      form.toAmount = Math.round(((form.amount * fromRate) / toRate) * 100) / 100
    }
  },
  { immediate: true },
)

const kindForCategories = computed(() => (form.type === 'income' ? 'income' : 'expense'))
const topCategories = computed(() => categories.topLevel(kindForCategories.value))
const selectedCategory = computed(() => categories.byId(form.categoryId))
const subcategories = computed(() => (selectedCategory.value ? categories.childrenOf(selectedCategory.value.id) : []))

function pickCategory(id: string) {
  form.categoryId = id
  form.subcategoryId = ''
}
function pickSubcategory(id: string) {
  form.subcategoryId = form.subcategoryId === id ? '' : id
}

watch(
  () => form.type,
  () => {
    form.categoryId = ''
    form.subcategoryId = ''
  },
)

const error = computed(() => {
  if (!form.accountId) return 'Оберіть рахунок'
  if (form.type === 'transfer' && !form.toAccountId) return 'Оберіть рахунок призначення'
  if (form.type === 'transfer' && form.toAccountId === form.accountId) return 'Рахунки мають відрізнятись'
  if (form.type !== 'transfer' && !form.categoryId) return 'Оберіть категорію'
  if (!form.amount || form.amount <= 0) return 'Вкажіть суму більше нуля'
  // An emptied native date input becomes '', and `new Date('')` is an
  // Invalid Date — without this guard the operation would still save with a
  // NaN timestamp and then vanish from every date-grouped list (it sorts
  // unpredictably since NaN comparisons are never true/false consistently).
  if (!form.date) return "Вкажіть дату"
  return ''
})

async function submit() {
  if (error.value || !form.amount) return
  const when = new Date(form.date).getTime()
  const rate =
    form.type === 'transfer'
      ? isCrossProfileTransfer.value
        ? form.exchangeRate
        : 1
      : needsRate.value
        ? form.exchangeRate
        : 1
  // A same-profile transfer nets to 0 (it's not real income/expense). A
  // cross-profile one is stored as a negative (expense-shaped) baseAmount
  // from the SENDER's perspective — the receiving profile's Overview/
  // Categories re-reads this same value as their income magnitude (see
  // utils/transferAnalytics.ts). NOTE: this is computed in the SENDER's own
  // base currency; GET /api/settings only ever returns the caller's own row
  // (see getSettings.js), so there's no way for the sender's client to know
  // the receiver's base currency to
  // convert precisely — this is exact when both profiles share one base
  // currency, approximate otherwise.
  const baseAmount =
    form.type === 'expense'
      ? -form.amount * rate
      : form.type === 'income'
        ? form.amount * rate
        : form.type === 'transfer' && isCrossProfileTransfer.value
          ? -form.amount * rate
          : 0

  const payload = {
    type: form.type,
    date: when,
    accountId: form.accountId,
    toAccountId: form.type === 'transfer' ? form.toAccountId : undefined,
    toOwnerId: form.type === 'transfer' ? destAccount.value?.ownerId : undefined,
    categoryId: form.type !== 'transfer' ? form.categoryId : undefined,
    subcategoryId: form.type !== 'transfer' ? form.subcategoryId || null : null,
    amount: form.amount,
    toAmount: isCrossCurrencyTransfer.value ? form.toAmount : undefined,
    currency: currency.value,
    exchangeRate: rate,
    baseAmount,
    note: form.note.trim() || undefined,
  }

  if (isEdit.value && props.transaction) {
    await transactions.update(props.transaction.id, payload)
  } else {
    await transactions.add(payload)
    if (form.makeRecurring && form.type !== 'transfer') {
      const endDate = form.endDate ? new Date(form.endDate).getTime() : null
      await templates.add({
        type: form.type,
        accountId: form.accountId,
        toAccountId: undefined,
        categoryId: form.categoryId,
        subcategoryId: form.subcategoryId || null,
        amount: form.amount,
        currency: currency.value,
        note: form.note.trim() || undefined,
        frequency: form.frequency,
        interval: form.interval,
        startDate: when,
        endDate,
        nextDate: advance(when, form.frequency, form.interval),
        active: true,
      })
    }
  }
  emit('saved')
}

async function handleDuplicate() {
  if (!props.transaction) return
  await transactions.duplicate(props.transaction.id)
  emit('duplicated')
}
</script>

<template>
  <Modal :title="isForeign ? 'Переказ' : isEdit ? 'Редагувати операцію' : 'Нова операція'" @close="emit('close')" wide>
    <div v-if="isForeign && props.transaction" class="foreign-view">
      <div class="foreign-summary">
        <IconCircle icon="mdiSwapHorizontal" :color="TRANSFER_CATEGORY_COLOR" :size="46" />
        <div class="foreign-text">
          <span class="foreign-title">Переказ від {{ initiatorName }}</span>
          <span class="foreign-sub">
            {{ resolveAccountLabel(props.transaction.accountId, accounts.all, allAccountsStore.all, profilesStore.all) }}
            →
            {{ resolveAccountLabel(props.transaction.toAccountId, accounts.all, allAccountsStore.all, profilesStore.all) }}
          </span>
        </div>
      </div>

      <div class="foreign-amount">{{ formatMoney(props.transaction.amount, props.transaction.currency) }}</div>
      <p class="foreign-date">{{ fullDateLabel(new Date(props.transaction.date)) }}</p>
      <p v-if="props.transaction.note" class="foreign-note">{{ props.transaction.note }}</p>

      <p class="hint foreign-hint">
        Цей переказ ініціював інший профіль — редагувати його може лише той, хто його створив. Видалення
        прибере запис в обох профілях.
      </p>
      <button class="footer-btn danger foreign-delete" @click="emit('deleted')">
        <MdiIcon name="mdiTrashCanOutline" :size="20" />
        Видалити
      </button>
    </div>

    <div v-else-if="noAccounts" class="no-accounts">
      <MdiIcon name="mdiWalletOutline" :size="40" color="var(--text-muted)" />
      <p>Щоб додати операцію, спершу потрібен хоча б один рахунок.</p>
      <button class="btn btn-primary" @click="goCreateAccount">Створити рахунок</button>
    </div>

    <template v-else>
    <div class="segmented type-toggle">
      <button :class="{ active: form.type === 'expense' }" @click="form.type = 'expense'">Витрата</button>
      <button :class="{ active: form.type === 'income' }" @click="form.type = 'income'">Дохід</button>
      <button :class="{ active: form.type === 'transfer' }" @click="form.type = 'transfer'">Переказ</button>
    </div>

    <div class="field">
      <label>{{ form.type === 'transfer' ? 'З рахунку' : 'Рахунок' }}</label>
      <select v-model="form.accountId">
        <option v-for="a in accounts.active" :key="a.id" :value="a.id">{{ a.name }} ({{ a.currency }})</option>
      </select>
    </div>

    <div v-if="form.type === 'transfer'" class="field">
      <label>До рахунку</label>
      <select v-model="form.toAccountId">
        <option value="" disabled>— Оберіть рахунок —</option>
        <option v-for="d in transferDestinations" :key="d.id" :value="d.id">{{ d.label }}</option>
      </select>
    </div>

    <div v-else class="field">
      <label>Категорія</label>
      <div class="category-scroller scrollbar-none">
        <button
          v-for="c in topCategories"
          :key="c.id"
          class="cat-chip"
          :class="{ selected: c.id === form.categoryId }"
          @click="pickCategory(c.id)"
        >
          <IconCircle :icon="c.icon" :color="c.color" :size="46" />
          <span>{{ c.name }}</span>
        </button>
      </div>
      <div v-if="subcategories.length" class="subcat-row">
        <button
          v-for="s in subcategories"
          :key="s.id"
          class="subcat-chip"
          :class="{ selected: s.id === form.subcategoryId }"
          @click="pickSubcategory(s.id)"
        >
          {{ s.name }}
        </button>
      </div>
    </div>

    <div class="row-2">
      <div class="field">
        <label>Сума ({{ currency }})</label>
        <input v-model.number="form.amount" type="number" step="0.01" min="0" placeholder="0.00" inputmode="decimal" />
      </div>
      <div class="field">
        <label>Дата</label>
        <input v-model="form.date" type="date" />
      </div>
    </div>

    <div v-if="form.type !== 'transfer' && needsRate" class="field">
      <label>Сума зарахування ({{ settings.baseCurrency }})</label>
      <input v-model.number="creditAmount" type="number" step="0.01" inputmode="decimal" />
      <span class="hint">Розраховано за курсом НБУ, можна відредагувати вручну. Впливає лише на аналітику; баланс рахунку рахується у власній валюті.</span>
    </div>

    <div v-if="isCrossCurrencyTransfer" class="field">
      <label>Сума зарахування ({{ destAccount?.currency }})</label>
      <input v-model.number="form.toAmount" type="number" step="0.01" inputmode="decimal" @input="toAmountTouched = true" />
      <span class="hint">Розраховано за курсом НБУ, можна відредагувати вручну.</span>
    </div>

    <div class="field">
      <label>Нотатки</label>
      <input v-model="form.note" type="text" placeholder="Нотатки…" />
    </div>

    <div v-if="!isEdit && form.type !== 'transfer'" class="field recurring-field">
      <label class="toggle-label">
        <input v-model="form.makeRecurring" type="checkbox" />
        <span>Зробити повторюваною операцією</span>
      </label>
      <div v-if="form.makeRecurring" class="recurring-options">
        <div class="row-2">
          <div class="field">
            <label>Періодичність</label>
            <select v-model="form.frequency">
              <option value="daily">Щодня</option>
              <option value="weekly">Щотижня</option>
              <option value="monthly">Щомісяця</option>
              <option value="yearly">Щороку</option>
            </select>
          </div>
          <div class="field">
            <label>Кожні N</label>
            <input v-model.number="form.interval" type="number" min="1" />
          </div>
        </div>
        <div class="field">
          <label>Діє до (необов'язково)</label>
          <input v-model="form.endDate" type="date" />
        </div>
        <span class="hint">
          Наступна операція буде створена автоматично при відкритті додатку після настання дати.
        </span>
      </div>
    </div>

    <span v-if="error" class="field-error submit-error">{{ error }}</span>
    <button class="btn btn-primary submit" :disabled="!!error" @click="submit">
      {{ isEdit ? 'Зберегти' : 'Додати' }}
    </button>

    <div v-if="isEdit" class="footer-actions">
      <button class="footer-btn danger" @click="emit('deleted')">
        <MdiIcon name="mdiTrashCanOutline" :size="20" />
        Видалити
      </button>
      <button class="footer-btn" @click="handleDuplicate">
        <MdiIcon name="mdiContentDuplicate" :size="20" />
        Дублювати
      </button>
    </div>
    </template>
  </Modal>
</template>

<style scoped>
.foreign-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  padding: 8px 4px 4px;
}

.foreign-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  width: 100%;
  margin-bottom: 12px;
}

.foreign-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.foreign-title {
  font-size: 14px;
  font-weight: 600;
}

.foreign-sub {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.foreign-amount {
  font-size: 26px;
  font-weight: 700;
  color: var(--transfer);
}

.foreign-date {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 6px 0 0;
}

.foreign-note {
  font-size: 13px;
  color: var(--text-primary);
  font-style: italic;
  margin: 6px 0 0;
}

.foreign-hint {
  margin-top: 16px;
}

.foreign-delete {
  width: 100%;
  margin-top: 12px;
}

.no-accounts {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px 8px 8px;
  text-align: center;
}

.no-accounts p {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

.type-toggle {
  margin-bottom: 18px;
}

.category-scroller {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 8px;
}

.cat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
  width: 64px;
}

.cat-chip span {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 64px;
}

.cat-chip.selected span {
  color: var(--text-primary);
  font-weight: 600;
}

.cat-chip.selected :deep(.icon-circle) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.subcat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.subcat-chip {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  padding: 6px 14px;
  font-size: 12.5px;
  cursor: pointer;
}

.subcat-chip.selected {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
}

.toggle-label input {
  width: 18px;
  height: 18px;
}

.recurring-options {
  margin-top: 12px;
  padding: 12px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.hint {
  font-size: 11px;
  color: var(--text-muted);
}

.submit-error {
  display: block;
  margin-bottom: 8px;
}

.submit {
  width: 100%;
}

.footer-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.footer-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: var(--surface-2);
  color: var(--text-secondary);
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  cursor: pointer;
}

.footer-btn.danger {
  color: var(--expense);
}
</style>
