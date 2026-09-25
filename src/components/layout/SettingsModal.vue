<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../common/Modal.vue'
import CurrencyPickerModal from './CurrencyPickerModal.vue'
import LanguagePickerModal from './LanguagePickerModal.vue'
import OptionListModal, { type ListOption } from '../common/OptionListModal.vue'
import Segmented from '../common/Segmented.vue'
import { useSettingsStore } from '../../stores/settings'
import { useCategoriesStore } from '../../stores/categories'
import { useAuthStore } from '../../stores/auth'
import { useTagsStore } from '../../stores/tags'
import { useServerStore } from '../../stores/server'
import { useChangeServer } from '../../composables/useChangeServer'
import {
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
import { t, getLocaleSetting, setLocaleSetting, detectLocale, LOCALE_NAMES, localeFlagUrl } from '../../i18n'
import type { LocaleSetting, Locale } from '../../i18n'
import type { AppSettings } from '../../types/models'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const categories = useCategoriesStore()
const authStore = useAuthStore()
const tags = useTagsStore()
const server = useServerStore()

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

// Per-device, not part of `settings` (see i18n/locale.ts) — applies live
// (setLocaleSetting no longer reloads the page), but this component sets
// `.value` itself the instant a choice is made (below) rather than deriving
// it from anything reactive, so it only ever needs its initial value here.
const localeSetting = ref<LocaleSetting>(getLocaleSetting())

/**
 * Switches the app language immediately (`setLocaleSetting` applies live —
 * see its own doc comment), then catches up every still-factory default
 * category's name to match in the background — see stores/categories.ts's
 * `retranslateDefaults` for what counts as "still factory" vs.
 * user-customized. Ordered this way (language first, categories after) now
 * that neither step is racing a reload: the language switch stays snappy,
 * and `retranslateDefaults` is itself reactive (Pinia), so renamed
 * categories just pop in moments later.
 */
async function chooseLocale(value: LocaleSetting) {
  localeSetting.value = value
  showLanguagePicker.value = false
  const nextLocale = value === 'system' ? detectLocale() : value
  setLocaleSetting(value)
  await categories.retranslateDefaults(nextLocale)
}

// What the language field's button itself shows — the effective locale even
// while `localeSetting` is 'system' (so its flag/name reflect what "Системна"
// actually resolves to right now), and the label swaps to "Системна" only in
// that one case.
const effectiveDisplayLocale = computed<Locale>(() => (localeSetting.value === 'system' ? detectLocale() : localeSetting.value))
const languageButtonLabel = computed(() =>
  localeSetting.value === 'system' ? t('layout.settings.languageSystem') : LOCALE_NAMES[localeSetting.value],
)
const showLanguagePicker = ref(false)

const themeOptions = computed(() => [
  { value: 'system', label: t('layout.settings.themeSystem') },
  { value: 'light', label: t('layout.settings.themeLight') },
  { value: 'dark', label: t('layout.settings.themeDark') },
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

const showCurrencyPicker = ref(false)

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

function openTags() {
  emit('close')
  router.push('/tags')
}

function openData() {
  emit('close')
  router.push('/data')
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
        <button type="button" class="btn btn-secondary currency-btn language-btn" @click="showLanguagePicker = true">
          <img :src="localeFlagUrl(effectiveDisplayLocale)" class="flag-inline" alt="" width="20" height="20" />
          {{ languageButtonLabel }}
        </button>
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
      <h3 class="section-title">{{ t('layout.settings.section.tags') }}</h3>

      <div class="field">
        <label>{{ t('layout.settings.tagsLabel', { count: tags.all.length }) }}</label>
        <p class="hint">{{ t('layout.settings.tagsHint') }}</p>
        <button class="btn btn-secondary" @click="openTags">{{ t('layout.settings.manageTags') }}</button>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">{{ t('layout.settings.section.data') }}</h3>

      <div class="field">
        <p class="hint">{{ t('layout.settings.dataHint') }}</p>
        <button class="btn btn-secondary" @click="openData">{{ t('layout.settings.manageData') }}</button>
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
  </Modal>

  <CurrencyPickerModal
    :open="showCurrencyPicker"
    :selected="settings.baseCurrency"
    :title="t('layout.settings.currencyModalTitle')"
    :hint="t('layout.settings.currencyModalHint')"
    @close="showCurrencyPicker = false"
    @select="settings.setBaseCurrency"
  />

  <LanguagePickerModal
    :open="showLanguagePicker"
    :selected="localeSetting"
    @close="showLanguagePicker = false"
    @select="chooseLocale"
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

.language-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.flag-inline {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
  flex-shrink: 0;
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

.status {
  font-size: 13px;
  color: var(--income);
  margin-top: 8px;
}

.status.error {
  color: var(--expense);
}

</style>
