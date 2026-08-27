<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { liveQuery } from 'dexie'
import { db } from '../db/schema'
import { pullAllAccounts, pullAllTransactions } from '../db/sync'
import { useAuthStore } from '../stores/auth'
import { useProfilesStore } from '../stores/profiles'
import { useDisplayCurrencyStore } from '../stores/displayCurrency'
import { computeAccountBalance } from '../stores/accounts'
import { convertLatest } from '../db/exchangeRates'
import { useLatestRun } from '../composables/useLatestRun'
import { useCountUp } from '../composables/useCountUp'
import { formatMoney } from '../utils/format'
import MdiIcon from '../components/common/MdiIcon.vue'
import type { Account, Transaction } from '../types/models'

const authStore = useAuthStore()
const profiles = useProfilesStore()
const displayCurrency = useDisplayCurrencyStore()

// Whole-table Dexie liveQuery views (own + every other family member's
// accounts/transactions live in the same tables — see src/db/sync.ts's
// pullAllAccounts/pullAllTransactions), scoped to this view's lifetime only.
const allAccounts = ref<Account[]>([])
const allTransactions = ref<Transaction[]>([])
// Tracked separately (not a single `loaded` flag) so the total isn't computed
// off accounts alone the moment that listener fires first — that flashed a
// wrong "initial balances only" total for the instant before transactions
// arrived and it recomputed to the real number.
const accountsLoaded = ref(false)
const transactionsLoaded = ref(false)
const loaded = computed(() => accountsLoaded.value && transactionsLoaded.value)

let subAccounts: { unsubscribe: () => void } | null = null
let subTransactions: { unsubscribe: () => void } | null = null

onMounted(() => {
  subAccounts = liveQuery(() => db.accounts.toArray()).subscribe({
    next: (rows) => {
      allAccounts.value = rows
      accountsLoaded.value = true
    },
    error: (error) => console.error('[TotalBalanceView] accounts liveQuery failed', error),
  })
  subTransactions = liveQuery(() => db.transactions.toArray()).subscribe({
    next: (rows) => {
      allTransactions.value = rows
      transactionsLoaded.value = true
    },
    error: (error) => console.error('[TotalBalanceView] transactions liveQuery failed', error),
  })
  void pullAllAccounts(authStore.uid)
  void pullAllTransactions(authStore.uid)
})

onUnmounted(() => {
  subAccounts?.unsubscribe()
  subTransactions?.unsubscribe()
})

interface ProfileTotal {
  uid: string
  name: string
  color: string
  photoURL: string | null
  total: number
}

const breakdown = ref<ProfileTotal[]>([])
const grandTotal = ref(0)
const computing = ref(false)

// A run only commits its result if it's still the latest one when its awaits
// resolve (see useLatestRun) — without this, two overlapping runs (e.g. the
// accounts and transactions listeners each firing again in quick succession,
// or another profile's data arriving mid-computation) can interleave and the
// slower-finishing one — not necessarily the one with the newest data — wins,
// which looked like the total recalculating/flickering on its own.
const computeGuard = useLatestRun()

watch(
  [allAccounts, allTransactions, () => displayCurrency.effective, () => profiles.all],
  async () => {
    if (!accountsLoaded.value || !transactionsLoaded.value) return
    const run = computeGuard.start()
    computing.value = true
    const target = displayCurrency.effective
    const byOwner = new Map<string, Account[]>()
    for (const account of allAccounts.value) {
      if (!account.includeInTotal) continue
      const arr = byOwner.get(account.ownerId) ?? []
      arr.push(account)
      byOwner.set(account.ownerId, arr)
    }

    const results: ProfileTotal[] = []
    let grand = 0
    for (const [uid, accts] of byOwner) {
      let sum = 0
      for (const account of accts) {
        const related = allTransactions.value.filter(
          (t) => t.accountId === account.id || t.toAccountId === account.id,
        )
        const native = computeAccountBalance(account, related)
        sum += await convertLatest(native, account.currency, target)
      }
      const profile = profiles.byId(uid)
      results.push({
        uid,
        name: profile?.displayName ?? 'Профіль',
        color: profile?.color ?? '#9a9a9e',
        photoURL: profile?.photoURL ?? null,
        total: sum,
      })
      grand += sum
    }

    if (!computeGuard.isCurrent(run)) return // a newer run started while this one was awaiting rates — discard
    breakdown.value = results.sort((a, b) => b.total - a.total)
    grandTotal.value = grand
    computing.value = false
  },
  { immediate: true },
)

const animatedGrandTotal = useCountUp(grandTotal)

/** Each profile's share of the combined household total, for the proportion bar under its row. */
function sharePct(total: number): number {
  if (grandTotal.value <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((total / grandTotal.value) * 100)))
}
</script>

<template>
  <div class="view">
    <h1 class="page-title">Разом по всіх профілях</h1>

    <div class="grand-total-card" :class="{ computing }">
      <div class="grand-icon"><MdiIcon name="mdiAccountGroup" :size="22" color="var(--accent)" /></div>
      <span class="label">Загальний баланс</span>
      <span class="value" :class="{ negative: grandTotal < 0 }">
        {{ !loaded ? '…' : formatMoney(animatedGrandTotal ?? 0, displayCurrency.effective) }}
      </span>
    </div>

    <TransitionGroup tag="div" name="row" class="breakdown">
      <div v-for="p in breakdown" :key="p.uid" class="profile-row" :class="{ computing }">
        <img v-if="p.photoURL" :src="p.photoURL" class="avatar" alt="" />
        <div v-else class="avatar avatar-fallback" :style="{ background: p.color }">
          {{ p.name.slice(0, 1).toUpperCase() }}
        </div>
        <div class="profile-mid">
          <div class="profile-top">
            <span class="profile-name">{{ p.name }}</span>
            <span class="profile-total" :class="{ negative: p.total < 0 }">
              {{ formatMoney(p.total, displayCurrency.effective) }}
            </span>
          </div>
          <div class="profile-track">
            <div class="profile-fill" :style="{ width: `${sharePct(p.total)}%`, background: p.color }" />
          </div>
        </div>
      </div>

      <p v-if="loaded && !breakdown.length" key="empty" class="empty">
        Ще немає рахунків, які враховуються в загальному балансі.
      </p>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.view {
  padding: 8px 16px 90px;
  max-width: 640px;
  margin: 0 auto;
}

.page-title {
  font-size: 20px;
  margin: 8px 0 20px;
}

.grand-total-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 24px;
  margin-bottom: 20px;
  transition: opacity 0.25s ease;
}

.grand-total-card.computing {
  opacity: 0.55;
}

.grand-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  margin-bottom: 4px;
}

.grand-total-card .label {
  font-size: 13px;
  color: var(--text-secondary);
}

.grand-total-card .value {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.grand-total-card .value.negative {
  color: var(--expense);
}

.breakdown {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.profile-row.computing {
  opacity: 0.55;
}

.avatar {
  width: 36px;
  height: 36px;
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
  font-size: 14px;
}

.profile-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.profile-name {
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-total {
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}

.profile-total.negative {
  color: var(--expense);
}

.profile-track {
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  overflow: hidden;
}

.profile-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  transition: width 0.5s ease;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
  margin-top: 24px;
}

.row-move,
.row-enter-active,
.row-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.row-enter-from,
.row-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.row-leave-active {
  position: absolute;
}
</style>
