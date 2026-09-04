<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useAccountsStore } from '../../stores/accounts'
import { useSettingsStore } from '../../stores/settings'
import { useAuthStore } from '../../stores/auth'
import { useViewAsStore } from '../../stores/viewAs'
import { useProfilesStore } from '../../stores/profiles'
import { useLatestRun } from '../../composables/useLatestRun'
import { useCountUp } from '../../composables/useCountUp'
import { formatMoney } from '../../utils/format'
import { t } from '../../i18n'
import MdiIcon from '../common/MdiIcon.vue'
import CurrencyPickerModal from './CurrencyPickerModal.vue'
import SearchModal from './SearchModal.vue'
import SettingsModal from './SettingsModal.vue'
import UserSwitcherModal from './UserSwitcherModal.vue'
import SyncStatusBadge from './SyncStatusBadge.vue'

const accounts = useAccountsStore()
const settings = useSettingsStore()
const authStore = useAuthStore()
const viewAs = useViewAsStore()
const profiles = useProfilesStore()

// What the avatar button itself shows: the profile currently being browsed
// (self by default), or null in "Всі" mode where a group icon takes its place.
const avatarProfile = computed(() => (viewAs.mode === 'user' ? profiles.byId(viewAs.effectiveUid) : authStore.profile))

const totalBalance = ref<number | null>(null)
const totalBalanceGuard = useLatestRun()
watchEffect(async () => {
  const run = totalBalanceGuard.start()
  const value = await accounts.totalBalanceInBase(settings.baseCurrency)
  if (!totalBalanceGuard.isCurrent(run)) return // a newer recompute started meanwhile (e.g. another profile's data arrived) — discard
  totalBalance.value = value
})
const animatedTotalBalance = useCountUp(totalBalance)

const showSearch = ref(false)
const showCurrencyPicker = ref(false)
const showSettings = ref(false)
const showUserSwitcher = ref(false)

const viewingLabel = computed(() => {
  if (viewAs.mode === 'all') return t('layout.header.viewingAll')
  if (viewAs.mode === 'user') return avatarProfile.value?.displayName ?? t('layout.header.viewingOther')
  return null
})
</script>

<template>
  <header class="top-header">
    <div class="header-row">
      <button class="icon-btn avatar-btn" :aria-label="t('layout.header.switchUserAria')" @click="showUserSwitcher = true">
        <MdiIcon v-if="viewAs.mode === 'all'" name="mdiAccountGroup" :size="22" />
        <img v-else-if="avatarProfile?.photoURL" :src="avatarProfile.photoURL" class="avatar-img" alt="" />
        <span v-else class="avatar-fallback" :style="{ background: avatarProfile?.color ?? 'var(--accent)' }">
          {{ (avatarProfile?.displayName ?? '?').slice(0, 1) }}
        </span>
      </button>
      <button class="icon-btn" :aria-label="t('layout.header.settingsAria')" @click="showSettings = true">
        <MdiIcon name="mdiCogOutline" :size="26" />
      </button>
      <div class="balance-wrap">
        <button class="balance" @click="showCurrencyPicker = true">
          <span class="label">
            {{ t('layout.header.allAccounts') }}
            <MdiIcon name="mdiChevronDown" :size="13" color="var(--text-secondary)" />
          </span>
          <span class="value" :class="{ negative: (totalBalance ?? 0) < 0 }">
            {{ totalBalance === null ? '…' : formatMoney(animatedTotalBalance ?? 0, settings.baseCurrency) }}
          </span>
        </button>
      </div>
      <SyncStatusBadge />
      <button class="icon-btn" :aria-label="t('layout.header.searchAria')" @click="showSearch = true">
        <MdiIcon name="mdiMagnify" :size="24" />
      </button>
    </div>

    <button v-if="viewingLabel" class="viewing-banner" @click="viewAs.viewSelf()">
      <MdiIcon name="mdiEyeOutline" :size="14" />
      <span>{{ viewingLabel }}{{ t('layout.header.readOnlySuffix') }}</span>
      <span class="viewing-banner-back">{{ t('layout.header.backToSelf') }}</span>
    </button>
  </header>

  <CurrencyPickerModal
    :open="showCurrencyPicker"
    :selected="settings.baseCurrency"
    :title="t('layout.header.currencyModalTitle')"
    @close="showCurrencyPicker = false"
    @select="settings.setBaseCurrency"
  />
  <SearchModal :open="showSearch" @close="showSearch = false" />
  <SettingsModal :open="showSettings" @close="showSettings = false" />
  <UserSwitcherModal :open="showUserSwitcher" @close="showUserSwitcher = false" />
</template>

<style lang="scss" scoped>
.top-header {
  background: var(--page-bg);
  padding: 14px 12px 10px;
  z-index: 30;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-primary);
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  @include transition();
}

.icon-btn:active {
  transform: scale(0.88);
}

.avatar-btn {
  padding: 0;
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
}

.viewing-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 10px;
  padding: 7px 10px;
  border: none;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.viewing-banner-back {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.balance-wrap {
  flex: 1;
  min-width: 0;
}

.balance {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px 6px;
  width: 100%;
  min-width: 0;
  @include transition();
}

.balance:active {
  transform: scale(0.96);
}

.balance .label {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
}

.balance .value {
  font-size: 18px;
  font-weight: 700;
  max-width: 100%;
  @include lineClamp(1);
}

.balance .value.negative {
  color: var(--expense);
}
</style>
