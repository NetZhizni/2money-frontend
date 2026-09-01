<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../common/Modal.vue'
import { useSettingsStore } from '../../stores/settings'
import { useTemplatesStore } from '../../stores/templates'
import { useAccountsStore } from '../../stores/accounts'
import { useCategoriesStore } from '../../stores/categories'
import { useTransactionsStore } from '../../stores/transactions'
import { useAuthStore } from '../../stores/auth'
import { useViewAsStore } from '../../stores/viewAs'
import { usePopupsStore } from '../../stores/popups'
import { COMMON_CURRENCIES } from '../../utils/currencies'
import { exportData, downloadBackup, importData } from '../../db/backup'
import { downloadTransactionsCsv } from '../../db/csvExport'
import { loadDemoData } from '../../db/demoData'
import { resetAllData } from '../../db/reset'
import { formatMoney } from '../../utils/format'
import { forceCheckForUpdate } from '../../pwa/updateService'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const templates = useTemplatesStore()
const accounts = useAccountsStore()
const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const authStore = useAuthStore()
const viewAs = useViewAsStore()
const popups = usePopupsStore()

// Демо-дані/резервна копія/скидання read straight off the shared
// accounts/categories/transactions/budgets stores, which "Переглянути як"
// (see UserSwitcherModal) repoints at whoever's being viewed — so while
// that's active they'd act on the wrong person's data. Simplest safe fix:
// these stay unavailable until back on "Ви".
const viewingOther = computed(() => viewAs.isReadOnly)

const FREQ_LABEL: Record<string, string> = { daily: 'щодня', weekly: 'щотижня', monthly: 'щомісяця', yearly: 'щороку' }

const activeTemplates = computed(() => templates.all.filter((t) => t.active))

function describeTemplate(id: string) {
  const t = templates.all.find((x) => x.id === id)
  if (!t) return null
  const account = accounts.all.find((a) => a.id === t.accountId)
  const category = categories.byId(t.categoryId)
  return {
    title: category?.name ?? '—',
    subtitle: `${account?.name ?? ''} · ${FREQ_LABEL[t.frequency]}${t.interval > 1 ? ` (кожні ${t.interval})` : ''}`,
    amount: formatMoney(t.type === 'expense' ? -t.amount : t.amount, t.currency),
    color: category?.color ?? '#9a9a9e',
  }
}

async function removeTemplate(id: string) {
  if (confirm('Видалити цю повторювану операцію? Вже створені операції залишаться.')) {
    await templates.remove(id)
  }
}

const fileInput = ref<HTMLInputElement | null>(null)
const status = ref('')
const demoLoading = ref(false)

// Demo data is only meaningful on an empty account — mixing it with real
// accounts/transactions would pollute real analytics, and there's no marker
// to undo it selectively afterwards. `loadDemoData` enforces this itself too;
// this just keeps the button from even being clickable in that state.
const hasAnyData = computed(() => accounts.all.length > 0 || transactions.all.length > 0)

async function handleLoadDemo() {
  demoLoading.value = true
  try {
    await loadDemoData()
    status.value = 'Демо-дані додано: рахунки та операції за поточний місяць.'
  } finally {
    demoLoading.value = false
  }
}

const resetLoading = ref(false)

function openResetConfirm() {
  popups.confirmDialog({
    title: 'Скинути всі дані?',
    message: 'Усі рахунки, операції та повторювані операції буде видалено безповоротно. Категорії та налаштування залишаться.',
    confirmLabel: 'Скинути',
    danger: true,
    onConfirm: async () => {
      resetLoading.value = true
      try {
        await resetAllData()
        status.value = 'Усі дані видалено.'
      } finally {
        resetLoading.value = false
        popups.closeConfirm()
      }
    },
  })
}

async function handleExport() {
  const payload = await exportData()
  downloadBackup(payload)
  status.value = 'Резервну копію збережено.'
}

function handleExportCsv() {
  downloadTransactionsCsv()
  status.value = 'CSV з операціями збережено.'
}

function triggerImport() {
  fileInput.value?.click()
}

async function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    if (!confirm('Це замінить усі ваші поточні дані даними з файлу. Продовжити?')) return
    await importData(payload)
    status.value = 'Дані відновлено.'
  } catch (err) {
    status.value = `Помилка імпорту: ${(err as Error).message}`
  }
}

const updateChecking = ref(false)
const updateStatus = ref('')

async function handleCheckUpdate() {
  updateChecking.value = true
  updateStatus.value = ''
  try {
    const result = await forceCheckForUpdate()
    if (result === 'up-to-date') updateStatus.value = 'У вас уже остання версія застосунку.'
    else if (result === 'error') updateStatus.value = 'Не вдалося перевірити оновлення. Перевірте з’єднання.'
    // 'updated' перезавантажує сторінку самостійно — статус показати не встигне.
  } finally {
    updateChecking.value = false
  }
}

const router = useRouter()

function openAdmin() {
  emit('close')
  router.push('/admin')
}

async function handleSignOut() {
  await authStore.signOut()
  emit('close')
}
</script>

<template>
  <Modal :open="open" title="Налаштування" wide @close="emit('close')">
    <div class="field profile-field" v-if="authStore.profile">
      <div class="profile-row">
        <img v-if="authStore.profile.photoURL" :src="authStore.profile.photoURL" class="avatar" alt="" />
        <div v-else class="avatar avatar-fallback" :style="{ background: authStore.profile.color }">
          {{ authStore.profile.displayName.slice(0, 1).toUpperCase() }}
        </div>
        <div class="profile-text">
          <span class="profile-name">{{ authStore.profile.displayName }}</span>
          <span class="profile-email">{{ authStore.profile.email }}</span>
        </div>
        <button class="btn btn-secondary" @click="handleSignOut">Вийти</button>
      </div>
    </div>

    <div class="field" v-if="authStore.isOwner">
      <label>Учасники родини</label>
      <p class="hint">Додавайте, вимикайте доступ і призначайте власників у розділі адміністрування.</p>
      <button class="btn btn-secondary" @click="openAdmin">Керувати учасниками</button>
    </div>

    <div class="field">
      <label>Базова валюта</label>
      <select v-model="settings.baseCurrency" @change="settings.setBaseCurrency(settings.baseCurrency)">
        <option v-for="c in COMMON_CURRENCIES" :key="c.code" :value="c.code">{{ c.label }}</option>
      </select>
      <p class="hint">Використовується для загального балансу та аналітики по всіх рахунках.</p>
    </div>

    <div class="field">
      <label>Тема</label>
      <div class="segmented">
        <button :class="{ active: settings.theme === 'system' }" @click="settings.setTheme('system')">Системна</button>
        <button :class="{ active: settings.theme === 'light' }" @click="settings.setTheme('light')">Світла</button>
        <button :class="{ active: settings.theme === 'dark' }" @click="settings.setTheme('dark')">Темна</button>
      </div>
    </div>

    <div class="field">
      <label>Повторювані операції ({{ activeTemplates.length }})</label>
      <p v-if="!activeTemplates.length" class="hint">Ще немає жодної повторюваної операції.</p>
      <ul v-else class="template-list">
        <li v-for="t in activeTemplates" :key="t.id" class="template-row">
          <span class="dot" :style="{ background: describeTemplate(t.id)?.color }" />
          <div class="template-text">
            <span class="template-title">{{ describeTemplate(t.id)?.title }}</span>
            <span class="template-sub">{{ describeTemplate(t.id)?.subtitle }}</span>
          </div>
          <span class="template-amount">{{ describeTemplate(t.id)?.amount }}</span>
          <button class="icon-btn" aria-label="Видалити" @click="removeTemplate(t.id)">✕</button>
        </li>
      </ul>
    </div>

    <div class="field">
      <label>Демо-дані</label>
      <p v-if="viewingOther" class="hint">Спершу поверніться до свого профілю (кнопка з фото у шапці).</p>
      <template v-else>
        <p class="hint">
          Додає кілька тестових рахунків (у т.ч. заощадження, позику та валютний) і операції за
          останні 6 місяців — щоб одразу побачити діаграми та аналітику заповненими.
        </p>
        <p v-if="hasAnyData" class="hint">
          Уже є рахунки або операції, тож демо-дані додати не можна — спершу скиньте всі дані нижче.
        </p>
        <button class="btn btn-secondary demo-btn" :disabled="demoLoading || hasAnyData" @click="handleLoadDemo">
          {{ demoLoading ? 'Додаємо…' : 'Додати демо-дані' }}
        </button>
      </template>
    </div>

    <div class="field">
      <label>Резервна копія даних</label>
      <p v-if="viewingOther" class="hint">Спершу поверніться до свого профілю (кнопка з фото у шапці).</p>
      <template v-else>
        <p class="hint">Стосується лише вашого профілю (рахунки, категорії, операції).</p>
        <div class="backup-actions">
          <button class="btn btn-secondary" @click="handleExport">Експортувати JSON</button>
          <button class="btn btn-secondary" @click="triggerImport">Імпортувати JSON</button>
          <button class="btn btn-secondary" @click="handleExportCsv">Експортувати CSV</button>
        </div>
        <input ref="fileInput" type="file" accept="application/json" hidden @change="handleImportFile" />
        <p v-if="status" class="status">{{ status }}</p>
      </template>
    </div>

    <div class="field">
      <label>Оновлення застосунку</label>
      <p class="hint">Перевіряє наявність нової версії застосунку та встановлює її негайно.</p>
      <button class="btn btn-secondary" :disabled="updateChecking" @click="handleCheckUpdate">
        {{ updateChecking ? 'Перевірка…' : 'Перевірити оновлення' }}
      </button>
      <p v-if="updateStatus" class="status">{{ updateStatus }}</p>
    </div>

    <div class="field">
      <label>Скидання всіх даних</label>
      <p v-if="viewingOther" class="hint">Спершу поверніться до свого профілю (кнопка з фото у шапці).</p>
      <template v-else>
        <p class="hint">
          Видаляє всі ваші рахунки, операції та повторювані операції. Категорії та налаштування
          залишаються. Дію не можна скасувати.
        </p>
        <button class="btn btn-danger reset-btn" @click="openResetConfirm">Скинути всі дані</button>
      </template>
    </div>
  </Modal>
</template>

<style scoped>
.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
}

.profile-field {
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
}

.profile-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.profile-name {
  font-weight: 600;
  font-size: 14px;
}

.profile-email {
  font-size: 12px;
  color: var(--text-muted);
}

.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}
.backup-actions .btn {
  flex: 1;
  min-width: 140px;
}
.demo-btn {
  width: 100%;
  margin-top: 8px;
}
.reset-btn {
  width: 100%;
  margin-top: 8px;
}
.status {
  font-size: 13px;
  color: var(--income);
  margin-top: 8px;
}

.template-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.template-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.template-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.template-amount {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.template-row .icon-btn {
  width: 24px;
  height: 24px;
  font-size: 11px;
}

.icon-btn {
  border: none;
  background: var(--surface-2);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 50%;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

</style>
