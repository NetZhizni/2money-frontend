<script setup lang="ts">
import { computed, reactive } from 'vue'
import Modal from '../common/Modal.vue'
import IconPicker from '../common/IconPicker.vue'
import ColorPicker from '../common/ColorPicker.vue'
import IconCircle from '../common/IconCircle.vue'
import { COMMON_CURRENCIES } from '../../utils/currencies'
import type { Account, AccountType, LoanDirection } from '../../types/models'

const props = defineProps<{ account?: Account | null }>()
const emit = defineEmits<{ close: []; save: [Partial<Account>]; deleted: []; archived: [] }>()

const isEdit = computed(() => !!props.account)

const TYPE_DEFAULTS: Record<AccountType, { icon: string; color: string }> = {
  regular: { icon: 'mdiWalletOutline', color: '#2a78d6' },
  savings: { icon: 'mdiPiggyBankOutline', color: '#1baf7a' },
  loan: { icon: 'mdiHandshakeOutline', color: '#eda100' },
}

const form = reactive({
  name: props.account?.name ?? '',
  type: props.account?.type ?? ('regular' as AccountType),
  loanDirection: props.account?.loanDirection ?? ('lent' as LoanDirection),
  currency: props.account?.currency ?? 'UAH',
  initialBalance: props.account?.initialBalance ?? 0,
  includeInTotal: props.account?.includeInTotal ?? true,
  icon: props.account?.icon ?? TYPE_DEFAULTS.regular.icon,
  color: props.account?.color ?? TYPE_DEFAULTS.regular.color,
  note: props.account?.note ?? '',
})

function selectType(type: AccountType) {
  form.type = type
  if (!isEdit.value) {
    form.icon = TYPE_DEFAULTS[type].icon
    form.color = TYPE_DEFAULTS[type].color
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
  <Modal :title="isEdit ? 'Редагувати рахунок' : 'Новий рахунок'" @close="emit('close')">
    <div class="preview">
      <IconCircle :icon="form.icon" :color="form.color" :size="72" />
    </div>

    <div class="field">
      <label>Тип рахунку</label>
      <div class="segmented">
        <button :class="{ active: form.type === 'regular' }" @click="selectType('regular')">Звичайний</button>
        <button :class="{ active: form.type === 'savings' }" @click="selectType('savings')">Зберігаючий</button>
        <button :class="{ active: form.type === 'loan' }" @click="selectType('loan')">Позика</button>
      </div>
    </div>

    <div v-if="form.type === 'loan'" class="field">
      <label>Напрямок позики</label>
      <div class="segmented">
        <button :class="{ active: form.loanDirection === 'lent' }" @click="form.loanDirection = 'lent'">Я позичив (дав)</button>
        <button :class="{ active: form.loanDirection === 'borrowed' }" @click="form.loanDirection = 'borrowed'">Я взяв позику</button>
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
      <label>Іконка</label>
      <IconPicker v-model="form.icon" :color="form.color" />
    </div>

    <div class="field">
      <label>Колір</label>
      <ColorPicker v-model="form.color" />
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
</template>

<style scoped>
.preview {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
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
