<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import MdiIcon from '../common/MdiIcon.vue'
import AccountPickerModal from './AccountPickerModal.vue'
import OperationDateModal from './OperationDateModal.vue'
import TransactionFormModal from './TransactionFormModal.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useCategoriesStore } from '../../stores/categories'
import { useTransactionsStore } from '../../stores/transactions'
import type { NewTransactionInput } from '../../stores/transactions'
import { useSettingsStore } from '../../stores/settings'
import { convertAmount } from '../../db/exchangeRates'
import { compressImageToBase64 } from '../../utils/imageCompress'
import { scanReceipt, type ScannedOperation } from '../../api/receipts'
import { dateKey, formatMoney, fullDateLabel } from '../../utils/format'
import { newId } from '../../utils/id'
import type { AccountPickerItem } from '../../types/pickerItems'

/**
 * "Сфотографувати чек" -> Gemini (POST /api/receipts/scan) розбиває його на
 * операції, звірені з реальними категоріями -> тут користувач по кожній сам
 * вирішує: зберегти як є, відредагувати (звичайна форма операції, просто
 * заздалегідь заповнена) чи відкинути. Саме збереження завжди йде через
 * transactions.add() — той самий offline-first шлях, що й ручне створення —
 * бекенд на цьому кроці вже нічого не пише в БД.
 */
const props = defineProps<{ open: boolean; file: File | null }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const accounts = useAccountsStore()
const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const settings = useSettingsStore()

type Phase = 'loading' | 'review' | 'error'
const phase = ref<Phase>('loading')
const errorMessage = ref('')

const merchant = ref<string | null>(null)
// Дата чека — Gemini іноді помиляється при розпізнаванні (наприклад, плутає
// цифру в році на нечіткому фото), тому завжди показуємо її користувачу й
// даємо виправити одним тапом, а не довіряємо їй мовчки. Зберігаємо як
// "yyyy-mm-dd", як і form.date у TransactionFormModal/OperationDateModal;
// коли Gemini дату не розпізнала (або бекенд відкинув як неправдоподібну) —
// підставляємо сьогодні.
const receiptDateKey = ref<string>(dateKey(Date.now()))
const receiptDate = computed(() => new Date(receiptDateKey.value).getTime())
const showDatePicker = ref(false)
const detectedCurrency = ref<string | null>(null)

interface Draft extends ScannedOperation {
  tempId: string
}
const drafts = ref<Draft[]>([])
const savingIds = ref<Set<string>>(new Set())

const noAccounts = computed(() => accounts.active.length === 0)

const paidAccountId = ref('')
const paidAccount = computed(() => accounts.active.find((a) => a.id === paidAccountId.value))
const showAccountPicker = ref(false)
const accountPickerItems = computed<AccountPickerItem[]>(() =>
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

// Розпізнана на чеку валюта — лише інформативна: сума завжди зберігається у
// валюті обраного рахунку (як і в ручній формі, currency = sourceAccount.currency),
// тут просто попереджаємо, якщо вони явно різні.
const currencyMismatch = computed(
  () => !!detectedCurrency.value && !!paidAccount.value && detectedCurrency.value !== paidAccount.value.currency,
)

async function runScan(file: File) {
  phase.value = 'loading'
  errorMessage.value = ''
  try {
    const { base64, mimeType } = await compressImageToBase64(file)
    const result = await scanReceipt(base64, mimeType)
    merchant.value = result.merchant
    receiptDateKey.value = dateKey(result.date ?? Date.now())
    detectedCurrency.value = result.currency
    drafts.value = result.operations.map((op) => ({ ...op, tempId: newId() }))
    phase.value = 'review'
  } catch (error) {
    console.error('[receipt-scan] failed', error)
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    errorMessage.value = message || 'Не вдалося розпізнати чек. Спробуйте інше фото.'
    phase.value = 'error'
  }
}

watch(
  () => props.file,
  (file) => {
    if (!file) return
    if (!paidAccountId.value) paidAccountId.value = accounts.active[0]?.id ?? ''
    void runScan(file)
  },
  { immediate: true },
)

function retry() {
  if (props.file) void runScan(props.file)
}

function categoryOf(draft: Draft) {
  return categories.byId(draft.subcategoryId ?? draft.categoryId ?? undefined)
}
function cardIcon(draft: Draft): string {
  return categoryOf(draft)?.icon ?? 'mdiHelpCircleOutline'
}
function cardColor(draft: Draft): string {
  return categoryOf(draft)?.color ?? '#9a9a9e'
}
function cardTitle(draft: Draft): string {
  const cat = categories.byId(draft.categoryId ?? undefined)
  const sub = categories.byId(draft.subcategoryId ?? undefined)
  return cat ? (sub ? `${cat.name} (${sub.name})` : cat.name) : 'Оберіть категорію'
}

async function buildPayload(draft: Draft): Promise<NewTransactionInput> {
  const account = paidAccount.value
  if (!account) throw new Error('Оберіть рахунок оплати')
  if (!draft.categoryId) throw new Error('Оберіть категорію')
  const when = receiptDate.value
  // Той самий розрахунок курсу/базової суми, що й TransactionFormModal.submit()
  // (тут спрощено — операція з чека завжди expense/income, ніколи не transfer).
  const rate = account.currency === settings.baseCurrency ? 1 : await convertAmount(1, account.currency, settings.baseCurrency, when)
  const baseAmount = draft.type === 'income' ? draft.amount * rate : -draft.amount * rate
  return {
    type: draft.type,
    date: when,
    accountId: account.id,
    categoryId: draft.categoryId,
    subcategoryId: draft.subcategoryId,
    amount: draft.amount,
    currency: account.currency,
    exchangeRate: rate,
    baseAmount,
    note: draft.note ?? undefined,
  }
}

function removeDraft(tempId: string) {
  drafts.value = drafts.value.filter((d) => d.tempId !== tempId)
  if (!drafts.value.length) emit('close')
}

async function quickSave(draft: Draft) {
  if (!draft.categoryId || savingIds.value.has(draft.tempId)) return
  savingIds.value.add(draft.tempId)
  try {
    const payload = await buildPayload(draft)
    await transactions.add(payload)
    removeDraft(draft.tempId)
  } catch (error) {
    console.error('[receipt-scan] save failed', error)
  } finally {
    savingIds.value.delete(draft.tempId)
  }
}

async function saveAll() {
  for (const draft of [...drafts.value]) {
    if (draft.categoryId) await quickSave(draft)
  }
}

const savableCount = computed(() => drafts.value.filter((d) => d.categoryId).length)

const editingDraft = ref<Draft | null>(null)
function editDraft(draft: Draft) {
  editingDraft.value = draft
}
function onEditClosed() {
  editingDraft.value = null
}
function onEditSaved() {
  if (editingDraft.value) removeDraft(editingDraft.value.tempId)
  editingDraft.value = null
}

function goCreateAccount() {
  emit('close')
  router.push('/accounts')
}
</script>

<template>
  <Modal
    :open="open"
    :title="phase === 'review' ? (merchant || 'Розпізнано з чека') : 'Скан чека'"
    wide
    top
    @close="emit('close')"
  >
    <div v-if="noAccounts" class="state-block">
      <MdiIcon name="mdiWalletOutline" :size="40" color="var(--text-muted)" />
      <p>Щоб зберегти операції з чека, спершу потрібен хоча б один рахунок.</p>
      <button class="btn btn-primary" @click="goCreateAccount">Створити рахунок</button>
    </div>

    <div v-else-if="phase === 'loading'" class="state-block">
      <span class="spinner" />
      <p>Розпізнаємо чек…</p>
    </div>

    <div v-else-if="phase === 'error'" class="state-block">
      <MdiIcon name="mdiAlertCircleOutline" :size="40" color="var(--expense)" />
      <p>{{ errorMessage }}</p>
      <button class="btn btn-primary" @click="retry">Спробувати ще</button>
    </div>

    <template v-else>
      <button type="button" class="account-row" @click="showAccountPicker = true">
        <span class="account-icon-bubble">
          <MdiIcon :name="paidAccount?.icon ?? 'mdiWalletOutline'" :size="18" :color="paidAccount?.color" />
        </span>
        <span class="account-text">
          <span class="account-label">Рахунок оплати</span>
          <span class="account-value">{{ paidAccount?.name ?? 'Оберіть рахунок' }}</span>
        </span>
        <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
      </button>
      <button type="button" class="account-row" @click="showDatePicker = true">
        <span class="account-icon-bubble">
          <MdiIcon name="mdiCalendarBlankOutline" :size="18" color="var(--text-secondary)" />
        </span>
        <span class="account-text">
          <span class="account-label">Дата чека</span>
          <span class="account-value">{{ fullDateLabel(new Date(receiptDate)) }}</span>
        </span>
        <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
      </button>
      <p v-if="currencyMismatch" class="hint mismatch-hint">
        На чеку схоже валюта {{ detectedCurrency }}, а рахунок у {{ paidAccount?.currency }} — суму збережено як є, без конвертації.
      </p>

      <div v-if="!drafts.length" class="state-block">
        <MdiIcon name="mdiCheckCircleOutline" :size="40" color="var(--income)" />
        <p>Усі операції з цього чека оброблено.</p>
      </div>

      <div v-else class="draft-list">
        <div v-for="d in drafts" :key="d.tempId" class="draft-card">
          <IconCircle :icon="cardIcon(d)" :color="cardColor(d)" :size="42" />
          <div class="draft-text">
            <span class="draft-title">{{ cardTitle(d) }}</span>
            <span v-if="d.note" class="draft-note">{{ d.note }}</span>
            <span v-if="!d.categoryId" class="draft-warning">Не вдалось підібрати категорію — відредагуйте вручну</span>
          </div>
          <span class="draft-amount" :class="d.type">
            {{ d.type === 'income' ? '+' : '-' }}{{ formatMoney(d.amount, paidAccount?.currency ?? detectedCurrency ?? '') }}
          </span>
          <div class="draft-actions">
            <button
              type="button"
              class="icon-action save"
              :disabled="!d.categoryId || savingIds.has(d.tempId)"
              aria-label="Зберегти"
              @click="quickSave(d)"
            >
              <MdiIcon name="mdiCheck" :size="18" />
            </button>
            <button type="button" class="icon-action" aria-label="Редагувати" @click="editDraft(d)">
              <MdiIcon name="mdiPencilOutline" :size="17" />
            </button>
            <button type="button" class="icon-action danger" aria-label="Відкинути" @click="removeDraft(d.tempId)">
              <MdiIcon name="mdiClose" :size="18" />
            </button>
          </div>
        </div>
      </div>

      <button v-if="savableCount > 1" type="button" class="btn btn-primary save-all-btn" @click="saveAll">
        Зберегти всі ({{ savableCount }})
      </button>
    </template>
  </Modal>

  <AccountPickerModal
    :open="showAccountPicker"
    title="Рахунок оплати"
    :items="accountPickerItems"
    :selected-id="paidAccountId"
    @close="showAccountPicker = false"
    @select="(id) => (paidAccountId = id)"
  />

  <OperationDateModal
    :open="showDatePicker"
    :date="receiptDateKey"
    :show-recurring="false"
    :recurring="false"
    @close="showDatePicker = false"
    @update:date="(v) => (receiptDateKey = v)"
  />

  <TransactionFormModal
    :open="editingDraft !== null"
    :preset-account-id="paidAccountId"
    :preset-category-id="editingDraft?.subcategoryId ?? editingDraft?.categoryId ?? undefined"
    :preset-amount="editingDraft?.amount"
    :preset-note="editingDraft?.note ?? undefined"
    :preset-type="editingDraft?.type"
    :preset-date="receiptDate"
    @close="onEditClosed"
    @saved="onEditSaved"
  />
</template>

<style scoped>
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

.account-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  cursor: pointer;
  margin-bottom: 6px;
  text-align: left;
}

.account-icon-bubble {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.account-label {
  font-size: 11px;
  color: var(--text-muted);
}

.account-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint {
  font-size: 11.5px;
  color: var(--text-muted);
}

.mismatch-hint {
  margin: 4px 2px 10px;
  color: var(--expense);
}

.draft-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.draft-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: 10px;
}

.draft-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.draft-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-note {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-warning {
  font-size: 11px;
  color: var(--expense);
}

.draft-amount {
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
  white-space: nowrap;
}

.draft-amount.expense {
  color: var(--expense);
}

.draft-amount.income {
  color: var(--income);
}

.draft-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-action {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: var(--surface);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-action:disabled {
  opacity: 0.35;
  cursor: default;
}

.icon-action.save {
  color: var(--income);
}

.icon-action.danger {
  color: var(--expense);
}

.save-all-btn {
  width: 100%;
  margin-top: 14px;
}
</style>
