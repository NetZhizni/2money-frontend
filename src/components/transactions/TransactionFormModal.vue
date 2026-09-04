<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import FieldRow from '../common/FieldRow.vue'
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
import { useAllReceiptsStore } from '../../stores/allReceipts'
import { getRateForDate } from '../../db/exchangeRates'
import { advance } from '../../db/recurring'
import { dateKey, formatMoney, fullDateLabel } from '../../utils/format'
import { resolveAccountLabel, accountGroupLabel } from '../../utils/accountLabel'
import { resolveCategoryCurrency } from '../../utils/currencies'
import { TRANSFER_CATEGORY_COLOR } from '../../utils/transferAnalytics'
import { t } from '../../i18n'
import type { MessageKey } from '../../i18n'
import type { Transaction, TransactionType, RecurringFrequency } from '../../types/models'
import type { AccountPickerItem } from '../../types/pickerItems'

const props = defineProps<{
  open: boolean
  transaction?: Transaction | null
  presetAccountId?: string
  presetCategoryId?: string
  // Префіл НОВОЇ (ще не збереженої) операції — на відміну від `transaction`
  // (режим редагування, PATCH), ці лише підставляють стартові значення форми
  // при створенні. Використовується розпізнаванням чека (ReceiptEditModal's
  // scanFile-режим) для передачі того, що вже визначив Gemini, залишаючи саме
  // збереження на користувачі (рахунок все одно обирає він).
  presetAmount?: number
  presetNote?: string
  presetType?: TransactionType
  presetDate?: number
  // Разом з presetAmount/presetNote/... — тримає нову операцію в тій самій
  // групі "чек", якщо форму відкрито через "Редагувати" на розпізнаному
  // драфті (див. ReceiptEditModal.vue). Може бути ще не заведеним у БД чеком
  // (`null`) — сама лише локальна ідентифікація для лока полів нижче,
  // прив'язка ставиться реально лише при фактичному збереженні операції.
  presetReceiptId?: string | null
  // Приховує кнопку "Додати в чек" — коли цей примірник форми сам вкладений
  // всередину ReceiptEditModal.vue (редагування суми/категорії операції, яка
  // вже є частиною чека, що зараз редагується), відкривати звідти ще один
  // рівень "додати в чек" нема сенсу.
  disableAddToReceipt?: boolean
  // Для ReceiptEditModal.vue's scanFile-режиму: тип/рахунок/дата все одно
  // локаються так, ніби чек вже існує (навіть якщо presetReceiptId ще null —
  // сам рядок чека там з'являється лише по "Зберегти"), а submit() НЕ пише
  // нічого в transactions store — натомість віддає введені поля назовні через
  // `draftSaved`, щоб викликач сам вирішив, коли (і чи) вони стануть
  // справжньою операцією. Так розпізнаний, але ще не підтверджений пункт чека
  // не з'являється в БД просто від того, що йому підібрали категорію.
  deferSave?: boolean
}>()
const emit = defineEmits<{
  close: []
  saved: []
  deleted: []
  duplicated: []
  addToReceipt: []
  draftSaved: [{ type: 'expense' | 'income'; note: string | null; amount: number; categoryId: string; subcategoryId: string | null }]
}>()

const router = useRouter()
const accounts = useAccountsStore()
const allAccountsStore = useAllAccountsStore()
const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const settings = useSettingsStore()
const templates = useTemplatesStore()
const authStore = useAuthStore()
const profilesStore = useProfilesStore()
const allReceiptsStore = useAllReceiptsStore()

// A transfer initiated by another profile (we're only the counterparty) is
// read-only here: the backend only lets the owning profile PATCH/DELETE it
// (see patchTransaction.js/removeTransaction.js), and re-purposing the full
// editable form for someone else's transaction
// looked confusing (source/destination account pickers can't resolve a
// foreign account the same way). Show a simple summary instead.
const isForeign = computed(() => !!props.transaction && props.transaction.ownerId !== authStore.uid)

// The source account's own Settings → "Формат валюти" override, for the
// read-only foreign-transfer amount below — looked up from the whole-family
// list since this account (the OTHER profile's) never appears in `accounts`.
const foreignAmountCurrencyDisplay = computed(() =>
  props.transaction ? allAccountsStore.byId(props.transaction.accountId)?.currencyDisplay : undefined,
)

const initiatorName = computed(() =>
  props.transaction ? profilesStore.byId(props.transaction.ownerId)?.displayName ?? '?' : '?',
)

// Both an already-saved grouped transaction (props.transaction.receiptId) and
// a not-yet-saved one being created from a receipt-scan draft
// (props.presetReceiptId — see ReceiptEditModal.vue's scanFile-режим) must
// keep the same account/date as the rest of their receipt:
// fin.receipts.account_id/date is the group's single source of truth (same
// file), so letting
// this form silently diverge one operation's account/date from it would
// break the "same account, same day" invariant the whole feature relies on.
// The Витрата/Дохід/Переказ toggle is locked too — a receipt only ever
// groups expense/income operations (see scanReceipt.js's normalizeOperation
// and the "merge" flow in OperationsDataView.vue, both of which already
// exclude transfers), so switching type here would either silently break
// that or turn a grouped item into a transfer with nowhere to go.
// `locallyDetached` lets an explicit "Відв'язати" lift the lock immediately,
// without waiting for `props.transaction` (a snapshot handed down by the
// popups store, not itself reactive to this component's own writes) to
// catch up. `deferSave` locks the same way even with no `presetReceiptId` at
// all yet — a scan draft's chek may not be a real fin.receipts row until
// "Зберегти" (see ReceiptEditModal.vue), but its account/date/type are
// already just as fixed.
const locallyDetached = ref(false)
const lockedReceiptId = computed(() => props.transaction?.receiptId ?? props.presetReceiptId ?? null)
const lockedByReceipt = computed(() => !locallyDetached.value && (!!lockedReceiptId.value || !!props.deferSave))
const lockedReceipt = computed(() => (lockedReceiptId.value ? allReceiptsStore.byId(lockedReceiptId.value) ?? null : null))

async function detachFromReceipt() {
  if (!props.transaction) return
  await transactions.update(props.transaction.id, { receiptId: null })
  locallyDetached.value = true
}

const transferDestinations = computed<AccountPickerItem[]>(() => {
  const own = accounts.active
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
    }))
  const foreign = allAccountsStore.all
    .filter((a) => a.ownerId !== authStore.uid && !a.archived)
    .map((a) => ({
      id: a.id,
      name: `${a.name} (${a.currency})`,
      icon: a.icon,
      color: a.color,
      currency: a.currency,
      currencyDisplay: a.currencyDisplay,
      group: profilesStore.byId(a.ownerId)?.displayName ?? t('transactions.picker.otherProfile'),
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
    currencyDisplay: a.currencyDisplay,
    balance: accounts.balanceOf(a),
    group: accountGroupLabel(a),
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
    date: todayDateInputValue(props.transaction?.date ?? props.presetDate),
    note: props.transaction?.note ?? props.presetNote ?? '',
    makeRecurring: false,
    frequency: 'monthly' as RecurringFrequency,
    interval: 1,
    endDate: '',
  }
}

const form = reactive(buildForm())

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
    accountTouched.value = false
    locallyDetached.value = false
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

// Declared here (rather than down by the rest of the category-picking state)
// so the dual-currency block right below — including an `immediate: true`
// watcher that reads it synchronously during setup — can reference it
// without a temporal-dead-zone error.
const selectedCategory = computed(() => categories.byId(form.categoryId))

// An expense/income against a category with its own fixed currency
// (different from the source account's) gets the same two-value calculator
// as a cross-currency transfer — see AmountKeypad.vue's `dual` mode. A
// category's currency always resolves to *something* now (defaults to the
// base currency — see utils/currencies.ts's resolveCategoryCurrency), so this
// also doubles as the old per-transaction "Сума зарахування" manual-rate
// override: whenever the account's currency differs from the base currency
// and the category was left at its default, this fires the same as it used
// to for "any foreign-currency operation".
const isCrossCurrencyCategory = computed(
  () =>
    form.type !== 'transfer' &&
    !!selectedCategory.value &&
    resolveCategoryCurrency(selectedCategory.value, settings.baseCurrency, transactions.all) !== currency.value,
)
const isDualCurrency = computed(() => isCrossCurrencyTransfer.value || isCrossCurrencyCategory.value)
// Income into a fixed-currency category is naturally thought of "amount-first"
// in the category's own currency (e.g. "$100 from the deposit"), with the
// account side derived — the opposite order from every other case (expense,
// and transfers), where the primary tile stays the source/account currency,
// unchanged from today. When true, the keypad's PRIMARY tile is bound to
// `form.toAmount` instead of `form.amount`.
const dualPrimaryIsToAmount = computed(() => isCrossCurrencyCategory.value && form.type === 'income')
const dualOtherCurrency = computed(() =>
  isCrossCurrencyTransfer.value
    ? destAccount.value?.currency
    : selectedCategory.value
      ? resolveCategoryCurrency(selectedCategory.value, settings.baseCurrency, transactions.all)
      : undefined,
)
const dualPrimaryCurrency = computed(() => (dualPrimaryIsToAmount.value ? dualOtherCurrency.value : currency.value))
const dualSecondaryCurrency = computed(() => (dualPrimaryIsToAmount.value ? currency.value : dualOtherCurrency.value))

// Same "which entity actually owns this tile's currency" mapping as
// dualOtherCurrency/dualPrimaryCurrency/dualSecondaryCurrency above, just
// reading each entity's own Settings → "Формат валюти" override instead of
// its currency code — fed into AmountKeypad's `currency-display`/
// `dual.currencyDisplay` below so the calculator shows the same style
// AccountCard.vue/CategoryTile.vue etc. already do for that same account/category.
const accountCurrencyDisplay = computed(() => sourceAccount.value?.currencyDisplay)
const dualOtherCurrencyDisplay = computed(() =>
  isCrossCurrencyTransfer.value ? destAccount.value?.currencyDisplay : selectedCategory.value?.currencyDisplay,
)
const primaryCurrencyDisplay = computed(() => (dualPrimaryIsToAmount.value ? dualOtherCurrencyDisplay.value : accountCurrencyDisplay.value))
const secondaryCurrencyDisplay = computed(() => (dualPrimaryIsToAmount.value ? accountCurrencyDisplay.value : dualOtherCurrencyDisplay.value))

// Exchange rate between the dual calculator's two tiles (secondary units per
// 1 primary unit) — AmountKeypad.vue's `dual` mode uses this to keep the
// untouched tile tracking the other one; it owns deriving/touching the
// actual amounts itself (see its `dual.rate` prop).
const dualRate = ref(1)
watch(
  [() => form.date, dualPrimaryCurrency, dualSecondaryCurrency, isDualCurrency],
  async () => {
    if (!isDualCurrency.value || !dualPrimaryCurrency.value || !dualSecondaryCurrency.value) return
    const when = new Date(form.date).getTime()
    const [primaryRate, secondaryRate] = await Promise.all([
      getRateForDate(dualPrimaryCurrency.value, when),
      getRateForDate(dualSecondaryCurrency.value, when),
    ])
    dualRate.value = secondaryRate > 0 ? primaryRate / secondaryRate : 1
  },
  { immediate: true },
)

const dualConfig = computed(() => {
  if (!isDualCurrency.value || !dualSecondaryCurrency.value) return undefined
  return {
    label: t('transactions.form.credited'),
    currency: dualSecondaryCurrency.value,
    currencyDisplay: secondaryCurrencyDisplay.value,
    value: dualPrimaryIsToAmount.value ? form.amount : form.toAmount,
    rate: dualRate.value,
  }
})

function setDualPrimary(v?: number) {
  if (dualPrimaryIsToAmount.value) form.toAmount = v
  else form.amount = v
}
function setDualSecondary(v?: number) {
  if (dualPrimaryIsToAmount.value) form.amount = v
  else form.toAmount = v
}

const kindForCategories = computed(() => (form.type === 'income' ? 'income' : 'expense'))
const topCategories = computed(() => categories.topLevel(kindForCategories.value))
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

const amountTypeLabel = computed(() =>
  form.type === 'expense' ? t('categories.form.expenseType') : form.type === 'income' ? t('categories.form.incomeType') : t('transactions.form.typeTransfer'),
)

const fromLabel = computed(() => (form.type === 'transfer' ? t('transactions.form.fromAccount') : t('transactions.form.account')))
const toLabel = computed(() => (form.type === 'transfer' ? t('transactions.form.toAccount') : t('transactions.form.category')))

const fromIcon = computed(() => sourceAccount.value?.icon ?? 'mdiWalletOutline')
// Left blank (rather than a CSS-var fallback) when nothing's picked yet —
// `.op-half`'s own placeholder style takes over then. What IS set here is
// always a plain hex from account/category data, never a var() reference, so
// it's safe to hand straight to an SVG fill attribute.
const fromColor = computed(() => sourceAccount.value?.color)
const fromName = computed(() => sourceAccount.value?.name ?? t('transactions.form.chooseAccount'))

const toIcon = computed(() =>
  form.type === 'transfer' ? destAccount.value?.icon ?? 'mdiWalletOutline' : selectedCategory.value?.icon ?? 'mdiShapeOutline',
)
const toColor = computed(() =>
  form.type === 'transfer' ? destAccount.value?.color : selectedCategory.value?.color,
)
const toName = computed(() =>
  form.type === 'transfer' ? destAccount.value?.name ?? t('transactions.form.chooseAccount') : selectedCategory.value?.name ?? t('transactions.form.chooseCategory'),
)

// The keypad's submit key always wants *some* accent — falls back to the
// transaction type's own color when no account/category is picked yet.
const keypadAccent = computed(() => {
  if (toColor.value) return toColor.value
  if (form.type === 'transfer') return 'var(--transfer)'
  return form.type === 'income' ? 'var(--income)' : 'var(--expense)'
})

function openFromPicker() {
  if (lockedByReceipt.value) return
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

const FREQUENCY_LABEL_KEYS: Record<RecurringFrequency, MessageKey> = {
  daily: 'transactions.form.freqDaily',
  weekly: 'transactions.form.freqWeekly',
  monthly: 'transactions.form.freqMonthly',
  yearly: 'transactions.form.freqYearly',
}
const recurringSummary = computed(() => t(FREQUENCY_LABEL_KEYS[form.frequency]))
const showRecurringInDatePopup = computed(() => !isEdit.value && form.type !== 'transfer')

function openDatePicker() {
  if (lockedByReceipt.value) return
  showDatePicker.value = true
}

const error = computed(() => {
  if (!form.accountId) return t('transactions.form.errorChooseAccount')
  if (form.type === 'transfer' && !form.toAccountId) return t('transactions.form.errorChooseDestAccount')
  if (form.type === 'transfer' && form.toAccountId === form.accountId) return t('transactions.form.errorAccountsMustDiffer')
  if (form.type !== 'transfer' && !form.categoryId) return t('transactions.form.errorChooseCategory')
  if (!form.amount || form.amount <= 0) return t('transactions.form.errorAmountPositive')
  // An emptied native date input becomes '', and `new Date('')` is an
  // Invalid Date — without this guard the operation would still save with a
  // NaN timestamp and then vanish from every date-grouped list (it sorts
  // unpredictably since NaN comparisons are never true/false consistently).
  if (!form.date) return t('transactions.form.errorChooseDate')
  return ''
})

async function submit() {
  if (error.value || !form.amount) return
  // Скан-драфт (ReceiptEditModal.vue) — нічого не пишемо в БД тут: віддаємо
  // введені поля назовні, а справжньою операцією (чи ні) вони стануть лише по
  // "Зберегти" самого чека. Тип на цей момент гарантовано не 'transfer' —
  // toggle заблокований (див. lockedByReceipt), поки deferSave true.
  if (props.deferSave) {
    emit('draftSaved', {
      type: form.type as 'expense' | 'income',
      note: form.note.trim() || null,
      amount: form.amount,
      categoryId: form.categoryId,
      subcategoryId: form.subcategoryId || null,
    })
    return
  }
  const when = new Date(form.date).getTime()

  const payload = {
    type: form.type,
    date: when,
    accountId: form.accountId,
    toAccountId: form.type === 'transfer' ? form.toAccountId : undefined,
    toOwnerId: form.type === 'transfer' ? destAccount.value?.ownerId : undefined,
    categoryId: form.type !== 'transfer' ? form.categoryId : undefined,
    subcategoryId: form.type !== 'transfer' ? form.subcategoryId || null : null,
    amount: form.amount,
    toAmount: isDualCurrency.value ? form.toAmount : undefined,
    currency: currency.value,
    note: form.note.trim() || undefined,
  }

  if (isEdit.value && props.transaction) {
    await transactions.update(props.transaction.id, payload)
  } else {
    // receiptId only ever comes from a preset (new operation created from a
    // receipt-scan draft) — never spread into the shared `payload` above, so
    // editing an already-grouped transaction can't have it silently cleared.
    await transactions.add({ ...payload, receiptId: props.presetReceiptId ?? null })
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
  <Modal :open="open" :title="isForeign ? t('transactions.form.typeTransfer') : isEdit ? t('transactions.form.editTitle') : t('transactions.form.newTitle')" @close="emit('close')" wide top>
    <div v-if="isForeign && props.transaction" class="foreign-view">
      <div class="foreign-summary">
        <IconCircle icon="mdiSwapHorizontal" :color="TRANSFER_CATEGORY_COLOR" :size="46" />
        <div class="foreign-text">
          <span class="foreign-title">{{ t('transactions.form.transferFrom', { name: initiatorName }) }}</span>
          <span class="foreign-sub">
            {{ resolveAccountLabel(props.transaction.accountId, authStore.uid, allAccountsStore.all, profilesStore.all) }}
            →
            {{ resolveAccountLabel(props.transaction.toAccountId, authStore.uid, allAccountsStore.all, profilesStore.all) }}
          </span>
        </div>
      </div>

      <div class="foreign-amount">{{ formatMoney(props.transaction.amount, props.transaction.currency, { currencyDisplay: foreignAmountCurrencyDisplay }) }}</div>
      <p class="foreign-date">{{ fullDateLabel(new Date(props.transaction.date)) }}</p>
      <p v-if="props.transaction.note" class="foreign-note">{{ props.transaction.note }}</p>

      <p class="hint foreign-hint">{{ t('transactions.form.foreignHint') }}</p>
      <button class="footer-btn danger foreign-delete" @click="emit('deleted')">
        <MdiIcon name="mdiTrashCanOutline" :size="20" />
        {{ t('common.delete') }}
      </button>
    </div>

    <div v-else-if="noAccounts" class="no-accounts">
      <MdiIcon name="mdiWalletOutline" :size="40" color="var(--text-muted)" />
      <p>{{ t('transactions.form.noAccountsHint') }}</p>
      <button class="btn btn-primary" @click="goCreateAccount">{{ t('transactions.form.createAccount') }}</button>
    </div>

    <template v-else>
    <div v-if="!lockedByReceipt" class="segmented type-toggle">
      <button :class="{ active: form.type === 'expense' }" :disabled="lockedByReceipt" @click="form.type = 'expense'">{{ t('categories.form.expenseType') }}</button>
      <button :class="{ active: form.type === 'income' }" :disabled="lockedByReceipt" @click="form.type = 'income'">{{ t('categories.form.incomeType') }}</button>
      <button :class="{ active: form.type === 'transfer' }" :disabled="lockedByReceipt" @click="form.type = 'transfer'">{{ t('transactions.form.typeTransfer') }}</button>
    </div>

    <div v-if="lockedByReceipt" class="receipt-lock-hint">
      <MdiIcon name="mdiReceiptTextOutline" :size="14" color="var(--text-muted)" />
      <span>{{ t('transactions.form.receiptLockHint', { merchant: lockedReceipt?.merchant ? ` «${lockedReceipt.merchant}»` : '' }) }}</span>
    </div>

    <div class="op-header">
      <button type="button" class="op-half" :class="{ placeholder: !fromColor, locked: lockedByReceipt }" :style="fromColor ? { background: fromColor } : undefined" @click="openFromPicker">
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
      :initial-value="dualPrimaryIsToAmount ? form.toAmount : form.amount"
      :currency="dualPrimaryIsToAmount ? (dualOtherCurrency ?? currency) : currency"
      :currency-display="primaryCurrencyDisplay"
      :label="amountTypeLabel"
      :accent-color="keypadAccent"
      :submit-disabled="!!error"
      :dual="dualConfig"
      @update:model-value="setDualPrimary"
      @update:dual-value="setDualSecondary"
      @submit="submit"
    >
      <FieldRow icon="mdiNoteTextOutline" :label="t('transactions.form.noteLabel')" class="note-row">
        <input v-model="form.note" type="text" class="field-row-value" :placeholder="t('transactions.form.notePlaceholder')" />
      </FieldRow>
    </AmountKeypad>

    <span v-if="error" class="field-error submit-error">{{ error }}</span>

    <FieldRow tag="button" icon="mdiCalendarBlankOutline" :label="t('transactions.dateModal.title')" class="date-row" :disabled="lockedByReceipt" @click="openDatePicker">
      <span class="field-row-value">{{ fullDateLabel(new Date(form.date)) }}</span>
      <template #trailing>
        <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
      </template>
    </FieldRow>

    <div v-if="!isEdit && form.type !== 'transfer' && !deferSave" class="recurring-field">
      <FieldRow tag="label" icon="mdiRepeat">
        <span class="field-row-value">{{ t('transactions.form.makeRecurring') }}</span>
        <template #trailing>
          <input v-model="form.makeRecurring" type="checkbox" class="field-row-toggle" />
        </template>
      </FieldRow>
      <div v-if="form.makeRecurring" class="recurring-options">
        <div class="row-2">
          <FieldRow icon="mdiCalendarSyncOutline" :label="t('transactions.form.frequencyLabel')">
            <select v-model="form.frequency" class="field-row-value">
              <option value="daily">{{ t('transactions.form.freqDaily') }}</option>
              <option value="weekly">{{ t('transactions.form.freqWeekly') }}</option>
              <option value="monthly">{{ t('transactions.form.freqMonthly') }}</option>
              <option value="yearly">{{ t('transactions.form.freqYearly') }}</option>
            </select>
            <template #trailing>
              <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
            </template>
          </FieldRow>
          <FieldRow icon="mdiCounter" :label="t('transactions.form.everyN')">
            <input v-model.number="form.interval" type="number" min="1" class="field-row-value" />
          </FieldRow>
        </div>
        <FieldRow icon="mdiCalendarBlankOutline" :label="t('transactions.form.endDateLabel')">
          <input v-model="form.endDate" type="date" class="field-row-value" />
        </FieldRow>
        <span class="hint">{{ t('transactions.form.recurringHint') }}</span>
      </div>
    </div>

    <div v-if="isEdit" class="footer-actions">
      <button class="footer-btn danger" @click="emit('deleted')">
        <MdiIcon name="mdiTrashCanOutline" :size="20" />
        {{ t('common.delete') }}
      </button>
      <template v-if="!disableAddToReceipt">
        <!-- Already in a receipt — the same action that used to live as a text
             link in .receipt-lock-hint above; this is now the one place to
             trigger it. Not in a receipt (and not a transfer, which doesn't
             fit a receipt at all) — the opposite: offer to start a new one
             (see App.vue's handleAddToReceiptRequest). -->
        <button v-if="lockedByReceipt" class="footer-btn" @click="detachFromReceipt">
          <MdiIcon name="mdiLinkOff" :size="20" />
          {{ t('transactions.form.detach') }}
        </button>
        <button v-else-if="form.type !== 'transfer'" class="footer-btn" @click="emit('addToReceipt')">
          <MdiIcon name="mdiReceiptTextPlusOutline" :size="20" />
          {{ t('transactions.form.addToReceipt') }}
        </button>
      </template>
      <button class="footer-btn" @click="handleDuplicate">
        <MdiIcon name="mdiContentDuplicate" :size="20" />
        {{ t('transactions.form.duplicate') }}
      </button>
    </div>
    </template>
  </Modal>

  <AccountPickerModal
    :open="showAccountPicker !== null"
    :title="showAccountPicker === 'to' ? t('transactions.form.toAccount') : t('transactions.form.account')"
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

<style lang="scss" scoped>
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

.op-half.locked {
  cursor: default;
  opacity: 0.72;
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

.note-row {
  /* AmountKeypad's own flex column already spaces its children (gap: 14px) —
     drop FieldRow's default bottom margin so it isn't doubled up. */
  margin-bottom: 0;
}

.date-row {
  margin-top: 10px;
}

.receipt-lock-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  margin-bottom: 10px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.receipt-lock-hint span {
  flex: 1;
  min-width: 0;
}

.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.recurring-field {
  margin-bottom: 16px;
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
