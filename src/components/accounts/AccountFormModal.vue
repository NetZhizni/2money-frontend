<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import IconColorPickerModal from '../common/IconColorPickerModal.vue'
import CurrencyPickerModal from '../layout/CurrencyPickerModal.vue'
import AmountEntryModal from '../common/AmountEntryModal.vue'
import OptionListModal, { type ListOption } from '../common/OptionListModal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import FieldRow from '../common/FieldRow.vue'
import { useAccountsStore } from '../../stores/accounts'
import { useSettingsStore } from '../../stores/settings'
import { ACCOUNT_TYPE_OPTIONS, ACCOUNT_TYPE_DEFAULTS, LOAN_DIRECTION_OPTIONS } from '../../utils/accountTypes'
import { formatMoney, formatMoneyAs, getNumberFormatSetting, type CurrencyDisplayStyle } from '../../utils/format'
import { t } from '../../i18n'
import type { Account, AccountType, LoanDirection } from '../../types/models'

// The picker's own "use the base Settings choice" option — kept out of
// Account.currencyDisplay's real value space (that field just stays
// unset/null for it, see types/models.ts) and mapped to/from it only here,
// where the form needs a single concrete selection to highlight.
type CurrencyDisplayFormValue = CurrencyDisplayStyle | 'base'

const props = defineProps<{ open: boolean; account?: Account | null; defaultType?: AccountType }>()
const emit = defineEmits<{ close: []; save: [Partial<Account>]; deleted: []; archived: [] }>()

const accounts = useAccountsStore()
const settings = useSettingsStore()

const isEdit = computed(() => !!props.account)

// Rebuilt fresh on every open (not just once at setup) since this component
// stays permanently mounted — see the `open` watch below.
function buildForm() {
  const initialType = props.account?.type ?? props.defaultType ?? ('regular' as AccountType)
  return {
    name: props.account?.name ?? '',
    type: initialType,
    loanDirection: props.account?.loanDirection ?? ('lent' as LoanDirection),
    currency: props.account?.currency ?? settings.baseCurrency,
    currencyDisplay: (props.account?.currencyDisplay ?? 'base') as CurrencyDisplayFormValue,
    initialBalance: props.account?.initialBalance ?? 0,
    includeInTotal: props.account?.includeInTotal ?? true,
    icon: props.account?.icon ?? ACCOUNT_TYPE_DEFAULTS[initialType].icon,
    color: props.account?.color ?? ACCOUNT_TYPE_DEFAULTS[initialType].color,
    note: props.account?.note ?? '',
  }
}

const form = reactive(buildForm())
const showIconColorPicker = ref(false)
const showCurrencyPicker = ref(false)
const showCurrencyDisplayPicker = ref(false)
const showBalanceEntry = ref(false)
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
    currencyLocked.value = props.account ? await accounts.hasTransactions(props.account.id) : false
  },
)

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

function selectType(type: AccountType) {
  form.type = type
  if (!isEdit.value) {
    form.icon = ACCOUNT_TYPE_DEFAULTS[type].icon
    form.color = ACCOUNT_TYPE_DEFAULTS[type].color
  }
}

const error = computed(() => (form.name.trim() ? '' : t('accounts.form.nameRequired')))

function submit() {
  if (error.value) return
  emit('save', {
    name: form.name.trim(),
    type: form.type,
    loanDirection: form.type === 'loan' ? form.loanDirection : undefined,
    currency: form.currency,
    currencyDisplay: form.currencyDisplay === 'base' ? null : form.currencyDisplay,
    initialBalance: Number(form.initialBalance) || 0,
    includeInTotal: form.includeInTotal,
    icon: form.icon,
    color: form.color,
    note: form.note.trim() || undefined,
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
      <div class="segmented">
        <button
          v-for="opt in ACCOUNT_TYPE_OPTIONS"
          :key="opt.value"
          :class="{ active: form.type === opt.value }"
          @click="selectType(opt.value)"
        >
          {{ t(opt.labelKey) }}
        </button>
      </div>
    </div>

    <div v-if="form.type === 'loan'" class="field">
      <label>{{ t('accounts.form.loanDirectionLabel') }}</label>
      <div class="segmented">
        <button
          v-for="dir in LOAN_DIRECTION_OPTIONS"
          :key="dir.value"
          :class="{ active: form.loanDirection === dir.value }"
          @click="form.loanDirection = dir.value"
        >
          {{ t(dir.labelKey) }}
        </button>
      </div>
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

    <div v-if="isEdit" class="danger-zone">
      <button class="btn btn-secondary" @click="emit('archived')">
        {{ props.account?.archived ? t('accounts.form.unarchive') : t('accounts.form.archive') }}
      </button>
      <button class="btn btn-danger" @click="emit('deleted')">{{ t('accounts.form.deleteAccount') }}</button>
    </div>
  </Modal>

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
.submit {
  width: 100%;
  margin-top: 4px;
}
.danger-zone {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.danger-zone .btn {
  flex: 1;
}
</style>
