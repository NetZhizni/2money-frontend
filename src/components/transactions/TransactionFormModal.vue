<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import AmountKeypad from './AmountKeypad.vue'
import AccountPickerModal from './AccountPickerModal.vue'
import CategoryPickerModal from './CategoryPickerModal.vue'
import OperationDateModal from './OperationDateModal.vue'
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
import type { AccountPickerItem } from '../../types/pickerItems'

const props = defineProps<{
  open: boolean
  transaction?: Transaction | null
  presetAccountId?: string
  presetCategoryId?: string
  // Префіл НОВОЇ (ще не збереженої) операції — на відміну від `transaction`
  // (режим редагування, PATCH), ці лише підставляють стартові значення форми
  // при створенні. Використовується розпізнаванням чека (ReceiptScanReviewModal)
  // для передачі того, що вже визначив Gemini, залишаючи саме збереження на
  // користувачі (рахунок все одно обирає він).
  presetAmount?: number
  presetNote?: string
  presetType?: TransactionType
  presetDate?: number
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

const transferDestinations = computed<AccountPickerItem[]>(() => {
  const own = accounts.active
    .filter((a) => a.id !== form.accountId)
    .map((a) => ({
      id: a.id,
      name: `${a.name} (${a.currency})`,
      icon: a.icon,
      color: a.color,
      currency: a.currency,
      balance: accounts.balanceOf(a),
      group: a.type === 'savings' ? 'Заощадження' : 'Рахунки',
    }))
  const foreign = allAccountsStore.all
    .filter((a) => a.ownerId !== authStore.uid && !a.archived)
    .map((a) => ({
      id: a.id,
      name: `${a.name} (${a.currency})`,
      icon: a.icon,
      color: a.color,
      currency: a.currency,
      group: profilesStore.byId(a.ownerId)?.displayName ?? 'Інший профіль',
    }))
  return [...own, ...foreign]
})

// Own accounts as "З рахунку" picker rows — every account type mixed
// together, grouped by AccountPickerModal itself (Рахунки / Заощадження).
const fromPickerItems = computed<AccountPickerItem[]>(() =>
  accounts.active.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    color: a.color,
    currency: a.currency,
    balance: accounts.balanceOf(a),
    group: a.type === 'savings' ? 'Заощадження' : 'Рахунки',
  })),
)

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
// Rebuilt fresh (not just once at setup) since this component stays
// permanently mounted and reused across pages — see the `open` watch below.
function buildForm() {
  const presetCategory = props.presetCategoryId ? categories.byId(props.presetCategoryId) : undefined
  const presetTopCategoryId = presetCategory ? presetCategory.parentId ?? presetCategory.id : undefined
  const presetSubcategoryId = presetCategory?.parentId ? presetCategory.id : undefined
  const initialType = (props.transaction?.type ?? props.presetType ?? (presetCategory?.kind === 'income' ? 'income' : 'expense')) as TransactionType

  // Opened straight into a category (e.g. "Додати операцію" from that
  // category's page) with no explicit account context — offer the same
  // history-based guess a manual category pick would (see applyAutoAccount).
  const autoAccountId =
    !props.transaction && !props.presetAccountId && presetTopCategoryId
      ? mostUsedAccountForCategory(presetTopCategoryId, presetSubcategoryId)
      : undefined

  // Mirror image of the above: opened straight into an account (e.g.
  // "Додати операцію" from that account's page, on "Рахунки") with no
  // explicit category — guess the category most often paired with it.
  const autoCategoryId =
    !props.transaction && !props.presetCategoryId && props.presetAccountId && initialType !== 'transfer'
      ? mostUsedCategoryForAccount(props.presetAccountId, initialType)
      : undefined

  return {
    type: initialType,
    accountId: props.transaction?.accountId ?? props.presetAccountId ?? autoAccountId ?? accounts.active[0]?.id ?? '',
    toAccountId: props.transaction?.toAccountId ?? '',
    categoryId: props.transaction?.categoryId ?? presetTopCategoryId ?? autoCategoryId ?? '',
    subcategoryId: props.transaction?.subcategoryId ?? presetSubcategoryId ?? '',
    amount: props.transaction?.amount ?? props.presetAmount ?? (undefined as number | undefined),
    toAmount: props.transaction?.toAmount ?? (undefined as number | undefined),
    exchangeRate: props.transaction?.exchangeRate ?? 1,
    toExchangeRate: 1,
    date: todayDateInputValue(props.transaction?.date ?? props.presetDate),
    note: props.transaction?.note ?? props.presetNote ?? '',
    makeRecurring: false,
    frequency: 'monthly' as RecurringFrequency,
    interval: 1,
    endDate: '',
  }
}

const form = reactive(buildForm())

const creditTouched = ref(false)
const toAmountTouched = ref(false)
// Set once the user explicitly picks a "from" account in this form session —
// blocks the category-based auto-guess below from overwriting a deliberate choice.
const accountTouched = ref(false)

// Which picker popup is open, if any. Account picking distinguishes
// 'from'/'to' (transfers need both); category picking has only one slot.
const showAccountPicker = ref<'from' | 'to' | null>(null)
const showCategoryPicker = ref(false)
const showDatePicker = ref(false)

// Bumped on every (re)open and used as AmountKeypad's `:key` — the keypad
// keeps its typed expression as purely-internal state (see AmountKeypad.vue),
// so remounting it is the simplest reliable way to reset that state back to
// this transaction's amount instead of racing an imperative reset() against
// the modal's open transition.
const formResetKey = ref(0)

// Reused across pages/openings (see popups store) — re-derive the form from
// the current props every time it's (re)opened, otherwise a second open would
// keep showing whatever the first edit left behind.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(form, buildForm())
    creditTouched.value = false
    toAmountTouched.value = false
    accountTouched.value = false
    showAccountPicker.value = null
    showCategoryPicker.value = false
    showDatePicker.value = false
    formResetKey.value++
  },
)

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
  applyAutoAccount(id)
}
function pickSubcategory(id: string) {
  form.subcategoryId = form.subcategoryId === id ? '' : id
  applyAutoAccount(form.categoryId, form.subcategoryId || undefined)
}

// Best-guess "from" account for a category — the account most often used for
// it in the past (ties favor the more recent transaction, since
// transactions.all is already sorted newest-first). Only ever offered while
// creating a new transaction, and never once the user has picked an account
// themselves in this form session.
function applyAutoAccount(categoryId: string, subcategoryId?: string) {
  if (isEdit.value || props.presetAccountId || accountTouched.value) return
  const guess = mostUsedAccountForCategory(categoryId, subcategoryId)
  if (guess) form.accountId = guess
}

function mostUsedAccountForCategory(categoryId: string, subcategoryId?: string): string | undefined {
  const activeIds = new Set(accounts.active.map((a) => a.id))
  const matches = transactions.all.filter(
    (t) =>
      t.type !== 'transfer' &&
      (subcategoryId ? t.subcategoryId === subcategoryId : t.categoryId === categoryId) &&
      activeIds.has(t.accountId),
  )
  if (!matches.length) return undefined
  const counts = new Map<string, number>()
  for (const t of matches) counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1)
  let bestId: string | undefined
  let bestCount = 0
  for (const t of matches) {
    const count = counts.get(t.accountId)!
    if (count > bestCount) {
      bestCount = count
      bestId = t.accountId
    }
  }
  return bestId
}

// Mirror of mostUsedAccountForCategory: the top-level category most often
// paired with this account for a given operation type — used to prefill the
// form when it's opened straight from an account (see buildForm above).
function mostUsedCategoryForAccount(accountId: string, kind: 'income' | 'expense'): string | undefined {
  const matches = transactions.all.filter((t) => t.type === kind && t.accountId === accountId && !!t.categoryId)
  if (!matches.length) return undefined
  const counts = new Map<string, number>()
  for (const t of matches) counts.set(t.categoryId!, (counts.get(t.categoryId!) ?? 0) + 1)
  let bestId: string | undefined
  let bestCount = 0
  for (const t of matches) {
    const count = counts.get(t.categoryId!)!
    if (count > bestCount) {
      bestCount = count
      bestId = t.categoryId
    }
  }
  return bestId
}

watch(
  () => form.type,
  () => {
    form.categoryId = ''
    form.subcategoryId = ''
  },
)

// ---------- "Від кого / кому" split header ----------

const TYPE_LABELS: Record<TransactionType, string> = { expense: 'Витрата', income: 'Дохід', transfer: 'Переказ' }
const amountTypeLabel = computed(() => TYPE_LABELS[form.type])

const fromLabel = computed(() => (form.type === 'transfer' ? 'З рахунку' : 'Рахунок'))
const toLabel = computed(() => (form.type === 'transfer' ? 'На рахунок' : 'Категорія'))

const fromIcon = computed(() => sourceAccount.value?.icon ?? 'mdiWalletOutline')
// Left blank (rather than a CSS-var fallback) when nothing's picked yet —
// `.op-half`'s own placeholder style takes over then. What IS set here is
// always a plain hex from account/category data, never a var() reference, so
// it's safe to hand straight to an SVG fill attribute.
const fromColor = computed(() => sourceAccount.value?.color)
const fromName = computed(() => sourceAccount.value?.name ?? 'Оберіть рахунок')

const toIcon = computed(() =>
  form.type === 'transfer' ? destAccount.value?.icon ?? 'mdiWalletOutline' : selectedCategory.value?.icon ?? 'mdiShapeOutline',
)
const toColor = computed(() =>
  form.type === 'transfer' ? destAccount.value?.color : selectedCategory.value?.color,
)
const toName = computed(() =>
  form.type === 'transfer' ? destAccount.value?.name ?? 'Оберіть рахунок' : selectedCategory.value?.name ?? 'Оберіть категорію',
)

// The keypad's submit key always wants *some* accent — falls back to the
// transaction type's own color when no account/category is picked yet.
const keypadAccent = computed(() => {
  if (toColor.value) return toColor.value
  if (form.type === 'transfer') return 'var(--transfer)'
  return form.type === 'income' ? 'var(--income)' : 'var(--expense)'
})

function openFromPicker() {
  showAccountPicker.value = 'from'
}
function openToPicker() {
  if (form.type === 'transfer') showAccountPicker.value = 'to'
  else showCategoryPicker.value = true
}
function selectAccount(id: string) {
  if (showAccountPicker.value === 'to') {
    form.toAccountId = id
  } else {
    form.accountId = id
    accountTouched.value = true
  }
  showAccountPicker.value = null
}
function selectCategory(id: string) {
  pickCategory(id)
  showCategoryPicker.value = false
}

// ---------- Date popup ----------

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: 'Щодня',
  weekly: 'Щотижня',
  monthly: 'Щомісяця',
  yearly: 'Щороку',
}
const recurringSummary = computed(() => FREQUENCY_LABELS[form.frequency])
const showRecurringInDatePopup = computed(() => !isEdit.value && form.type !== 'transfer')

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
  <Modal :open="open" :title="isForeign ? 'Переказ' : isEdit ? 'Редагувати операцію' : 'Нова операція'" @close="emit('close')" wide top>
    <div v-if="isForeign && props.transaction" class="foreign-view">
      <div class="foreign-summary">
        <IconCircle icon="mdiSwapHorizontal" :color="TRANSFER_CATEGORY_COLOR" :size="46" />
        <div class="foreign-text">
          <span class="foreign-title">Переказ від {{ initiatorName }}</span>
          <span class="foreign-sub">
            {{ resolveAccountLabel(props.transaction.accountId, authStore.uid, allAccountsStore.all, profilesStore.all) }}
            →
            {{ resolveAccountLabel(props.transaction.toAccountId, authStore.uid, allAccountsStore.all, profilesStore.all) }}
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

    <div class="op-header">
      <button type="button" class="op-half" :class="{ placeholder: !fromColor }" :style="fromColor ? { background: fromColor } : undefined" @click="openFromPicker">
        <span class="op-icon-bubble">
          <MdiIcon :name="fromIcon" :size="19" :color="fromColor" />
        </span>
        <span class="op-text">
          <span class="op-label">{{ fromLabel }}</span>
          <span class="op-value">{{ fromName }}</span>
        </span>
      </button>
      <button type="button" class="op-half" :class="{ placeholder: !toColor }" :style="toColor ? { background: toColor } : undefined" @click="openToPicker">
        <span class="op-icon-bubble">
          <MdiIcon :name="toIcon" :size="19" :color="toColor" />
        </span>
        <span class="op-text">
          <span class="op-label">{{ toLabel }}</span>
          <span class="op-value">{{ toName }}</span>
        </span>
      </button>
    </div>

    <div v-if="form.type !== 'transfer' && subcategories.length" class="subcat-row scrollbar-none">
      <button
        v-for="s in subcategories"
        :key="s.id"
        class="subcat-chip"
        :class="{ selected: s.id === form.subcategoryId }"
        :style="s.id === form.subcategoryId ? { background: s.color, borderColor: s.color } : undefined"
        @click="pickSubcategory(s.id)"
      >
        <MdiIcon :name="s.icon" :size="15" :color="s.id === form.subcategoryId ? '#fff' : s.color" />
        <span>{{ s.name }}</span>
      </button>
    </div>

    <AmountKeypad
      :key="formResetKey"
      :initial-value="props.transaction?.amount ?? props.presetAmount"
      :currency="currency"
      :label="amountTypeLabel"
      :accent-color="keypadAccent"
      :submit-disabled="!!error"
      @update:model-value="(v) => (form.amount = v)"
      @submit="submit"
      @open-date="showDatePicker = true"
    >
      <input v-model="form.note" type="text" class="note-input" placeholder="Нотатки…" />
    </AmountKeypad>

    <span v-if="error" class="field-error submit-error">{{ error }}</span>

    <button type="button" class="date-footer-label" @click="showDatePicker = true">
      {{ fullDateLabel(new Date(form.date)) }}
    </button>

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

  <AccountPickerModal
    :open="showAccountPicker !== null"
    :title="showAccountPicker === 'to' ? 'На рахунок' : 'Рахунок'"
    :items="showAccountPicker === 'to' ? transferDestinations : fromPickerItems"
    :selected-id="showAccountPicker === 'to' ? form.toAccountId : form.accountId"
    @close="showAccountPicker = null"
    @select="selectAccount"
  />

  <CategoryPickerModal
    :open="showCategoryPicker"
    :kind="kindForCategories"
    :categories="topCategories"
    :selected-id="form.categoryId"
    @close="showCategoryPicker = false"
    @select="selectCategory"
  />

  <OperationDateModal
    :open="showDatePicker"
    :date="form.date"
    :show-recurring="showRecurringInDatePopup"
    :recurring="form.makeRecurring"
    :recurring-summary="recurringSummary"
    @close="showDatePicker = false"
    @update:date="(v) => (form.date = v)"
    @update:recurring="(v) => (form.makeRecurring = v)"
  />
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.op-half.placeholder .op-value {
  color: var(--text-muted);
  font-weight: 600;
}

.subcat-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
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

.note-input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 11px 14px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
}

.note-input:focus {
  border-color: var(--accent);
}

.date-footer-label {
  display: block;
  width: 100%;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 12.5px;
  text-align: center;
  padding: 14px 0 4px;
  cursor: pointer;
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
  text-align: center;
  margin-top: 6px;
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
