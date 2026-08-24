<script setup lang="ts">
import { ref, watch, watchEffect } from 'vue'
import TopHeader from './components/layout/TopHeader.vue'
import BottomNav from './components/layout/BottomNav.vue'
import SideNav from './components/layout/SideNav.vue'
import LoginView from './views/LoginView.vue'
import UpdateToast from './components/common/UpdateToast.vue'
import { seedDefaultsIfEmpty } from './db/seed'
import { useAuthStore } from './stores/auth'
import { useProfilesStore } from './stores/profiles'
import { useAllAccountsStore } from './stores/allAccounts'
import { useSettingsStore } from './stores/settings'
import { useAccountsStore } from './stores/accounts'
import { useCategoriesStore } from './stores/categories'
import { useTransactionsStore } from './stores/transactions'
import { useTemplatesStore } from './stores/templates'
import { useBudgetsStore } from './stores/budgets'

const authStore = useAuthStore()
const profiles = useProfilesStore()
const allAccounts = useAllAccountsStore()
const settings = useSettingsStore()
const accounts = useAccountsStore()
const categories = useCategoriesStore()
const transactions = useTransactionsStore()
const templates = useTemplatesStore()
const budgets = useBudgetsStore()

const dataReady = ref(false)

function resetAllStores() {
  settings.reset()
  accounts.reset()
  categories.reset()
  transactions.reset()
  templates.reset()
  budgets.reset()
  profiles.reset()
  allAccounts.reset()
  dataReady.value = false
}

async function loadForCurrentUser(uid: string) {
  dataReady.value = false
  await seedDefaultsIfEmpty(uid)
  await Promise.all([
    settings.load(),
    accounts.load(),
    categories.load(),
    transactions.load(),
    templates.load(),
    budgets.load(),
    profiles.load(),
    allAccounts.load(),
  ])
  await templates.runDueGeneration()
  dataReady.value = true
}

// Re-runs whenever auth resolves or the signed-in profile changes (sign-in,
// sign-out, or switching Google accounts) — always resetting listeners first
// so no stale data from a previous profile leaks into the new one. Keyed off
// `authStore.profile` (not the raw Firebase user) on purpose: Firebase Auth
// resolves before GET /api/auth/me has confirmed this email is provisioned
// in `users` — starting data loads that early would race that check (and,
// for a not-yet-provisioned email, never resolve `profile` at all).
watch(
  () => [authStore.ready, authStore.profile?.uid ?? null] as const,
  ([ready, uid]) => {
    resetAllStores()
    if (ready && uid) loadForCurrentUser(uid)
  },
  { immediate: true },
)

watchEffect(() => {
  document.documentElement.setAttribute('data-theme', settings.theme === 'system' ? '' : settings.theme)
})
</script>

<template>
  <div v-if="!authStore.ready" class="boot-splash">Завантаження…</div>
  <LoginView v-else-if="!authStore.user || !authStore.profile" />
  <div class="app-shell" v-else-if="dataReady">
    <SideNav class="side-nav-slot" />
    <div class="main-column">
      <TopHeader />
      <main class="app-content">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
      <BottomNav class="bottom-nav-slot" />
    </div>
  </div>
  <div v-else class="boot-splash">Завантаження…</div>
  <UpdateToast />
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  background: var(--page-bg);
}

.main-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-content {
  flex: 1;
  padding-bottom: 8px;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.side-nav-slot {
  display: none;
}

.boot-splash {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: var(--text-muted);
}

@media (min-width: 900px) {
  .side-nav-slot {
    display: flex;
  }
  .bottom-nav-slot {
    display: none;
  }
  .main-column {
    max-width: 1000px;
    margin: 0 auto;
    width: 100%;
  }
}
</style>
