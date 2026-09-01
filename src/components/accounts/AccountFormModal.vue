<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import IconColorPickerModal from '../common/IconColorPickerModal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { COMMON_CURRENCIES } from '../../utils/currencies'
import { ACCOUNT_TYPE_OPTIONS, ACCOUNT_TYPE_DEFAULTS, LOAN_DIRECTION_OPTIONS } from '../../utils/accountTypes'
import type { Account, AccountType, LoanDirection } from '../../types/models'

const props = defineProps<{ open: boolean; account?: Account | null; defaultType?: AccountType }>()
const emit = defineEmits<{ close: []; save: [Partial<Account>]; deleted: []; archived: [] }>()

const isEdit = computed(() => !!props.account)

// Rebuilt fresh on every open (not just once at setup) since this component
// stays permanently mounted — see the `open` watch below.
function buildForm() {
  const initialType = props.account?.type ?? props.defaultType ?? ('regular' as AccountType)
  return {
    name: props.account?.name ?? '',
    type: initialType,
    loanDirection: props.account?.loanDirection ?? ('lent' as LoanDirection),
    currency: props.account?.currency ?? 'UAH',
    initialBalance: props.account?.initialBalance ?? 0,
    includeInTotal: props.account?.includeInTotal ?? true,
    icon: props.account?.icon ?? ACCOUNT_TYPE_DEFAULTS[initialType].icon,
    color: props.account?.color ?? ACCOUNT_TYPE_DEFAULTS[initialType].color,
    note: props.account?.note ?? '',
  }
}

const form = reactive(buildForm())
const showIconColorPicker = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(form, buildForm())
    showIconColorPicker.value = false
  },
)

function selectType(type: AccountType) {
  form.type = type
  if (!isEdit.value) {
    form.icon = ACCOUNT_TYPE_DEFAULTS[type].icon
    form.color = ACCOUNT_TYPE_DEFAULTS[type].color
  }
}

const error = computed(() => (form.name.trim() ? '' : "Вкажіть назву рахунку"))

function submit() {
  if (error.value) return
  emit('save', {
    name: form.name.trim(),
    type: form.type,
    loanDirection: form.type === 'loan' ? form.loanDirection : undefined,
    currency: form.currency,
    initialBalance: Number(form.initialBalance) || 0,
    includeInTotal: form.includeInTotal,
    icon: form.icon,
    color: form.color,
    note: form.note.trim() || undefined,
  })
}
</script>

<template>
  <Modal :open="open" :title="isEdit ? 'Редагувати рахунок' : 'Новий рахунок'" @close="emit('close')">
    <button type="button" class="preview" aria-label="Змінити значок і колір" @click="showIconColorPicker = true">
      <span class="preview-inner">
        <IconCircle :icon="form.icon" :color="form.color" :size="72" square />
        <span class="preview-edit-badge">
          <MdiIcon name="mdiPencilOutline" :size="14" color="var(--surface)" />
        </span>
      </span>
    </button>

    <div class="field">
      <label>Тип рахунку</label>
      <div class="segmented">
        <button
          v-for="opt in ACCOUNT_TYPE_OPTIONS"
          :key="opt.value"
          :class="{ active: form.type === opt.value }"
          @click="selectType(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div v-if="form.type === 'loan'" class="field">
      <label>Напрямок позики</label>
      <div class="segmented">
        <button
          v-for="dir in LOAN_DIRECTION_OPTIONS"
          :key="dir.value"
          :class="{ active: form.loanDirection === dir.value }"
          @click="form.loanDirection = dir.value"
        >
          {{ dir.label }}
        </button>
      </div>
    </div>

    <div class="field">
      <label>Назва</label>
      <input v-model="form.name" type="text" placeholder="Напр. Картка ПриватБанк" />
      <span v-if="error" class="field-error">{{ error }}</span>
    </div>

    <div class="row-2">
      <div class="field">
        <label>Валюта</label>
        <select v-model="form.currency">
          <option v-for="c in COMMON_CURRENCIES" :key="c.code" :value="c.code">{{ c.code }}</option>
        </select>
      </div>
      <div class="field">
        <label>Початковий баланс</label>
        <input v-model.number="form.initialBalance" type="number" step="0.01" inputmode="decimal" />
      </div>
    </div>

    <div class="field toggle-field">
      <label class="toggle-label">
        <input v-model="form.includeInTotal" type="checkbox" />
        <span>Враховувати в загальному балансі</span>
      </label>
    </div>

    <div class="field">
      <label>Нотатка (необов'язково)</label>
      <textarea v-model="form.note" rows="2" />
    </div>

    <button class="btn btn-primary submit" :disabled="!!error" @click="submit">
      {{ isEdit ? 'Зберегти' : 'Створити' }}
    </button>

    <div v-if="isEdit" class="danger-zone">
      <button class="btn btn-secondary" @click="emit('archived')">
        {{ props.account?.archived ? 'Розархівувати' : 'Архівувати' }}
      </button>
      <button class="btn btn-danger" @click="emit('deleted')">Видалити рахунок</button>
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
.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.toggle-field {
  margin-bottom: 16px;
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
