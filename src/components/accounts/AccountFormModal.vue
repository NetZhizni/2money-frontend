<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import IconColorPickerModal from '../common/IconColorPickerModal.vue'
import CurrencyPickerModal from '../layout/CurrencyPickerModal.vue'
import AmountEntryModal from '../common/AmountEntryModal.vue'
import OptionListModal, { type ListOption } from '../common/OptionListModal.vue'
import Segmented from '../common/Segmented.vue'
import AccountPickerModal from '../transactions/AccountPickerModal.vue'
import OperationDateModal from '../transactions/OperationDateModal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import FieldRow from '../common/FieldRow.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useSettingsStore } from '../../stores/settings'
import { usePopupsStore } from '../../stores/popups'
import { ACCOUNT_TYPE_OPTIONS, ACCOUNT_TYPE_DEFAULTS } from '../../utils/accountTypes'
import { accountGroupLabel } from '../../utils/accountLabel'
import { dateFromKey, dateKey, endOfDay, formatMoney, formatMoneyAs, fullDateLabel, getNumberFormatSetting, type CurrencyDisplayStyle } from '../../utils/format'
import { t } from '../../i18n'
import type { Account, AccountType } from '../../types/models'
import type { AccountPickerItem } from '../../types/pickerItems'

// The picker's own "use the base Settings choice" option — kept out of
// Account.currencyDisplay's real value space (that field just stays
// unset/null for it, see types/models.ts) and mapped to/from it only here,
// where the form needs a single concrete selection to highlight.
type CurrencyDisplayFormValue = CurrencyDisplayStyle | 'base'

const props = defineProps<{ open: boolean; account?: Account | null; defaultType?: AccountType }>()
const emit = defineEmits<{ close: []; save: [Partial<Account>]; deleted: []; archived: [] }>()

const accounts = useAccountsStore()
const settings = useSettingsStore()
const popups = usePopupsStore()

const isEdit = computed(() => !!props.account)

// Rebuilt fresh on every open (not just once at setup) since this component
// stays permanently mounted — see the `open` watch below.
function buildForm() {
  const initialType = props.account?.type ?? props.defaultType ?? ('regular' as AccountType)
  return {
    name: props.account?.name ?? '',
    type: initialType,
    currency: props.account?.currency ?? settings.baseCurrency,
    currencyDisplay: (props.account?.currencyDisplay ?? 'base') as CurrencyDisplayFormValue,
    initialBalance: props.account?.initialBalance ?? 0,
    includeInTotal: props.account?.includeInTotal ?? true,
    icon: props.account?.icon ?? ACCOUNT_TYPE_DEFAULTS[initialType].icon,
    color: props.account?.color ?? ACCOUNT_TYPE_DEFAULTS[initialType].color,
    note: props.account?.note ?? '',
    goalAmount: props.account?.goalAmount ?? null,
    goalDate: props.account?.goalDate != null ? dateKey(props.account.goalDate) : '',
    creditLimit: props.account?.creditLimit ?? null,
  }
}

const form = reactive(buildForm())
const showIconColorPicker = ref(false)
const showCurrencyPicker = ref(false)
const showCurrencyDisplayPicker = ref(false)
const showBalanceEntry = ref(false)
const showCreditLimitEntry = ref(false)
const showGoalEntry = ref(false)
const showGoalDatePicker = ref(false)
const showMergePicker = ref(false)
// Once an account has operations against it, its currency can't change (see
// stores/accounts.ts's hasTransactions and the server-side twin in
// upsertAccount.js, which is what actually enforces this) — this is just the
// form's own preview of that, so a doomed edit is never attempted.
const currencyLocked = ref(false)

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    Object.assign(form, buildForm())
    showIconColorPicker.value = false
    showCurrencyPicker.value = false
    showCurrencyDisplayPicker.value = false
    showBalanceEntry.value = false
    showCreditLimitEntry.value = false
    showGoalEntry.value = false
    showGoalDatePicker.value = false
    showMergePicker.value = false
    mergeError.value = ''
    currencyLocked.value = props.account ? await accounts.hasTransactions(props.account.id) : false
  },
)

// Same currency only — merging across currencies would silently corrupt
// balance math (see stores/accounts.ts's merge()).
const mergeCandidates = computed<AccountPickerItem[]>(() =>
  accounts.active
    .filter((a) => a.id !== props.account?.id && a.currency === props.account?.currency)
    .map((a) => ({
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
const mergeError = ref('')

async function handleMergeSelect(targetId: string) {
  const source = props.account
  if (!source) return
  const target = mergeCandidates.value.find((a) => a.id === targetId)
  popups.confirmDialog({
    title: t('accounts.form.mergeConfirmTitle'),
    message: t('accounts.form.mergeConfirmMessage', { source: source.name, target: target?.name ?? '' }),
    confirmLabel: t('accounts.form.mergeConfirmButton'),
    danger: true,
    onConfirm: async () => {
      try {
        await accounts.merge(source.id, targetId)
        popups.closeConfirm()
        emit('close')
      } catch (err) {
        mergeError.value = t('accounts.form.mergeError', { message: (err as Error).message })
        popups.closeConfirm()
      }
    },
  })
}

// Only an account with no operations at all can be deleted (see
// stores/accounts.ts's remove()) — for one that has any, this offers what
// can be done instead: archive it (unless it already is) or merge it into
// another account (when there's one in the same currency). Checked again
// here rather than trusting `currencyLocked`, which is only as fresh as
// this form's opening.
async function requestDelete() {
  const account = props.account
  if (!account) return
  if (!(await accounts.hasTransactions(account.id))) {
    emit('deleted')
    return
  }
  const actions = []
  if (!account.archived) actions.push({ label: t('accounts.form.archive'), run: () => emit('archived') })
  if (mergeCandidates.value.length) actions.push({ label: t('accounts.form.mergePickerTitle'), run: () => (showMergePicker.value = true) })
  popups.choiceDialog({
    title: t('accounts.form.inUseTitle'),
    message: t('accounts.form.inUseMessage', { name: account.name }),
    actions,
  })
}

// Previewed at the current amount-agnostic base setting (formatMoney's own
// default) rather than a fixed style, so this option's sublabel always shows
// exactly what "base" currently resolves to — same live-preview idea as
// SettingsModal.vue's own currency-display picker.
const CURRENCY_DISPLAY_PREVIEW_AMOUNT = 1234.56
const currencyDisplayOptions = computed<ListOption[]>(() => [
  { value: 'base', label: t('accounts.form.currencyDisplayBase'), sublabel: formatMoney(CURRENCY_DISPLAY_PREVIEW_AMOUNT, form.currency) },
  {
    value: 'narrowSymbol',
    label: t('layout.settings.currencyDisplayNarrowSymbol'),
    sublabel: formatMoneyAs(CURRENCY_DISPLAY_PREVIEW_AMOUNT, form.currency, getNumberFormatSetting(), { currencyDisplay: 'narrowSymbol' }),
  },
  {
    value: 'symbol',
    label: t('layout.settings.currencyDisplaySymbol'),
    sublabel: formatMoneyAs(CURRENCY_DISPLAY_PREVIEW_AMOUNT, form.currency, getNumberFormatSetting(), { currencyDisplay: 'symbol' }),
  },
  {
    value: 'code',
    label: t('layout.settings.currencyDisplayCode'),
    sublabel: formatMoneyAs(CURRENCY_DISPLAY_PREVIEW_AMOUNT, form.currency, getNumberFormatSetting(), { currencyDisplay: 'code' }),
  },
  {
    value: 'name',
    label: t('layout.settings.currencyDisplayName'),
    sublabel: formatMoneyAs(CURRENCY_DISPLAY_PREVIEW_AMOUNT, form.currency, getNumberFormatSetting(), { currencyDisplay: 'name' }),
  },
])
const currencyDisplayLabel = computed(
  () => currencyDisplayOptions.value.find((o) => o.value === form.currencyDisplay)?.label ?? '',
)
function chooseCurrencyDisplay(value: string) {
  form.currencyDisplay = value as CurrencyDisplayFormValue
}
// The form's live choice, resolved to what formatMoney/AmountKeypad actually
// expect (undefined instead of the picker's own 'base' sentinel) — fed into
// the initial-balance calculator below so it reflects the style being picked
// right above it, live, same as the balance preview in the FieldRow itself.
const resolvedCurrencyDisplay = computed(() => (form.currencyDisplay === 'base' ? undefined : form.currencyDisplay))

const accountTypeSegmentOptions = computed(() => ACCOUNT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })))

function selectType(type: AccountType) {
  form.type = type
  if (!isEdit.value) {
    form.icon = ACCOUNT_TYPE_DEFAULTS[type].icon
    form.color = ACCOUNT_TYPE_DEFAULTS[type].color
  }
}

const error = computed(() => (form.name.trim() ? '' : t('accounts.form.nameRequired')))

function clearGoal() {
  form.goalAmount = null
  form.goalDate = ''
}

// The goal date is stored as the END of the picked local day, so the goal
// only counts as overdue once that whole day is over (see utils/savingsGoal.ts).
function goalDateValue(key: string): number | null {
  return key ? endOfDay(dateFromKey(key).getTime()) : null
}

function submit() {
  if (error.value) return
  // Only a savings account carries a goal — switching the type away drops it.
  const hasGoal = form.type === 'savings' && !!form.goalAmount && form.goalAmount > 0
  // Likewise only a regular account carries a credit limit.
  const hasCreditLimit = form.type === 'regular' && !!form.creditLimit && form.creditLimit > 0
  emit('save', {
    name: form.name.trim(),
    type: form.type,
    currency: form.currency,
    currencyDisplay: form.currencyDisplay === 'base' ? null : form.currencyDisplay,
    initialBalance: Number(form.initialBalance) || 0,
    includeInTotal: form.includeInTotal,
    icon: form.icon,
    color: form.color,
    note: form.note.trim() || undefined,
    goalAmount: hasGoal ? form.goalAmount : null,
    goalDate: hasGoal ? goalDateValue(form.goalDate) : null,
    creditLimit: hasCreditLimit ? form.creditLimit : null,
  })
}
</script>

<template>
  <Modal :open="open" :title="isEdit ? t('accounts.form.editTitle') : t('accounts.form.newTitle')" @close="emit('close')">
    <button type="button" class="preview" :aria-label="t('accounts.form.editIconColor')" @click="showIconColorPicker = true">
      <span class="preview-inner">
        <IconCircle :icon="form.icon" :color="form.color" :size="72" square />
        <span class="preview-edit-badge">
          <MdiIcon name="mdiPencilOutline" :size="14" color="var(--surface)" />
        </span>
      </span>
    </button>

    <div class="field">
      <label>{{ t('accounts.form.typeLabel') }}</label>
      <Segmented
        :model-value="form.type"
        :options="accountTypeSegmentOptions"
        @update:model-value="(v) => selectType(v as AccountType)"
      />
    </div>

    <FieldRow icon="mdiFormTextbox" :label="t('accounts.form.nameLabel')">
      <input v-model="form.name" type="text" class="field-row-value" :placeholder="t('accounts.form.namePlaceholder')" />
    </FieldRow>
    <span v-if="error" class="field-error">{{ error }}</span>

    <FieldRow
      tag="button"
      icon="mdiCurrencyUsd"
      :label="t('accounts.form.currencyLabel')"
      :disabled="currencyLocked"
      @click="showCurrencyPicker = true"
    >
      <span class="field-row-value">{{ form.currency }}</span>
      <template #trailing>
        <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
      </template>
    </FieldRow>
    <span v-if="currencyLocked" class="field-error">{{ t('accounts.form.currencyLockedHint') }}</span>

    <FieldRow tag="button" icon="mdiWalletOutline" :label="t('accounts.form.initialBalanceLabel')" @click="showBalanceEntry = true">
      <span class="field-row-value">{{ formatMoney(form.initialBalance, form.currency, { currencyDisplay: resolvedCurrencyDisplay }) }}</span>
    </FieldRow>
    <span v-if="form.type === 'loan'" class="hint">{{ t('accounts.form.loanHint') }}</span>

    <template v-if="form.type === 'regular'">
      <FieldRow tag="button" icon="mdiCreditCardClockOutline" :label="t('accounts.form.creditLimit')" @click="showCreditLimitEntry = true">
        <span class="field-row-value" :class="{ muted: !form.creditLimit }">
          {{ form.creditLimit ? formatMoney(form.creditLimit, form.currency, { currencyDisplay: resolvedCurrencyDisplay }) : t('accounts.form.creditLimitNone') }}
        </span>
      </FieldRow>
      <span class="hint">{{ t('accounts.form.creditLimitHint') }}</span>
    </template>

    <FieldRow
      tag="button"
      icon="mdiCurrencySign"
      :label="t('accounts.form.currencyDisplayLabel')"
      @click="showCurrencyDisplayPicker = true"
    >
      <span class="field-row-value">{{ currencyDisplayLabel }}</span>
      <template #trailing>
        <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
      </template>
    </FieldRow>
    <span class="hint">{{ t('accounts.form.currencyDisplayHint') }}</span>

    <div v-if="form.type === 'savings'" class="goal-block">
      <span class="goal-title">{{ t('accounts.form.goalLabel') }}</span>
      <FieldRow tag="button" icon="mdiFlagCheckered" :label="t('accounts.form.goalAmount')" @click="showGoalEntry = true">
        <span class="field-row-value" :class="{ muted: !form.goalAmount }">
          {{ form.goalAmount ? formatMoney(form.goalAmount, form.currency, { currencyDisplay: resolvedCurrencyDisplay }) : t('accounts.form.goalNone') }}
        </span>
      </FieldRow>
      <FieldRow v-if="form.goalAmount" tag="button" icon="mdiCalendarCheckOutline" :label="t('accounts.form.goalDate')" @click="showGoalDatePicker = true">
        <span class="field-row-value" :class="{ muted: !form.goalDate }">
          {{ form.goalDate ? fullDateLabel(dateFromKey(form.goalDate)) : t('accounts.form.noGoalDate') }}
        </span>
        <template #trailing>
          <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
        </template>
      </FieldRow>
      <span class="hint">{{ t('accounts.form.goalHint') }}</span>
      <button v-if="form.goalAmount" type="button" class="btn btn-ghost goal-clear" @click="clearGoal">{{ t('accounts.form.goalClear') }}</button>
    </div>

    <FieldRow tag="label" icon="mdiScaleBalance" class="toggle-field">
      <span class="field-row-value">{{ t('accounts.form.includeInTotal') }}</span>
      <template #trailing>
        <input v-model="form.includeInTotal" type="checkbox" class="field-row-toggle" />
      </template>
    </FieldRow>

    <FieldRow icon="mdiNoteTextOutline" :label="t('accounts.form.noteLabel')">
      <textarea v-model="form.note" rows="2" class="field-row-value" />
    </FieldRow>

    <button class="btn btn-primary submit" :disabled="!!error" @click="submit">
      {{ isEdit ? t('common.save') : t('accounts.form.create') }}
    </button>

    <template v-if="isEdit">
      <button
        class="btn btn-secondary merge-btn"
        :disabled="!mergeCandidates.length"
        @click="showMergePicker = true"
      >
        {{ t('accounts.form.mergeButton') }}
      </button>
      <span v-if="!mergeCandidates.length" class="hint">{{ t('accounts.form.mergeNoCandidates') }}</span>
      <span v-if="mergeError" class="field-error">{{ mergeError }}</span>
    </template>

    <div v-if="isEdit" class="danger-zone">
      <button class="btn btn-secondary" @click="emit('archived')">
        {{ props.account?.archived ? t('accounts.form.unarchive') : t('accounts.form.archive') }}
      </button>
      <button class="btn btn-danger" @click="requestDelete">{{ t('accounts.form.deleteAccount') }}</button>
    </div>
  </Modal>

  <AccountPickerModal
    :open="showMergePicker"
    :title="t('accounts.form.mergePickerTitle')"
    :items="mergeCandidates"
    @close="showMergePicker = false"
    @select="handleMergeSelect"
  />

  <IconColorPickerModal
    :open="showIconColorPicker"
    :icon="form.icon"
    :color="form.color"
    @update:icon="(v) => (form.icon = v)"
    @update:color="(v) => (form.color = v)"
    @close="showIconColorPicker = false"
  />

  <CurrencyPickerModal
    :open="showCurrencyPicker"
    :selected="form.currency"
    :title="t('accounts.form.currencyModalTitle')"
    @close="showCurrencyPicker = false"
    @select="(code) => (form.currency = code)"
  />

  <OptionListModal
    :open="showCurrencyDisplayPicker"
    :title="t('accounts.form.currencyDisplayLabel')"
    :options="currencyDisplayOptions"
    :selected="form.currencyDisplay"
    @close="showCurrencyDisplayPicker = false"
    @select="chooseCurrencyDisplay"
  />

  <AmountEntryModal
    :open="showBalanceEntry"
    :title="t('accounts.form.initialBalanceLabel')"
    :initial-value="form.initialBalance"
    :currency="form.currency"
    :currency-display="resolvedCurrencyDisplay"
    :label="t('accounts.form.initialBalanceLabel')"
    @close="showBalanceEntry = false"
    @confirm="(v) => (form.initialBalance = v)"
  />

  <AmountEntryModal
    :open="showCreditLimitEntry"
    :title="t('accounts.form.creditLimit')"
    :initial-value="form.creditLimit"
    :currency="form.currency"
    :currency-display="resolvedCurrencyDisplay"
    :label="t('accounts.form.creditLimit')"
    @close="showCreditLimitEntry = false"
    @confirm="(v) => (form.creditLimit = v > 0 ? v : null)"
  />

  <AmountEntryModal
    :open="showGoalEntry"
    :title="t('accounts.form.goalAmount')"
    :initial-value="form.goalAmount"
    :currency="form.currency"
    :currency-display="resolvedCurrencyDisplay"
    :label="t('accounts.form.goalAmount')"
    @close="showGoalEntry = false"
    @confirm="(v) => (form.goalAmount = v > 0 ? v : null)"
  />

  <OperationDateModal
    :open="showGoalDatePicker"
    :date="form.goalDate"
    :title="t('accounts.form.goalDate')"
    :clear-label="t('accounts.form.noGoalDate')"
    @close="showGoalDatePicker = false"
    @update:date="(v) => (form.goalDate = v)"
  />
</template>

<style scoped>
.preview {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}
.preview-inner {
  position: relative;
  display: inline-flex;
}
.preview-edit-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}
/* FieldRow already carries its own bottom margin — these sit right under one
   without a wrapping `.field`'s gap, so give them their own breathing room. */
.hint,
.field-error {
  display: block;
  margin: -2px 2px 10px;
}
.hint {
  font-size: 12px;
  color: var(--text-muted);
}
.toggle-field {
  margin-bottom: 16px;
}
.goal-block {
  margin: 4px 0 14px;
  padding: 12px 12px 4px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
.goal-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin: 0 2px 8px;
}
.goal-block .hint {
  margin-bottom: 8px;
}
.goal-clear {
  width: 100%;
  margin-bottom: 8px;
}
.muted {
  color: var(--text-muted);
}
.submit {
  width: 100%;
  margin-top: 4px;
}
.merge-btn {
  width: 100%;
  margin-top: 20px;
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
