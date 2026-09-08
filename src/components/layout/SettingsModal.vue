<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../common/Modal.vue'
import CurrencyPickerModal from './CurrencyPickerModal.vue'
import OptionListModal, { type ListOption } from '../common/OptionListModal.vue'
import Segmented from '../common/Segmented.vue'
import { useSettingsStore } from '../../stores/settings'
import { useTemplatesStore } from '../../stores/templates'
import { useAccountsStore } from '../../stores/accounts'
import { useCategoriesStore } from '../../stores/categories'
import { useTransactionsStore } from '../../stores/transactions'
import { useAuthStore } from '../../stores/auth'
import { useServerStore } from '../../stores/server'
import { useChangeServer } from '../../composables/useChangeServer'
import { useViewAsStore } from '../../stores/viewAs'
import { usePopupsStore } from '../../stores/popups'
import {
  exportData,
  downloadBackup,
  importData,
  mergeBackupFile,
  exportFamilyBackup,
  downloadFamilyBackup,
  restoreFamilyBackup,
  isFamilyBackup,
} from '../../db/backup'
import { fullSync } from '../../db/sync'
import { downloadTransactionsCsv } from '../../db/csvExport'
import { loadDemoData } from '../../db/demoData'
import { resetAllData } from '../../db/reset'
import {
  formatMoney,
  formatMoneyAs,
  formatDateAs,
  getNumberFormatSetting,
  setNumberFormatSetting,
  getDateFormatSetting,
  setDateFormatSetting,
  getCurrencyDisplaySetting,
  setCurrencyDisplaySetting,
  type NumberFormatStyle,
  type DateFormatStyle,
  type CurrencyDisplayStyle,
} from '../../utils/format'
import { forceCheckForUpdate } from '../../pwa/updateService'
import { t, getLocaleSetting, setLocaleSetting } from '../../i18n'
import type { MessageKey, LocaleSetting } from '../../i18n'
import type { AppSettings } from '../../types/models'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const templates = useTemplatesStore()
const accounts = useAccountsStore()
const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const authStore = useAuthStore()
const server = useServerStore()
const viewAs = useViewAsStore()
const popups = usePopupsStore()

// ---------- Сервер (див. stores/server.ts, composables/useChangeServer.ts) ----------

const {
  showField: showServerChangeField,
  newUrl: newServerUrl,
  switching: switchingServer,
  error: serverSwitchError,
  open: openServerChange,
  cancel: cancelServerChange,
  confirmChange: confirmChangeServer,
  confirmGoLocal,
} = useChangeServer()

// Демо-дані/резервна копія/скидання read straight off the shared
// accounts/categories/transactions/budgets stores, which "Переглянути як"
// (see UserSwitcherModal) repoints at whoever's being viewed — so while
// that's active they'd act on the wrong person's data. Simplest safe fix:
// these stay unavailable until back on "Ви".
const viewingOther = computed(() => viewAs.isReadOnly)

// Per-device, not part of `settings` (see i18n/locale.ts) — reloads the page
// on change instead of live-updating, so this only needs its initial value.
const localeSetting = ref<LocaleSetting>(getLocaleSetting())
function chooseLocale(value: LocaleSetting) {
  localeSetting.value = value
  setLocaleSetting(value)
}

const themeOptions = computed(() => [
  { value: 'system', label: t('layout.settings.themeSystem') },
  { value: 'light', label: t('layout.settings.themeLight') },
  { value: 'dark', label: t('layout.settings.themeDark') },
])
const localeOptions = computed(() => [
  { value: 'system', label: t('layout.settings.languageSystem') },
  { value: 'uk', label: t('layout.settings.languageUk') },
  { value: 'en', label: t('layout.settings.languageEn') },
])

// Number/date/currency-display format pickers (see utils/format.ts) — same
// per-device, reload-to-apply pattern as the language setting above.
const showNumberFormatPicker = ref(false)
const showDateFormatPicker = ref(false)
const showCurrencyDisplayPicker = ref(false)
const numberFormatSetting = ref<NumberFormatStyle>(getNumberFormatSetting())
const dateFormatSetting = ref<DateFormatStyle>(getDateFormatSetting())
const currencyDisplaySetting = ref<CurrencyDisplayStyle>(getCurrencyDisplaySetting())

const PREVIEW_AMOUNT = 1234.56
const numberFormatOptions = computed<ListOption[]>(() => [
  { value: 'auto', label: t('layout.settings.numberFormatAuto'), sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, 'auto') },
  { value: 'uk', label: t('layout.settings.numberFormatUk'), sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, 'uk') },
  { value: 'us', label: t('layout.settings.numberFormatUs'), sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, 'us') },
  { value: 'eu', label: t('layout.settings.numberFormatEu'), sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, 'eu') },
])
const numberFormatLabel = computed(
  () => numberFormatOptions.value.find((o) => o.value === numberFormatSetting.value)?.sublabel ?? '',
)

const PREVIEW_DATE = new Date(2026, 3, 5) // 5 April — a day/month pair that reads unambiguously in every format below
const dateFormatOptions = computed<ListOption[]>(() => [
  { value: 'iso', label: t('layout.settings.dateFormatIso'), sublabel: formatDateAs(PREVIEW_DATE, 'iso') },
  { value: 'dmy', label: t('layout.settings.dateFormatDmy'), sublabel: formatDateAs(PREVIEW_DATE, 'dmy') },
  { value: 'mdy', label: t('layout.settings.dateFormatMdy'), sublabel: formatDateAs(PREVIEW_DATE, 'mdy') },
])
const dateFormatLabel = computed(
  () => dateFormatOptions.value.find((o) => o.value === dateFormatSetting.value)?.sublabel ?? '',
)

// Each option previewed at the CURRENT number-format setting — only the
// currencyDisplay axis varies here, matching what formatMoneyAs's `opts`
// override actually does (see AccountFormModal.vue/CategoryFormModal.vue for
// the identical per-entity picker, whose "базовий вигляд" option reads this
// setting's own preview back via formatMoney's default).
const currencyDisplayOptions = computed<ListOption[]>(() => [
  {
    value: 'narrowSymbol',
    label: t('layout.settings.currencyDisplayNarrowSymbol'),
    sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, numberFormatSetting.value, { currencyDisplay: 'narrowSymbol' }),
  },
  {
    value: 'symbol',
    label: t('layout.settings.currencyDisplaySymbol'),
    sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, numberFormatSetting.value, { currencyDisplay: 'symbol' }),
  },
  {
    value: 'code',
    label: t('layout.settings.currencyDisplayCode'),
    sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, numberFormatSetting.value, { currencyDisplay: 'code' }),
  },
  {
    value: 'name',
    label: t('layout.settings.currencyDisplayName'),
    sublabel: formatMoneyAs(PREVIEW_AMOUNT, settings.baseCurrency, numberFormatSetting.value, { currencyDisplay: 'name' }),
  },
])
const currencyDisplayLabel = computed(
  () => currencyDisplayOptions.value.find((o) => o.value === currencyDisplaySetting.value)?.sublabel ?? '',
)

function chooseNumberFormat(value: string) {
  setNumberFormatSetting(value as NumberFormatStyle)
}
function chooseDateFormat(value: string) {
  setDateFormatSetting(value as DateFormatStyle)
}
function chooseCurrencyDisplay(value: string) {
  setCurrencyDisplaySetting(value as CurrencyDisplayStyle)
}

const FREQ_LABEL_KEY: Record<string, MessageKey> = {
  daily: 'layout.settings.freq.daily',
  weekly: 'layout.settings.freq.weekly',
  monthly: 'layout.settings.freq.monthly',
  yearly: 'layout.settings.freq.yearly',
}

const activeTemplates = computed(() => templates.all.filter((tpl) => tpl.active))

function describeTemplate(id: string) {
  const tpl = templates.all.find((x) => x.id === id)
  if (!tpl) return null
  const account = accounts.all.find((a) => a.id === tpl.accountId)
  const category = categories.byId(tpl.categoryId)
  const every = tpl.interval > 1 ? ` ${t('layout.settings.freq.every', { n: tpl.interval })}` : ''
  return {
    title: category?.name ?? '—',
    subtitle: `${account?.name ?? ''} · ${t(FREQ_LABEL_KEY[tpl.frequency])}${every}`,
    amount: formatMoney(tpl.type === 'expense' ? -tpl.amount : tpl.amount, tpl.currency, { currencyDisplay: account?.currencyDisplay }),
    color: category?.color ?? '#9a9a9e',
  }
}

async function removeTemplate(id: string) {
  if (confirm(t('layout.settings.removeTemplateConfirm'))) {
    await templates.remove(id)
  }
}

const showCurrencyPicker = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)
const mergeFileInput = ref<HTMLInputElement | null>(null)
const familyRestoreFileInput = ref<HTMLInputElement | null>(null)
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
    status.value = t('layout.settings.demoDataAdded')
  } finally {
    demoLoading.value = false
  }
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
        status.value = t('layout.settings.dataReset')
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
  status.value = t('layout.settings.backupSaved')
}

async function handleExportCsv() {
  await downloadTransactionsCsv()
  status.value = t('layout.settings.csvSaved')
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
    status.value = t('sync.restoreSuccess')
  } catch (err) {
    status.value = t('sync.importError', { message: (err as Error).message })
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
    status.value = t('sync.mergeSuccess')
  } catch (err) {
    status.value = t('sync.importError', { message: (err as Error).message })
  }
}

const familyBackupLoading = ref(false)

/** Owner-only "back up literally everyone" — see exportFamilyBackup()'s own doc comment for what's in the file and how it's meant to come back: either restored whole (handleFamilyRestoreFile below) or one member's own slice at a time (handleMergeFile above). */
async function handleFamilyBackup() {
  familyBackupLoading.value = true
  try {
    const payload = await exportFamilyBackup()
    downloadFamilyBackup(payload)
    status.value = t('layout.settings.familyBackupSaved')
  } catch (err) {
    status.value = t('sync.importError', { message: (err as Error).message })
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
 * dialog) since, unlike every other action on this screen, it writes data
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
          status.value = t('layout.settings.familyRestoreSuccess', { count: summary.transactions })
        } catch (err) {
          status.value = t('sync.importError', { message: (err as Error).message })
        } finally {
          familyRestoreLoading.value = false
          popups.closeConfirm()
        }
      },
    })
  } catch (err) {
    status.value = t('sync.importError', { message: (err as Error).message })
  }
}

const updateChecking = ref(false)
const updateStatus = ref('')

async function handleCheckUpdate() {
  updateChecking.value = true
  updateStatus.value = ''
  try {
    const result = await forceCheckForUpdate()
    if (result === 'up-to-date') updateStatus.value = t('layout.settings.upToDate')
    else if (result === 'error') updateStatus.value = t('layout.settings.updateCheckFailed')
    // 'updated' reloads the page on its own — there's no time left to show a status.
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
  <Modal :open="open" :title="t('layout.settings.title')" wide @close="emit('close')">
    <div class="section" v-if="!authStore.localMode">
      <h3 class="section-title">{{ t('layout.settings.section.profile') }}</h3>

      <div class="field profile-field" v-if="authStore.profile">
        <div class="profile-row">
          <img v-if="authStore.profile.photoURL" :src="authStore.profile.photoURL" class="avatar" alt="" />
          <div v-else class="avatar avatar-fallback" :style="{ background: authStore.profile.color }">
            {{ authStore.profile.displayName.slice(0, 1) }}
          </div>
          <div class="profile-text">
            <span class="profile-name">{{ authStore.profile.displayName }}</span>
            <span class="profile-email">{{ authStore.profile.email }}</span>
          </div>
          <button class="btn btn-secondary" @click="handleSignOut">{{ t('layout.settings.signOut') }}</button>
        </div>
      </div>

      <div class="field" v-if="authStore.isOwner">
        <label>{{ t('layout.settings.familyMembers') }}</label>
        <p class="hint">{{ t('layout.settings.familyMembersHint') }}</p>
        <button class="btn btn-secondary" @click="openAdmin">{{ t('layout.settings.manageMembers') }}</button>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">{{ t('server.settings.section') }}</h3>

      <div class="field">
        <template v-if="server.mode === 'remote'">
          <label>{{ t('server.settings.currentRemote') }}</label>
          <p class="server-url">{{ server.serverUrl }}</p>
          <p v-if="server.remoteConfig && !server.remoteConfig.features.receiptScanning" class="hint">
            {{ t('server.settings.receiptScanningOff') }}
          </p>
        </template>
        <template v-else>
          <label>{{ t('server.settings.currentLocal') }}</label>
          <p class="hint">{{ t('server.settings.goRemoteHint') }}</p>
        </template>

        <template v-if="!showServerChangeField">
          <div class="server-actions">
            <button class="btn btn-secondary" @click="openServerChange">
              {{ t('server.settings.changeButton') }}
            </button>
            <button v-if="server.mode === 'remote'" class="btn btn-secondary" @click="confirmGoLocal">
              {{ t('server.settings.goLocalButton') }}
            </button>
          </div>
        </template>
        <template v-else>
          <p class="hint">{{ t('server.settings.hint') }}</p>
          <label class="server-field-label">{{ t('server.settings.changeLabel') }}</label>
          <input
            v-model="newServerUrl"
            type="text"
            inputmode="url"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            :placeholder="t('server.setup.urlPlaceholder')"
            :disabled="switchingServer"
            class="server-url-input"
          />
          <div class="server-actions">
            <button class="btn btn-primary" :disabled="switchingServer || !newServerUrl.trim()" @click="confirmChangeServer">
              {{ switchingServer ? t('server.switching') : t('server.settings.changeButton') }}
            </button>
            <button class="btn btn-secondary" :disabled="switchingServer" @click="cancelServerChange">
              {{ t('common.cancel') }}
            </button>
          </div>
        </template>
        <p v-if="serverSwitchError" class="status error">{{ serverSwitchError }}</p>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">{{ t('layout.settings.section.appearance') }}</h3>

      <div class="field">
        <label>{{ t('layout.settings.theme') }}</label>
        <Segmented
          :model-value="settings.theme"
          :options="themeOptions"
          @update:model-value="(v) => settings.setTheme(v as AppSettings['theme'])"
        />
      </div>

      <div class="field">
        <label>{{ t('layout.settings.language') }}</label>
        <Segmented :model-value="localeSetting" :options="localeOptions" @update:model-value="(v) => chooseLocale(v as LocaleSetting)" />
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">{{ t('layout.settings.section.currencyFormats') }}</h3>

      <div class="field">
        <label>{{ t('layout.settings.baseCurrency') }}</label>
        <button class="btn btn-secondary currency-btn" @click="showCurrencyPicker = true">
          {{ settings.baseCurrency }}
        </button>
        <p class="hint">{{ t('layout.settings.baseCurrencyHint') }}</p>
      </div>

      <div class="field">
        <label>{{ t('layout.settings.currencyDisplay') }}</label>
        <button class="btn btn-secondary currency-btn" @click="showCurrencyDisplayPicker = true">
          {{ currencyDisplayLabel }}
        </button>
        <p class="hint">{{ t('layout.settings.currencyDisplayHint') }}</p>
      </div>

      <div class="field">
        <label>{{ t('layout.settings.numberFormat') }}</label>
        <button class="btn btn-secondary currency-btn" @click="showNumberFormatPicker = true">
          {{ numberFormatLabel }}
        </button>
      </div>

      <div class="field">
        <label>{{ t('layout.settings.dateFormat') }}</label>
        <button class="btn btn-secondary currency-btn" @click="showDateFormatPicker = true">
          {{ dateFormatLabel }}
        </button>
        <p class="hint">{{ t('layout.settings.dateFormatHint') }}</p>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">{{ t('layout.settings.section.data') }}</h3>

      <div class="field">
        <label>{{ t('layout.settings.recurringLabel', { count: activeTemplates.length }) }}</label>
        <p v-if="!activeTemplates.length" class="hint">{{ t('layout.settings.recurringEmpty') }}</p>
        <ul v-else class="template-list">
          <li v-for="tpl in activeTemplates" :key="tpl.id" class="template-row">
            <span class="dot" :style="{ background: describeTemplate(tpl.id)?.color }" />
            <div class="template-text">
              <span class="template-title">{{ describeTemplate(tpl.id)?.title }}</span>
              <span class="template-sub">{{ describeTemplate(tpl.id)?.subtitle }}</span>
            </div>
            <span class="template-amount">{{ describeTemplate(tpl.id)?.amount }}</span>
            <button class="icon-btn" :aria-label="t('common.delete')" @click="removeTemplate(tpl.id)">✕</button>
          </li>
        </ul>
      </div>

      <div class="field">
        <label>{{ t('layout.settings.demoDataLabel') }}</label>
        <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
        <template v-else>
          <p class="hint">{{ t('layout.settings.demoDataHint') }}</p>
          <p v-if="hasAnyData" class="hint">{{ t('layout.settings.demoDataBlocked') }}</p>
          <button class="btn btn-secondary demo-btn" :disabled="demoLoading || hasAnyData" @click="handleLoadDemo">
            {{ demoLoading ? t('layout.settings.addingDemo') : t('layout.settings.addDemoData') }}
          </button>
        </template>
      </div>

      <div class="field">
        <label>{{ t('layout.settings.backupLabel') }}</label>
        <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
        <template v-else>
          <p class="hint">{{ t('layout.settings.backupHint') }}</p>
          <div class="backup-actions">
            <button class="btn btn-secondary" @click="handleExport">{{ t('layout.settings.exportJson') }}</button>
            <button class="btn btn-secondary" @click="triggerImport">{{ t('layout.settings.importJson') }}</button>
            <button class="btn btn-secondary" @click="handleExportCsv">{{ t('layout.settings.exportCsv') }}</button>
          </div>
          <input ref="fileInput" type="file" accept="application/json" hidden @change="handleImportFile" />
          <p class="hint">{{ t('layout.settings.importMergeHint') }}</p>
          <div class="backup-actions">
            <button class="btn btn-secondary" @click="triggerMerge">{{ t('layout.settings.importJsonMerge') }}</button>
          </div>
          <input ref="mergeFileInput" type="file" accept="application/json" hidden @change="handleMergeFile" />
          <p v-if="status" class="status">{{ status }}</p>
        </template>
      </div>

      <div class="field" v-if="authStore.isOwner && !authStore.localMode">
        <label>{{ t('layout.settings.familyBackupLabel') }}</label>
        <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
        <template v-else>
          <p class="hint">{{ t('layout.settings.familyBackupHint') }}</p>
          <button class="btn btn-secondary family-backup-btn" :disabled="familyBackupLoading" @click="handleFamilyBackup">
            {{ familyBackupLoading ? t('layout.settings.familyBackupLoading') : t('layout.settings.familyBackupButton') }}
          </button>
          <p class="hint">{{ t('layout.settings.familyRestoreHint') }}</p>
          <button class="btn btn-secondary family-backup-btn" :disabled="familyRestoreLoading" @click="triggerFamilyRestore">
            {{ familyRestoreLoading ? t('layout.settings.familyRestoreLoading') : t('layout.settings.familyRestoreButton') }}
          </button>
          <input ref="familyRestoreFileInput" type="file" accept="application/json" hidden @change="handleFamilyRestoreFile" />
        </template>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">{{ t('layout.settings.section.app') }}</h3>

      <div class="field">
        <label>{{ t('layout.settings.updateLabel') }}</label>
        <p class="hint">{{ t('layout.settings.updateHint') }}</p>
        <button class="btn btn-secondary" :disabled="updateChecking" @click="handleCheckUpdate">
          {{ updateChecking ? t('layout.settings.checking') : t('layout.settings.checkUpdate') }}
        </button>
        <p v-if="updateStatus" class="status">{{ updateStatus }}</p>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">{{ t('layout.settings.section.danger') }}</h3>

      <div class="field">
        <label>{{ t('layout.settings.resetLabel') }}</label>
        <p v-if="viewingOther" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
        <template v-else>
          <p class="hint">{{ t('layout.settings.resetHint') }}</p>
          <button class="btn btn-danger reset-btn" :disabled="resetLoading" @click="openResetConfirm">
            {{ resetLoading ? t('layout.settings.resetting') : t('layout.settings.resetButton') }}
          </button>
        </template>
      </div>
    </div>
  </Modal>

  <CurrencyPickerModal
    :open="showCurrencyPicker"
    :selected="settings.baseCurrency"
    :title="t('layout.settings.currencyModalTitle')"
    :hint="t('layout.settings.currencyModalHint')"
    @close="showCurrencyPicker = false"
    @select="settings.setBaseCurrency"
  />

  <OptionListModal
    :open="showCurrencyDisplayPicker"
    :title="t('layout.settings.currencyDisplay')"
    :options="currencyDisplayOptions"
    :selected="currencyDisplaySetting"
    @close="showCurrencyDisplayPicker = false"
    @select="chooseCurrencyDisplay"
  />

  <OptionListModal
    :open="showNumberFormatPicker"
    :title="t('layout.settings.numberFormat')"
    :options="numberFormatOptions"
    :selected="numberFormatSetting"
    @close="showNumberFormatPicker = false"
    @select="chooseNumberFormat"
  />

  <OptionListModal
    :open="showDateFormatPicker"
    :title="t('layout.settings.dateFormat')"
    :options="dateFormatOptions"
    :selected="dateFormatSetting"
    @close="showDateFormatPicker = false"
    @select="chooseDateFormat"
  />
</template>

<style lang="scss" scoped>
.section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.section:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.section-title {
  font-size: 14px;
  margin: 0 0 12px;
  color: var(--text-primary);
}

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
  text-transform: uppercase;
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

.currency-btn {
  width: 100%;
}

.server-url {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 2px 0 0;
  word-break: break-all;
}

.server-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}
.server-actions .btn {
  flex: 1;
  min-width: 140px;
}

.server-field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 10px;
}

.server-url-input {
  width: 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 14px;
}

.server-url-input:disabled {
  opacity: 0.6;
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
.family-backup-btn {
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

.status.error {
  color: var(--expense);
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
