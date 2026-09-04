<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import IconCircle from '../common/IconCircle.vue'
import FieldRow from '../common/FieldRow.vue'
import AccountPickerModal from './AccountPickerModal.vue'
import OperationDateModal from './OperationDateModal.vue'
import ReceiptOperationPickerModal from './ReceiptOperationPickerModal.vue'
import TransactionFormModal from './TransactionFormModal.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useAllReceiptsStore } from '../../stores/allReceipts'
import { useReceiptsStore } from '../../stores/receipts'
import { useTransactionsStore } from '../../stores/transactions'
import { useCategoriesStore } from '../../stores/categories'
import { useSettingsStore } from '../../stores/settings'
import { usePopupsStore } from '../../stores/popups'
import { compressImageToBase64 } from '../../utils/imageCompress'
import { scanReceipt, type ScannedOperation } from '../../api/receipts'
import { dateKey, formatMoney, fullDateLabel } from '../../utils/format'
import { newId } from '../../utils/id'
import { accountGroupLabel } from '../../utils/accountLabel'
import { t } from '../../i18n'
import type { AccountPickerItem } from '../../types/pickerItems'
import type { Transaction } from '../../types/models'

/**
 * Редагування чека — назва магазину, рахунок оплати, дата, і склад операцій.
 * Одна і та ж форма обслуговує три способи в неї потрапити (рівно один з
 * `receiptId`/`seedTransaction`/`scanFile` є змістовним на кожне відкриття):
 *  - `receiptId` задано: чек уже існує — база складу читається напряму з
 *    Transaction.receiptId (мінус те, що позначено на видалення, плюс те, що
 *    щойно додано пікером).
 *  - `receiptId` відсутній, замість нього `seedTransaction`: чека як рядка
 *    fin.receipts ще не існує (відкрито через "Додати в чек" з ще НЕ
 *    згрупованої операції — див. App.vue's handleAddToReceiptRequest) —
 *    рядок чека теж створюється лише по "Зберегти".
 *  - `receiptId` відсутній, замість нього `scanFile`: фото щойно сфотканого/
 *    обраного чека — POST /api/receipts/scan (див. api/receipts.ts) розбиває
 *    його на чернеткові операції (`scanDrafts`, ще не Transaction), звірені з
 *    реальними категоріями. Кожен пункт можна відредагувати (звичайна форма
 *    операції, заздалегідь заповнена) — це лише править поля самого драфта
 *    (`onDraftEdited()`, через TransactionFormModal's `deferSave`), а не
 *    зберігає його: навіть підбір категорії розпізнаному-без-категорії пункту
 *    лишається чернеткою, поки не натиснуто "Зберегти" внизу. Саме тоді (і
 *    лише тоді) кожен драфт із заповненою категорією стає справжньою
 *    Transaction, разом з рештою складу.
 *
 * Склад — чернетка: додавання й прибирання операцій (включно з тими, що вже
 * реально прив'язані в БД), і редагування ще не збережених скан-пунктів,
 * міняють лише локальний стан (`stagedIds` / `removedIds` / `scanDrafts`) і
 * застосовуються (Transaction.receiptId чи сама поява Transaction) лише по
 * "Зберегти" (save()) — закрити попап без збереження нічого не змінює.
 *
 * Рахунок/дата — не просто підпис: це єдине джерело правди для всіх
 * пов'язаних операцій, тож збереження завжди каскадно патчить КОЖНУ вже
 * реальну з них (перераховуючи курс/базову суму на нове значення), незалежно
 * від того, чи саме ці поля дійсно змінились. Рахунок можна змінити лише на
 * інший ТІЄЇ Ж валюти, що й уже обраний — інакше довелось би ще й
 * перераховувати самі суми операцій, а не лише прив'язку.
 */
const props = defineProps<{
  open: boolean
  receiptId: string | null
  seedTransaction?: Transaction | null
  scanFile?: File | null
}>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const accounts = useAccountsStore()
const allReceipts = useAllReceiptsStore()
const receipts = useReceiptsStore()
const transactions = useTransactionsStore()
const categories = useCategoriesStore()
const settings = useSettingsStore()
const popups = usePopupsStore()

const receipt = computed(() => (props.receiptId ? allReceipts.byId(props.receiptId) ?? null : null))

const merchant = ref('')
const accountId = ref('')
const dateKeyVal = ref(dateKey(Date.now()))
const showAccountPicker = ref(false)
const showDatePicker = ref(false)
const showOperationPicker = ref(false)
const saving = ref(false)

// Draft composition — see the file doc comment above. `stagedIds` holds ids
// added this session but not yet actually linked in the DB (the seed
// transaction, plus anything picked via the operation picker); `removedIds`
// holds ids that ARE linked in the DB but marked to be unlinked on save.
// Both are empty for a not-yet-created receipt's `removedIds` (nothing to
// remove from yet) and reset every time the popup (re)opens.
const stagedIds = ref<Set<string>>(new Set())
const removedIds = ref<Set<string>>(new Set())

// ---------- Скан чека (props.scanFile) ----------

type Phase = 'idle' | 'loading' | 'error'
const phase = ref<Phase>('idle')
const errorMessage = ref('')
const detectedCurrency = ref<string | null>(null)

interface Draft extends ScannedOperation {
  tempId: string
}
const scanDrafts = ref<Draft[]>([])

async function runScan(file: File) {
  phase.value = 'loading'
  errorMessage.value = ''
  try {
    const { base64, mimeType } = await compressImageToBase64(file)
    const result = await scanReceipt(base64, mimeType)
    merchant.value = result.merchant ?? ''
    dateKeyVal.value = dateKey(result.date ?? Date.now())
    detectedCurrency.value = result.currency
    scanDrafts.value = result.operations.map((op) => ({ ...op, tempId: newId() }))
    phase.value = 'idle'
  } catch (error) {
    console.error('[receipt-scan] failed', error)
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    errorMessage.value = message || t('receipts.scanFailed')
    phase.value = 'error'
  }
}

function retryScan() {
  if (props.scanFile) void runScan(props.scanFile)
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    scanDrafts.value = []
    detectedCurrency.value = null
    errorMessage.value = ''
    phase.value = 'idle'
    if (props.receiptId) {
      merchant.value = receipt.value?.merchant ?? ''
      accountId.value = receipt.value?.accountId ?? ''
      dateKeyVal.value = dateKey(receipt.value?.date ?? Date.now())
    } else if (props.seedTransaction) {
      merchant.value = ''
      accountId.value = props.seedTransaction.accountId
      dateKeyVal.value = dateKey(props.seedTransaction.date)
    } else {
      merchant.value = ''
      accountId.value = accounts.active[0]?.id ?? ''
      dateKeyVal.value = dateKey(Date.now())
    }
    stagedIds.value = props.seedTransaction ? new Set([props.seedTransaction.id]) : new Set()
    removedIds.value = new Set()
    showAccountPicker.value = false
    showDatePicker.value = false
    showOperationPicker.value = false
    editingItem.value = null
    editingDraft.value = null
    if (props.scanFile) void runScan(props.scanFile)
  },
)

const noAccounts = computed(() => accounts.active.length === 0)
function goCreateAccount() {
  emit('close')
  router.push('/accounts')
}

// ---------- Склад операцій: уніфіковане представлення ----------
// Кожен пункт — або вже реальна Transaction (kept з БД, чи staged: щойно
// підв'язана насіннєва/пікером обрана), або ще чернетковий скан-пункт, який
// стане реальною лише разом з рештою складу по save(). Один тип для обох
// дозволяє єдиний рендер рядка, редагування й прибирання нижче — саме це й
// об'єднує колишні окремі "Редагувати чек" (ReceiptEditModal) і "Фото чека"
// (ReceiptScanReviewModal) в одну форму.
type ReceiptItem = { kind: 'tx'; tx: Transaction } | { kind: 'draft'; draft: Draft }

const items = computed<ReceiptItem[]>(() => {
  const rid = props.receiptId
  const kept = rid ? transactions.all.filter((t) => t.receiptId === rid && !removedIds.value.has(t.id)) : []
  const added = transactions.all.filter((t) => stagedIds.value.has(t.id) && t.type !== 'transfer')
  const real: ReceiptItem[] = [...kept, ...added].map((tx) => ({ kind: 'tx', tx }))
  const drafts: ReceiptItem[] = scanDrafts.value.map((draft) => ({ kind: 'draft', draft }))
  return [...real, ...drafts]
})

const hasUncategorizedDraft = computed(() => scanDrafts.value.some((d) => !d.categoryId))

// Real (already-existing) item ids — used to exclude them from the "add an
// existing operation" picker's candidate list below.
const realItemIds = computed(() => items.value.flatMap((i) => (i.kind === 'tx' ? [i.tx.id] : [])))

const selectedAccount = computed(() => accounts.active.find((a) => a.id === accountId.value))

function itemType(item: ReceiptItem): 'expense' | 'income' {
  return item.kind === 'tx' ? (item.tx.type as 'expense' | 'income') : item.draft.type
}
function itemAmount(item: ReceiptItem): number {
  return item.kind === 'tx' ? item.tx.amount : item.draft.amount
}
// Реальна операція завжди вже має власну валюту; чернетковий пункт її ще не
// має (ScannedOperation), тож показуємо ту, у якій він фактично збережеться —
// обраного рахунку, а поки рахунок не обрано — розпізнану з фото.
function itemCurrency(item: ReceiptItem): string {
  return item.kind === 'tx' ? item.tx.currency : selectedAccount.value?.currency ?? detectedCurrency.value ?? settings.baseCurrency
}
function itemKey(item: ReceiptItem): string {
  return item.kind === 'tx' ? item.tx.id : item.draft.tempId
}
function itemNote(item: ReceiptItem): string | null {
  return item.kind === 'tx' ? item.tx.note ?? null : item.draft.note
}
function categoryFor(item: ReceiptItem) {
  const subId = item.kind === 'tx' ? item.tx.subcategoryId : item.draft.subcategoryId
  const catId = item.kind === 'tx' ? item.tx.categoryId : item.draft.categoryId
  return { sub: categories.byId(subId ?? undefined), cat: categories.byId(catId ?? undefined) }
}
function itemIcon(item: ReceiptItem): string {
  const { sub, cat } = categoryFor(item)
  return sub?.icon ?? cat?.icon ?? 'mdiHelpCircleOutline'
}
function itemColor(item: ReceiptItem): string {
  const { sub, cat } = categoryFor(item)
  return sub?.color ?? cat?.color ?? '#9a9a9e'
}
function itemTitle(item: ReceiptItem): string {
  const { sub, cat } = categoryFor(item)
  return cat ? (sub ? `${cat.name} (${sub.name})` : cat.name) : t('transactions.form.chooseCategory')
}

// Net of the chek's operations, signed (expense negative/income positive) —
// all of them share one account by invariant, so one currency is enough.
const itemsTotal = computed(() => items.value.reduce((sum, item) => sum + (itemType(item) === 'income' ? itemAmount(item) : -itemAmount(item)), 0))
const itemsCurrency = computed(
  () => selectedAccount.value?.currency ?? detectedCurrency.value ?? items.value.find((i) => i.kind === 'tx')?.tx.currency ?? settings.baseCurrency,
)
// The chek's own account's Settings → "Формат валюти" override, if any — see
// itemsCurrency above for why one account/currency covers every item here.
const itemsCurrencyDisplay = computed(() => selectedAccount.value?.currencyDisplay)

// Розпізнана на чеку валюта — лише інформативна: сума завжди зберігається у
// валюті обраного рахунку (як і в ручній формі), тут просто попереджаємо,
// якщо вони явно різні.
const currencyMismatch = computed(
  () => !!detectedCurrency.value && !!selectedAccount.value && detectedCurrency.value !== selectedAccount.value.currency,
)

// Same currency as whatever's currently picked — changing currency would mean
// recomputing the operations' own amounts, not just their account link, which
// is out of scope here (see the file doc comment above).
const accountPickerItems = computed<AccountPickerItem[]>(() => {
  const list = accounts.active.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    color: a.color,
    currency: a.currency,
    currencyDisplay: a.currencyDisplay,
    balance: accounts.balanceOf(a),
    group: accountGroupLabel(a),
  }))
  const cur = selectedAccount.value?.currency
  return cur ? list.filter((i) => i.currency === cur) : list
})

const canSave = computed(
  () =>
    !!accountId.value &&
    !!dateKeyVal.value &&
    !saving.value &&
    !hasUncategorizedDraft.value &&
    (!!props.receiptId || items.value.length > 0),
)

async function save() {
  if (!canSave.value) return
  const account = accounts.active.find((a) => a.id === accountId.value)
  if (!account) return
  saving.value = true
  try {
    const when = new Date(dateKeyVal.value).getTime()

    let rid = props.receiptId
    if (rid) {
      await receipts.update(rid, { merchant: merchant.value.trim() || null, accountId: account.id, date: when })
    } else {
      const created = await receipts.add({
        merchant: merchant.value.trim() || null,
        date: when,
        currency: account.currency,
        accountId: account.id,
      })
      rid = created.id
    }

    for (const item of items.value) {
      if (item.kind !== 'tx') continue
      const t = item.tx
      await transactions.update(t.id, {
        receiptId: rid,
        accountId: account.id,
        currency: account.currency,
        date: when,
      })
    }

    // Чернеткові скан-пункти без категорії блокують canSave (див. вище) — тут
    // лишаються тільки ті, що вже мають categoryId і можуть народитись як
    // справжні операції разом з рештою складу.
    for (const draft of scanDrafts.value) {
      if (!draft.categoryId) continue
      await transactions.add({
        type: draft.type,
        date: when,
        accountId: account.id,
        categoryId: draft.categoryId,
        subcategoryId: draft.subcategoryId,
        amount: draft.amount,
        currency: account.currency,
        note: draft.note ?? undefined,
        receiptId: rid,
      })
    }
    // Прибирання застосовується лише тут, по "Зберегти" — не одразу по кліку
    // на "Прибрати з чека" (див. removeItem()).
    for (const id of removedIds.value) {
      await transactions.update(id, { receiptId: null })
    }
    emit('close')
  } finally {
    saving.value = false
  }
}

// ---------- Склад операцій: додавання/прибирання (лише чернетка — див. save()) ----------

function openOperationPicker() {
  if (!accountId.value || !dateKeyVal.value) return
  showOperationPicker.value = true
}

function onOperationsPicked(ids: string[]) {
  // Уже прив'язана до цього ж чека в БД (позначена на видалення, а користувач
  // передумав і обрав її знову в пікері) — досить зняти позначку, а не
  // додатково стейджити: інакше items() показав би її двічі (і в "kept", і в
  // "added").
  const rid = props.receiptId
  const dbLinkedIds = new Set(rid ? transactions.all.filter((t) => t.receiptId === rid).map((t) => t.id) : [])
  const nextStaged = new Set(stagedIds.value)
  const nextRemoved = new Set(removedIds.value)
  for (const id of ids) {
    if (dbLinkedIds.has(id)) nextRemoved.delete(id)
    else nextStaged.add(id)
  }
  stagedIds.value = nextStaged
  removedIds.value = nextRemoved
}

function removeItem(item: ReceiptItem) {
  if (item.kind === 'draft') {
    scanDrafts.value = scanDrafts.value.filter((d) => d.tempId !== item.draft.tempId)
    return
  }
  const t = item.tx
  if (stagedIds.value.has(t.id)) {
    // Ще ніде не збережена (щойно додана пікером цього сеансу, чи "насіннєва"
    // операція нового чека) — просто прибираємо з чернетки.
    const next = new Set(stagedIds.value)
    next.delete(t.id)
    stagedIds.value = next
  } else {
    // Реально прив'язана в БД — лише позначаємо на видалення, застосовується в save().
    const next = new Set(removedIds.value)
    next.add(t.id)
    removedIds.value = next
  }
}

const editingItem = ref<Transaction | null>(null)
const editingDraft = ref<Draft | null>(null)

function editItem(item: ReceiptItem) {
  if (item.kind === 'draft') editingDraft.value = item.draft
  else editingItem.value = item.tx
}
function closeEditItem() {
  editingItem.value = null
  editingDraft.value = null
}
// Нижня вкладена форма для чернеткового пункту ніколи нічого не пише в БД
// (`defer-save`, див. TransactionFormModal.vue) — по її "Зберегти" сюди
// прилітають лише введені поля, якими й патчимо сам драфт на місці. Пункт
// лишається чернеткою (просто вже заповненою) аж до "Зберегти" самого чека.
function onDraftEdited(fields: { type: 'expense' | 'income'; note: string | null; amount: number; categoryId: string; subcategoryId: string | null }) {
  const tempId = editingDraft.value?.tempId
  if (!tempId) return
  scanDrafts.value = scanDrafts.value.map((d) => (d.tempId === tempId ? { ...d, ...fields } : d))
  editingDraft.value = null
}

// The nested TransactionFormModal below shows "Delete" unconditionally
// whenever it's editing something (see its own isEdit-gated footer-actions) —
// wire it to the same confirm-then-remove flow App.vue uses for the global
// instance, via the shared popups store, instead of leaving it inert.
function requestDeleteItem(tx: Transaction) {
  popups.confirmDialog({
    title: t('common.deleteTransactionTitle'),
    message: t('common.deleteTransactionMessage'),
    confirmLabel: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      await transactions.remove(tx.id)
      popups.closeConfirm()
      closeEditItem()
    },
  })
}
</script>

<template>
  <Modal
    :open="open"
    :title="phase === 'loading' || phase === 'error' ? t('receipts.scanTitle') : merchant.trim() || t('receipts.editTitle')"
    wide
    top
    @close="emit('close')"
  >
    <div v-if="noAccounts" class="state-block">
      <MdiIcon name="mdiWalletOutline" :size="40" color="var(--text-muted)" />
      <p>{{ t('receipts.noAccountsHint') }}</p>
      <button class="btn btn-primary" @click="goCreateAccount">{{ t('transactions.form.createAccount') }}</button>
    </div>

    <div v-else-if="phase === 'loading'" class="state-block">
      <span class="spinner" />
      <p>{{ t('receipts.scanning') }}</p>
    </div>

    <div v-else-if="phase === 'error'" class="state-block">
      <MdiIcon name="mdiAlertCircleOutline" :size="40" color="var(--expense)" />
      <p>{{ errorMessage }}</p>
      <button class="btn btn-primary" @click="retryScan">{{ t('receipts.retry') }}</button>
    </div>

    <template v-else>
      <FieldRow icon="mdiStorefrontOutline" :label="t('receipts.merchantLabel')">
        <input v-model="merchant" type="text" class="field-row-value" :placeholder="t('receipts.merchantPlaceholder')" />
      </FieldRow>

      <FieldRow
        tag="button"
        :icon="selectedAccount?.icon ?? 'mdiWalletOutline'"
        :icon-color="selectedAccount?.color"
        :label="t('receipts.payingAccount')"
        @click="showAccountPicker = true"
      >
        <span class="field-row-value">{{ selectedAccount?.name ?? t('transactions.form.chooseAccount') }}</span>
        <template #trailing>
          <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
        </template>
      </FieldRow>
      <p v-if="selectedAccount" class="hint">{{ t('receipts.accountCurrencyHint', { currency: selectedAccount.currency }) }}</p>

      <FieldRow tag="button" icon="mdiCalendarBlankOutline" :label="t('receipts.dateLabel')" @click="showDatePicker = true">
        <span class="field-row-value">{{ fullDateLabel(new Date(dateKeyVal)) }}</span>
        <template #trailing>
          <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
        </template>
      </FieldRow>

      <p class="hint">{{ t('receipts.accountDateHint') }}</p>
      <p v-if="currencyMismatch" class="hint mismatch-hint">
        {{ t('receipts.currencyMismatchHint', { detected: detectedCurrency ?? '', account: selectedAccount?.currency ?? '' }) }}
      </p>

      <button type="button" class="add-op-row" :disabled="!accountId || !dateKeyVal" @click="openOperationPicker">
        <MdiIcon name="mdiPlus" :size="18" />
        {{ t('receipts.addOperation') }}
      </button>

      <div class="items-header">
        <span class="items-label">{{ t('receipts.operationsCount', { count: items.length }) }}</span>
        <span v-if="items.length" class="items-total" :class="{ negative: itemsTotal < 0 }">
          {{ formatMoney(itemsTotal, itemsCurrency, { signed: true, currencyDisplay: itemsCurrencyDisplay }) }}
        </span>
      </div>

      <p v-if="!items.length" class="empty-items">{{ t('receipts.noOperations') }}</p>

      <div v-else class="items-list">
        <button v-for="item in items" :key="itemKey(item)" type="button" class="item-row" @click="editItem(item)">
          <IconCircle :icon="itemIcon(item)" :color="itemColor(item)" :size="36" />
          <span class="item-text">
            <span class="item-title">{{ itemTitle(item) }}</span>
            <span v-if="itemNote(item)" class="item-note">{{ itemNote(item) }}</span>
            <span v-if="item.kind === 'draft' && !item.draft.categoryId" class="item-warning">
              {{ t('receipts.categoryPickFailed') }}
            </span>
          </span>
          <span class="item-amount" :class="itemType(item)">
            {{ itemType(item) === 'income' ? '+' : '-' }}{{ formatMoney(itemAmount(item), itemCurrency(item), { currencyDisplay: itemsCurrencyDisplay }) }}
          </span>
          <button
            type="button"
            class="item-remove-btn"
            :aria-label="item.kind === 'draft' ? t('receipts.discard') : t('receipts.removeFromReceipt')"
            :title="item.kind === 'draft' ? t('receipts.discard') : t('receipts.removeFromReceipt')"
            @click.stop="removeItem(item)"
          >
            <MdiIcon :name="item.kind === 'draft' ? 'mdiClose' : 'mdiLinkOff'" :size="15" color="var(--text-muted)" />
          </button>
        </button>
      </div>

      <p v-if="hasUncategorizedDraft" class="hint uncategorized-hint">{{ t('receipts.uncategorizedHint') }}</p>

      <button type="button" class="btn btn-primary save-btn" :disabled="!canSave" @click="save">{{ t('common.save') }}</button>
    </template>
  </Modal>

  <AccountPickerModal
    :open="showAccountPicker"
    :title="t('receipts.payingAccount')"
    :items="accountPickerItems"
    :selected-id="accountId"
    @close="showAccountPicker = false"
    @select="(id) => (accountId = id)"
  />

  <OperationDateModal
    :open="showDatePicker"
    :date="dateKeyVal"
    :show-recurring="false"
    :recurring="false"
    @close="showDatePicker = false"
    @update:date="(v) => (dateKeyVal = v)"
  />

  <ReceiptOperationPickerModal
    :open="showOperationPicker"
    :account-id="accountId"
    :date-key-val="dateKeyVal"
    :exclude-ids="realItemIds"
    @close="showOperationPicker = false"
    @confirm="onOperationsPicked"
  />

  <!-- Вкладено локально (не через popups store), так само top (z-index 200)
       як і сам ReceiptEditModal — вкладеність гарантує, що кожен з них
       телепортується в <body> ПІСЛЯ (тобто поверх) цього попапу. -->
  <TransactionFormModal
    :open="editingItem !== null"
    :transaction="editingItem"
    disable-add-to-receipt
    @close="closeEditItem"
    @saved="closeEditItem"
    @duplicated="closeEditItem"
    @deleted="editingItem && requestDeleteItem(editingItem)"
  />

  <TransactionFormModal
    :open="editingDraft !== null"
    :preset-account-id="accountId"
    :preset-category-id="editingDraft?.subcategoryId ?? editingDraft?.categoryId ?? undefined"
    :preset-amount="editingDraft?.amount"
    :preset-note="editingDraft?.note ?? undefined"
    :preset-type="editingDraft?.type"
    :preset-date="new Date(dateKeyVal).getTime()"
    :preset-receipt-id="receiptId"
    defer-save
    @close="closeEditItem"
    @draft-saved="onDraftEdited"
  />
</template>

<style lang="scss" scoped>
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 32px 8px 16px;
  text-align: center;
}

.state-block p {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

.spinner {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid var(--surface-2);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.hint {
  font-size: 11.5px;
  color: var(--text-muted);
  margin: 4px 2px 10px;
}

.mismatch-hint {
  color: var(--expense);
}

.uncategorized-hint {
  color: var(--expense);
  margin-top: -4px;
}

.items-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 2px 8px;
}

.items-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.items-total {
  font-size: 13px;
  font-weight: 700;
  color: var(--income);
}

.items-total.negative {
  color: var(--expense);
}

.add-op-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  border: 1px dashed var(--accent);
  border-radius: var(--radius-md);
  background: none;
  color: var(--accent);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  padding: 12px;
  margin-bottom: 14px;
}

.add-op-row:disabled {
  opacity: 0.4;
  cursor: default;
}

.empty-items {
  font-size: 12.5px;
  color: var(--text-muted);
  text-align: center;
  padding: 10px 4px;
  margin: 0 0 10px;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: var(--surface-2);
  border: none;
  border-radius: var(--radius-sm, 8px);
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
}

.item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.item-title {
  font-size: 13.5px;
  font-weight: 600;
  @include lineClamp(1);
}

.item-note {
  font-size: 11.5px;
  color: var(--text-muted);
  font-style: italic;
}

.item-warning {
  font-size: 11px;
  color: var(--expense);
}

.item-amount {
  font-size: 13.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.item-amount.expense {
  color: var(--expense);
}
.item-amount.income {
  color: var(--income);
}

.item-remove-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.save-btn {
  width: 100%;
  margin-top: 6px;
}
</style>
