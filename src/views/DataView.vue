<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTemplatesStore } from '../stores/templates'
import { useAccountsStore } from '../stores/accounts'
import { useCategoriesStore } from '../stores/categories'
import { useTransactionsStore } from '../stores/transactions'
import { useAuthStore } from '../stores/auth'
import { useViewAsStore } from '../stores/viewAs'
import { usePopupsStore } from '../stores/popups'
import {
  exportData,
  downloadBackup,
  importData,
  mergeBackupFile,
  exportFamilyBackup,
  downloadFamilyBackup,
  restoreFamilyBackup,
  isFamilyBackup,
} from '../db/backup'
import { fullSync } from '../db/sync'
import { downloadTransactionsCsv } from '../db/csvExport'
import { loadDemoData } from '../db/demoData'
import { seedDefaultCategoriesNow } from '../db/seed'
import { resetAllData } from '../db/reset'
import { formatMoney } from '../utils/format'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'

// Everything that bulk-reads or bulk-writes the family's data — moved here
// out of SettingsModal.vue (which now just links to this page, same as
// TagsView), since it had grown into the bulk of that popup.

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

// Each action reports back under its own card rather than in one shared
// spot — on a scrolling page, a message rendered under a different card
// than the button just pressed could easily sit off-screen.
type StatusSection = 'categories' | 'demo' | 'backup' | 'family' | 'reset'
const status = ref<{ section: StatusSection; text: string } | null>(null)
function report(section: StatusSection, text: string) {
  status.value = { section, text }
}
function statusFor(section: StatusSection): string {
  return status.value?.section === section ? status.value.text : ''
}

const FREQ_LABEL_KEY: Record<string, MessageKey> = {
  daily: 'layout.settings.freq.daily',
  weekly: 'layout.settings.freq.weekly',
  monthly: 'layout.settings.freq.monthly',
  yearly: 'layout.settings.freq.yearly',
}

const templateRows = computed(() =>
  templates.all
    .filter((tpl) => tpl.active)
    .map((tpl) => {
      const account = accounts.all.find((a) => a.id === tpl.accountId)
      const category = categories.byId(tpl.categoryId)
      const every = tpl.interval > 1 ? ` ${t('layout.settings.freq.every', { n: tpl.interval })}` : ''
      return {
        id: tpl.id,
        title: category?.name ?? '—',
        subtitle: `${account?.name ?? ''} · ${t(FREQ_LABEL_KEY[tpl.frequency])}${every}`,
        amount: formatMoney(tpl.type === 'expense' ? -tpl.amount : tpl.amount, tpl.currency, { currencyDisplay: account?.currencyDisplay }),
        color: category?.color ?? '#9a9a9e',
      }
    }),
)

async function removeTemplate(id: string) {
  if (confirm(t('layout.settings.removeTemplateConfirm'))) {
    await templates.remove(id)
  }
}

const fileInput = ref<HTMLInputElement | null>(null)
const mergeFileInput = ref<HTMLInputElement | null>(null)
const familyRestoreFileInput = ref<HTMLInputElement | null>(null)
const demoLoading = ref(false)

// Demo data is only meaningful on an empty account — mixing it with real
// accounts/transactions would pollute real analytics, and there's no marker
// to undo it selectively afterwards. `loadDemoData` enforces this itself too;
// this just keeps the button from even being clickable in that state.
const hasAnyData = computed(() => accounts.all.length > 0 || transactions.all.length > 0)
// Without any category, demo income/expense transactions have nowhere to
// file under (see db/demoData.ts's own guard) — only transfers would show.
const hasNoCategories = computed(() => categories.all.length === 0)

async function handleLoadDemo() {
  demoLoading.value = true
  try {
    await loadDemoData()
    report('demo', t('layout.settings.demoDataAdded'))
  } finally {
    demoLoading.value = false
  }
}

const seedingCategories = ref(false)

async function handleSeedDefaultCategories() {
  seedingCategories.value = true
  try {
    await seedDefaultCategoriesNow(authStore.uid!)
    report('categories', t('layout.settings.categoriesSeeded'))
  } finally {
    seedingCategories.value = false
  }
}

const clearingCategories = ref(false)

function openClearCategoriesConfirm() {
  popups.confirmDialog({
    title: t('layout.settings.clearCategoriesConfirmTitle'),
    message: t('layout.settings.clearCategoriesConfirmMessage'),
    confirmLabel: t('layout.settings.clearCategoriesConfirmButton'),
    danger: true,
    onConfirm: async () => {
      clearingCategories.value = true
      try {
        const { removed, kept } = await categories.removeUnused()
        report('categories', t('layout.settings.categoriesCleared', { removed, kept }))
      } finally {
        clearingCategories.value = false
        popups.closeConfirm()
      }
    },
  })
}

const resetLoading = ref(false)

function openResetConfirm() {
  popups.confirmDialog({
    title: t('layout.settings.resetConfirmTitle'),
    message: t('layout.settings.resetConfirmMessage'),
    confirmLabel: t('layout.settings.resetConfirmButton'),
    danger: true,
    onConfirm: async () => {
      resetLoading.value = true
      try {
        await resetAllData()
        report('reset', t('layout.settings.dataReset'))
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
  report('backup', t('layout.settings.backupSaved'))
}

async function handleExportCsv() {
  await downloadTransactionsCsv()
  report('backup', t('layout.settings.csvSaved'))
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
    if (!confirm(t('layout.settings.importConfirm'))) return
    await importData(payload)
    report('backup', t('sync.restoreSuccess'))
  } catch (err) {
    report('backup', t('sync.importError', { message: (err as Error).message }))
  }
}

function triggerMerge() {
  mergeFileInput.value?.click()
}

/**
 * Same file format as handleImportFile, but adds to what's already here
 * instead of replacing it — see db/backup.ts's mergeData() doc comment.
 * Goes through mergeBackupFile() rather than mergeData() directly so this
 * same button also accepts a full family backup (see
 * exportFamilyBackup()/handleFamilyBackup() below) — it just pulls out
 * whatever in it belonged to your own email in the old family.
 */
async function handleMergeFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    if (!confirm(t('layout.settings.importMergeConfirm'))) return
    await mergeBackupFile(payload)
    report('backup', t('sync.mergeSuccess'))
  } catch (err) {
    report('backup', t('sync.importError', { message: (err as Error).message }))
  }
}

const familyBackupLoading = ref(false)

/** Owner-only "back up literally everyone" — see exportFamilyBackup()'s own doc comment for what's in the file and how it's meant to come back: either restored whole (handleFamilyRestoreFile below) or one member's own slice at a time (handleMergeFile above). */
async function handleFamilyBackup() {
  familyBackupLoading.value = true
  try {
    const payload = await exportFamilyBackup()
    downloadFamilyBackup(payload)
    report('family', t('layout.settings.familyBackupSaved'))
  } catch (err) {
    report('family', t('sync.importError', { message: (err as Error).message }))
  } finally {
    familyBackupLoading.value = false
  }
}

const familyRestoreLoading = ref(false)

function triggerFamilyRestore() {
  familyRestoreFileInput.value?.click()
}

/**
 * Owner-only "restore literally everyone at once" — see
 * restoreFamilyBackup()'s own doc comment. Confirmed separately (danger
 * dialog) since, unlike every other action on this page, it writes data
 * attributed to OTHER family members and can provision brand-new accounts
 * for people who've never signed in yet.
 */
async function handleFamilyRestoreFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    if (!isFamilyBackup(payload)) throw new Error(t('sync.unsupportedBackupFormat'))
    popups.confirmDialog({
      title: t('layout.settings.familyRestoreConfirmTitle'),
      message: t('layout.settings.familyRestoreConfirmMessage'),
      confirmLabel: t('layout.settings.familyRestoreConfirmButton'),
      danger: true,
      onConfirm: async () => {
        familyRestoreLoading.value = true
        try {
          const summary = await restoreFamilyBackup(payload)
          await fullSync(authStore.uid)
          report('family', t('layout.settings.familyRestoreSuccess', { count: summary.transactions }))
        } catch (err) {
          report('family', t('sync.importError', { message: (err as Error).message }))
        } finally {
          familyRestoreLoading.value = false
          popups.closeConfirm()
        }
      },
    })
  } catch (err) {
    report('family', t('sync.importError', { message: (err as Error).message }))
  }
}
</script>

<template>
  <div class="view">
    <div>
      <h1 class="page-title">{{ t('layout.settings.section.data') }}</h1>
    </div>
    <div class="view-scroll">
      <div class="view-scroll-content">
        <section class="card">
          <h3 class="card-title">{{ t('layout.settings.recurringLabel', { count: templateRows.length }) }}</h3>
          <p v-if="!templateRows.length" class="hint">{{ t('layout.settings.recurringEmpty') }}</p>
          <ul v-else class="template-list">
            <li v-for="row in templateRows" :key="row.id" class="template-row">
              <span class="dot" :style="{ background: row.color }" />
              <div class="template-text">
                <span class="template-title">{{ row.title }}</span>
                <span class="template-sub">{{ row.subtitle }}</span>
              </div>
              <span class="template-amount">{{ row.amount }}</span>
              <button class="icon-btn" :aria-label="t('common.delete')" @click="removeTemplate(row.id)">✕</button>
            </li>
          </ul>
        </section>

        <section class="card">
          <h3 class="card-title">{{ t('layout.settings.categoriesLabel') }}</h3>
          <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
          <template v-else>
            <p class="hint">{{ t('layout.settings.categoriesHint') }}</p>
            <p v-if="hasNoCategories" class="hint">{{ t('layout.settings.categoriesEmptyHint') }}</p>
            <p v-else class="hint">{{ t('layout.settings.categoriesExist') }}</p>
            <div class="actions">
              <button
                class="btn btn-secondary"
                :disabled="seedingCategories || !hasNoCategories"
                @click="handleSeedDefaultCategories"
              >
                {{ seedingCategories ? t('layout.settings.seedingCategories') : t('layout.settings.seedCategoriesButton') }}
              </button>
              <button
                class="btn btn-danger"
                :disabled="clearingCategories || hasNoCategories"
                @click="openClearCategoriesConfirm"
              >
                {{ clearingCategories ? t('layout.settings.clearingCategories') : t('layout.settings.clearCategoriesButton') }}
              </button>
            </div>
            <p v-if="statusFor('categories')" class="status">{{ statusFor('categories') }}</p>
          </template>
        </section>

        <section class="card">
          <h3 class="card-title">{{ t('layout.settings.demoDataLabel') }}</h3>
          <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
          <template v-else>
            <p class="hint">{{ t('layout.settings.demoDataHint') }}</p>
            <p v-if="hasAnyData" class="hint">{{ t('layout.settings.demoDataBlocked') }}</p>
            <p v-else-if="hasNoCategories" class="hint">{{ t('layout.settings.demoDataNoCategories') }}</p>
            <button class="btn btn-secondary wide-btn" :disabled="demoLoading || hasAnyData || hasNoCategories" @click="handleLoadDemo">
              {{ demoLoading ? t('layout.settings.addingDemo') : t('layout.settings.addDemoData') }}
            </button>
            <p v-if="statusFor('demo')" class="status">{{ statusFor('demo') }}</p>
          </template>
        </section>

        <section class="card">
          <h3 class="card-title">{{ t('layout.settings.backupLabel') }}</h3>
          <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
          <template v-else>
            <p class="hint">{{ t('layout.settings.backupHint') }}</p>
            <div class="actions">
              <button class="btn btn-secondary" @click="handleExport">{{ t('layout.settings.exportJson') }}</button>
              <button class="btn btn-secondary" @click="triggerImport">{{ t('layout.settings.importJson') }}</button>
              <button class="btn btn-secondary" @click="handleExportCsv">{{ t('layout.settings.exportCsv') }}</button>
            </div>
            <input ref="fileInput" type="file" accept="application/json" hidden @change="handleImportFile" />
            <p class="hint">{{ t('layout.settings.importMergeHint') }}</p>
            <div class="actions">
              <button class="btn btn-secondary" @click="triggerMerge">{{ t('layout.settings.importJsonMerge') }}</button>
            </div>
            <input ref="mergeFileInput" type="file" accept="application/json" hidden @change="handleMergeFile" />
            <p v-if="statusFor('backup')" class="status">{{ statusFor('backup') }}</p>
          </template>
        </section>

        <section v-if="authStore.isOwner && !authStore.localMode" class="card">
          <h3 class="card-title">{{ t('layout.settings.familyBackupLabel') }}</h3>
          <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
          <template v-else>
            <p class="hint">{{ t('layout.settings.familyBackupHint') }}</p>
            <button class="btn btn-secondary wide-btn" :disabled="familyBackupLoading" @click="handleFamilyBackup">
              {{ familyBackupLoading ? t('layout.settings.familyBackupLoading') : t('layout.settings.familyBackupButton') }}
            </button>
            <p class="hint">{{ t('layout.settings.familyRestoreHint') }}</p>
            <button class="btn btn-secondary wide-btn" :disabled="familyRestoreLoading" @click="triggerFamilyRestore">
              {{ familyRestoreLoading ? t('layout.settings.familyRestoreLoading') : t('layout.settings.familyRestoreButton') }}
            </button>
            <input ref="familyRestoreFileInput" type="file" accept="application/json" hidden @change="handleFamilyRestoreFile" />
            <p v-if="statusFor('family')" class="status">{{ statusFor('family') }}</p>
          </template>
        </section>

        <section class="card danger">
          <h3 class="card-title">{{ t('layout.settings.section.danger') }}</h3>
          <p class="card-subtitle">{{ t('layout.settings.resetLabel') }}</p>
          <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
          <template v-else>
            <p class="hint">{{ t('layout.settings.resetHint') }}</p>
            <button class="btn btn-danger wide-btn" :disabled="resetLoading" @click="openResetConfirm">
              {{ resetLoading ? t('layout.settings.resetting') : t('layout.settings.resetButton') }}
            </button>
            <p v-if="statusFor('reset')" class="status">{{ statusFor('reset') }}</p>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page-title {
  font-size: 20px;
  margin: 8px 0 4px;
}
.card {
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: 14px;
  margin-top: 12px;
}
.card.danger {
  border: 1px solid color-mix(in srgb, var(--expense) 35%, transparent);
}
.card-title {
  font-size: 14px;
  margin: 0 0 6px;
  color: var(--text-primary);
}
.card-subtitle {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0;
}
.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}
.actions .btn {
  flex: 1;
  min-width: 140px;
}
.wide-btn {
  width: 100%;
  margin-top: 8px;
}
.status {
  font-size: 13px;
  color: var(--income);
  margin: 8px 0 0;
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
  @include lineClamp(1);
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
.icon-btn {
  width: 24px;
  height: 24px;
  font-size: 11px;
  border: none;
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 50%;
}
</style>
