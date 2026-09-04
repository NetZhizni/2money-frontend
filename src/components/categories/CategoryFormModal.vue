<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import IconColorPickerModal from '../common/IconColorPickerModal.vue'
import CurrencyPickerModal from '../layout/CurrencyPickerModal.vue'
import CategoryPickerModal from '../transactions/CategoryPickerModal.vue'
import OptionListModal, { type ListOption } from '../common/OptionListModal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import FieldRow from '../common/FieldRow.vue'
import { useCategoriesStore } from '../../stores/categories'
import { useSettingsStore } from '../../stores/settings'
import { formatMoney, formatMoneyAs, getNumberFormatSetting, type CurrencyDisplayStyle } from '../../utils/format'
import { t } from '../../i18n'
import type { Category, CategoryKind } from '../../types/models'

// Same "use the base Settings choice" mapping as AccountFormModal.vue's own
// currency-display picker — see there for why it's kept out of
// Category.currencyDisplay's real (unset/null) value space.
type CurrencyDisplayFormValue = CurrencyDisplayStyle | 'base'

const props = defineProps<{
  open: boolean
  category?: Category | null
  defaultKind?: CategoryKind
  defaultParentId?: string | null
}>()

const emit = defineEmits<{ close: []; saved: [Category]; deleted: []; archived: [] }>()
const categories = useCategoriesStore()
const settings = useSettingsStore()

const isEdit = computed(() => !!props.category)

// Rebuilt fresh on every open (not just once at setup) since this component
// stays permanently mounted — see the `open` watch below.
function buildForm() {
  return {
    name: props.category?.name ?? '',
    kind: props.category?.kind ?? props.defaultKind ?? 'expense',
    parentId: props.category?.parentId ?? props.defaultParentId ?? null,
    icon: props.category?.icon ?? 'mdiShapeOutline',
    color: props.category?.color ?? '#2a78d6',
    currency: props.category?.currency ?? settings.baseCurrency,
    currencyDisplay: (props.category?.currencyDisplay ?? 'base') as CurrencyDisplayFormValue,
  }
}

const form = reactive(buildForm())
const showIconColorPicker = ref(false)
const showParentPicker = ref(false)
const showCurrencyPicker = ref(false)
const showCurrencyDisplayPicker = ref(false)
// Once a top-level category has operations against it, its currency can't
// change (see stores/categories.ts's hasTransactions and the server-side
// twin in upsertCategory.js, which is what actually enforces this) — this is
// just the form's own preview of that, so a doomed edit is never attempted.
const currencyLocked = ref(false)

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    Object.assign(form, buildForm())
    showIconColorPicker.value = false
    showParentPicker.value = false
    showCurrencyPicker.value = false
    showCurrencyDisplayPicker.value = false
    currencyLocked.value = props.category ? await categories.hasTransactions(props.category.id) : false
    // A top-level category saved before currencies were mandatory has none
    // yet — buildForm() just defaulted the field above to the base currency,
    // but a category that's only ever seen some OTHER currency in its past
    // operations should keep looking like that one, not silently flip to
    // "base-currency" the moment someone opens (and saves) this form.
    if (props.category && !props.category.currency && !form.parentId) {
      const inferred = await categories.inferCurrency(props.category.id)
      if (inferred) form.currency = inferred
    }
  },
)

const isSubcategory = computed(() => !!form.parentId)

const parentOptions = computed(() =>
  categories.topLevel(form.kind, true).filter((c) => c.id !== props.category?.id),
)
const parentCategoryName = computed(() => (form.parentId ? (categories.byId(form.parentId)?.name ?? '') : t('categories.form.noParent')))

// Same live-preview idea as AccountFormModal.vue's own currency-display
// picker — "base" shows what formatMoney's own default currently resolves to.
const CURRENCY_DISPLAY_PREVIEW_AMOUNT = 1234.56
const currencyDisplayOptions = computed<ListOption[]>(() => [
  { value: 'base', label: t('categories.form.currencyDisplayBase'), sublabel: formatMoney(CURRENCY_DISPLAY_PREVIEW_AMOUNT, form.currency) },
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

const error = computed(() => (form.name.trim() ? '' : t('categories.form.nameRequired')))

async function submit() {
  if (error.value) return
  // Only a top-level category carries its own currency (and display
  // override) — a subcategory always inherits both from its parent
  // (TransactionFormModal.vue only ever reads the top-level category's
  // `currency`; CategoryTile.vue/CategoryDetailModal.vue resolve
  // `currencyDisplay` the same way), so clear them here rather than leave a
  // stale value sitting unused on a category that just became a
  // subcategory. `currency` is mandatory otherwise (see buildForm's
  // default), so no blank fallback needed there.
  const currency = form.parentId ? undefined : form.currency
  const currencyDisplay = form.parentId ? undefined : form.currencyDisplay === 'base' ? null : form.currencyDisplay
  if (isEdit.value && props.category) {
    await categories.update(props.category.id, {
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      parentId: form.parentId,
      currency,
      currencyDisplay,
    })
    emit('saved', { ...props.category, name: form.name.trim(), icon: form.icon, color: form.color, parentId: form.parentId, currency, currencyDisplay })
  } else {
    const created = await categories.add({
      name: form.name.trim(),
      kind: form.kind,
      icon: form.icon,
      color: form.color,
      parentId: form.parentId,
      archived: false,
      currency,
      currencyDisplay,
    })
    emit('saved', created)
  }
}

function toggleParent(id: string | null) {
  form.parentId = id
  if (id) {
    const parent = categories.byId(id)
    if (parent) form.kind = parent.kind
  }
}
</script>

<template>
  <Modal :open="open" :title="isEdit ? t('categories.form.editTitle') : t('categories.form.newTitle')" @close="emit('close')">
    <button type="button" class="preview" :aria-label="t('categories.form.editIconColor')" @click="showIconColorPicker = true">
      <span class="preview-inner">
        <IconCircle :icon="form.icon" :color="form.color" :size="72" />
        <span class="preview-edit-badge">
          <MdiIcon name="mdiPencilOutline" :size="14" color="var(--surface)" />
        </span>
      </span>
    </button>

    <div class="field" v-if="!isEdit">
      <label>{{ t('categories.form.typeLabel') }}</label>
      <div class="segmented">
        <button :class="{ active: form.kind === 'expense' }" @click="form.kind = 'expense'">{{ t('categories.form.expenseType') }}</button>
        <button :class="{ active: form.kind === 'income' }" @click="form.kind = 'income'">{{ t('categories.form.incomeType') }}</button>
      </div>
    </div>

    <FieldRow icon="mdiFormTextbox" :label="t('categories.form.nameLabel')">
      <input v-model="form.name" type="text" class="field-row-value" :placeholder="t('categories.form.namePlaceholder')" />
    </FieldRow>
    <span v-if="error" class="field-error">{{ error }}</span>

    <FieldRow
      tag="button"
      icon="mdiFileTreeOutline"
      :label="t('categories.form.parentLabel')"
      :disabled="currencyLocked"
      @click="showParentPicker = true"
    >
      <span class="field-row-value">{{ parentCategoryName }}</span>
      <template #trailing>
        <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
      </template>
    </FieldRow>
    <span v-if="currencyLocked" class="hint">{{ t('categories.form.parentLockedHint') }}</span>
    <span v-else-if="isSubcategory" class="hint">{{ t('categories.form.inheritsKindHint') }}</span>

    <template v-if="!isSubcategory">
      <FieldRow
        tag="button"
        icon="mdiCurrencyUsd"
        :label="t('categories.form.currencyLabel')"
        :disabled="currencyLocked"
        @click="showCurrencyPicker = true"
      >
        <span class="field-row-value">{{ form.currency }}</span>
        <template #trailing>
          <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
        </template>
      </FieldRow>
      <span v-if="currencyLocked" class="hint">{{ t('categories.form.currencyLockedHint') }}</span>
      <span v-else class="hint">{{ t('categories.form.currencyHint') }}</span>

      <FieldRow
        tag="button"
        icon="mdiCurrencySign"
        :label="t('categories.form.currencyDisplayLabel')"
        @click="showCurrencyDisplayPicker = true"
      >
        <span class="field-row-value">{{ currencyDisplayLabel }}</span>
        <template #trailing>
          <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
        </template>
      </FieldRow>
      <span class="hint">{{ t('categories.form.currencyDisplayHint') }}</span>
    </template>

    <button class="btn btn-primary submit" :disabled="!!error" @click="submit">
      {{ isEdit ? t('common.save') : t('categories.form.create') }}
    </button>

    <div v-if="isEdit" class="danger-zone">
      <button class="btn btn-secondary" @click="emit('archived')">
        {{ props.category?.archived ? t('categories.form.unarchive') : t('categories.form.archive') }}
      </button>
      <button class="btn btn-danger" @click="emit('deleted')">{{ t('categories.form.deleteCategory') }}</button>
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

  <CategoryPickerModal
    :open="showParentPicker"
    :kind="form.kind"
    :categories="parentOptions"
    :selected-id="form.parentId ?? undefined"
    :none-label="t('categories.form.noParent')"
    @close="showParentPicker = false"
    @select="(id) => toggleParent(id || null)"
  />

  <CurrencyPickerModal
    :open="showCurrencyPicker"
    :selected="form.currency"
    :title="t('categories.form.currencyLabel')"
    @close="showCurrencyPicker = false"
    @select="(code) => (form.currency = code)"
  />

  <OptionListModal
    :open="showCurrencyDisplayPicker"
    :title="t('categories.form.currencyDisplayLabel')"
    :options="currencyDisplayOptions"
    :selected="form.currencyDisplay"
    @close="showCurrencyDisplayPicker = false"
    @select="chooseCurrencyDisplay"
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
