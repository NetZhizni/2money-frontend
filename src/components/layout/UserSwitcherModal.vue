<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { liveQuery } from 'dexie'
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { db } from '../../db/schema'
import { pullAllAccounts, pullAllTransactions } from '../../db/sync'
import { useAuthStore } from '../../stores/auth'
import { useProfilesStore } from '../../stores/profiles'
import { useViewAsStore } from '../../stores/viewAs'
import { useDisplayCurrencyStore } from '../../stores/displayCurrency'
import { computeAccountBalance } from '../../stores/accounts'
import { convertLatest } from '../../db/exchangeRates'
import { useLatestRun } from '../../composables/useLatestRun'
import { useCountUp } from '../../composables/useCountUp'
import { formatMoney } from '../../utils/format'
import type { Account, Profile, Transaction } from '../../types/models'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const authStore = useAuthStore()
const profiles = useProfilesStore()
const viewAs = useViewAsStore()
const displayCurrency = useDisplayCurrencyStore()

// The family directory (profiles.all) already includes the signed-in user
// themselves — pinned to the top and labeled "Ви" instead of appearing as
// just another row.
const others = computed(() => profiles.all.filter((p) => p.uid !== authStore.uid))

function isSelected(uid: string): boolean {
  return viewAs.mode === 'user' ? viewAs.effectiveUid === uid : viewAs.mode === 'self' && uid === authStore.uid
}

function select(profile: Profile) {
  if (profile.uid === authStore.uid) viewAs.viewSelf()
  else viewAs.viewUser(profile.uid)
  emit('close')
}

function selectAll() {
  viewAs.viewAll()
  emit('close')
}

// Per-profile household totals — moved in from the former "Разом" tab so the
// balance breakdown lives right where you pick who to view. Whole-table
// Dexie liveQuery views (own + every other family member's
// accounts/transactions live in the same tables — see src/db/sync.ts's
// pullAllAccounts/pullAllTransactions), scoped to this modal's lifetime only.
const allAccounts = ref<Account[]>([])
const allTransactions = ref<Transaction[]>([])
// Tracked separately (not a single `loaded` flag) so totals aren't computed
// off accounts alone the moment that listener fires first.
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
    error: (error) => console.error('[UserSwitcherModal] accounts liveQuery failed', error),
  })
  subTransactions = liveQuery(() => db.transactions.toArray()).subscribe({
    next: (rows) => {
      allTransactions.value = rows
      transactionsLoaded.value = true
    },
    error: (error) => console.error('[UserSwitcherModal] transactions liveQuery failed', error),
  })
  void pullAllAccounts()
  void pullAllTransactions()
})

onUnmounted(() => {
  subAccounts?.unsubscribe()
  subTransactions?.unsubscribe()
})

// This component now stays permanently mounted (see the `open` prop), so the
// mount-time pull above only ever runs once — re-pull on every open too, to
// keep showing each open with as fresh a sync as before.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    void pullAllAccounts()
    void pullAllTransactions()
  },
)

const totalsByUid = ref(new Map<string, number>())
const grandTotal = ref(0)
const computing = ref(false)

// A run only commits its result if it's still the latest one when its awaits
// resolve (see useLatestRun) — without this, overlapping runs (e.g. the
// accounts and transactions listeners each firing again in quick succession)
// can interleave and the slower-finishing one wins, which looked like totals
// recalculating/flickering on their own.
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

    const results = new Map<string, number>()
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
      results.set(uid, sum)
      grand += sum
    }

    if (!computeGuard.isCurrent(run)) return // a newer run started while this one was awaiting rates — discard
    totalsByUid.value = results
    grandTotal.value = grand
    computing.value = false
  },
  { immediate: true },
)

const animatedGrandTotal = useCountUp(grandTotal)

function totalFor(uid: string): number {
  return totalsByUid.value.get(uid) ?? 0
}

/** Each profile's share of the combined household total, for the proportion bar under its row. */
function sharePct(uid: string): number {
  if (grandTotal.value <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((totalFor(uid) / grandTotal.value) * 100)))
}
</script>

<template>
  <Modal :open="open" title="Переглянути як" @close="emit('close')">
    <p class="hint">
      Оберіть користувача, щоб переглянути Рахунки, Категорії, Операції та Огляд від його імені (лише для читання),
      або «Всі», щоб побачити дані родини разом.
    </p>

    <div class="list">
      <button class="row" :class="{ active: viewAs.mode === 'all' }" @click="selectAll">
        <span class="avatar avatar-fallback all-icon">
          <MdiIcon name="mdiAccountGroup" :size="20" color="#fff" />
        </span>
        <span class="row-mid">
          <span class="row-top">
            <span class="name">Всі</span>
            <span class="amount" :class="{ negative: grandTotal < 0, computing }">
              {{ !loaded ? '…' : formatMoney(animatedGrandTotal ?? 0, displayCurrency.effective) }}
            </span>
          </span>
        </span>
        <MdiIcon v-if="viewAs.mode === 'all'" name="mdiCheck" :size="18" color="var(--accent)" />
      </button>

      <button
        v-if="authStore.profile"
        class="row"
        :class="{ active: isSelected(authStore.profile.uid) }"
        @click="select(authStore.profile)"
      >
        <img v-if="authStore.profile.photoURL" :src="authStore.profile.photoURL" class="avatar" alt="" />
        <span v-else class="avatar avatar-fallback" :style="{ background: authStore.profile.color }">
          {{ authStore.profile.displayName.slice(0, 1).toUpperCase() }}
        </span>
        <span class="row-mid">
          <span class="row-top">
            <span class="name">{{ authStore.profile.displayName }}</span>
            <span class="you-tag">Ви</span>
            <span class="amount" :class="{ negative: totalFor(authStore.profile.uid) < 0, computing }">
              {{ !loaded ? '…' : formatMoney(totalFor(authStore.profile.uid), displayCurrency.effective) }}
            </span>
          </span>
          <span class="row-track">
            <span
              class="row-fill"
              :style="{ width: `${sharePct(authStore.profile.uid)}%`, background: authStore.profile.color }"
            />
          </span>
        </span>
        <MdiIcon v-if="isSelected(authStore.profile.uid)" name="mdiCheck" :size="18" color="var(--accent)" />
      </button>

      <button v-for="p in others" :key="p.uid" class="row" :class="{ active: isSelected(p.uid) }" @click="select(p)">
        <img v-if="p.photoURL" :src="p.photoURL" class="avatar" alt="" />
        <span v-else class="avatar avatar-fallback" :style="{ background: p.color }">
          {{ p.displayName.slice(0, 1).toUpperCase() }}
        </span>
        <span class="row-mid">
          <span class="row-top">
            <span class="name">{{ p.displayName }}</span>
            <span class="amount" :class="{ negative: totalFor(p.uid) < 0, computing }">
              {{ !loaded ? '…' : formatMoney(totalFor(p.uid), displayCurrency.effective) }}
            </span>
          </span>
          <span class="row-track">
            <span class="row-fill" :style="{ width: `${sharePct(p.uid)}%`, background: p.color }" />
          </span>
        </span>
        <MdiIcon v-if="isSelected(p.uid)" name="mdiCheck" :size="18" color="var(--accent)" />
      </button>

      <p v-if="!others.length" class="empty">Інших учасників родини ще немає.</p>
    </div>
  </Modal>
</template>

<style scoped>
.hint {
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 0 0 14px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  background: none;
  padding: 10px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
}

.row:active {
  background: var(--surface-2);
}

.row.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.avatar {
  width: 38px;
  height: 38px;
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

.all-icon {
  background: var(--accent);
}

.row-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.name {
  min-width: 0;
  flex: 1;
  font-size: 14.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.you-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-2);
  border-radius: var(--radius-pill);
  padding: 3px 8px;
  flex-shrink: 0;
}

.amount {
  font-size: 13.5px;
  font-weight: 700;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  transition: opacity 0.25s ease;
}

.amount.negative {
  color: var(--expense);
}

.amount.computing {
  opacity: 0.55;
}

.row-track {
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  overflow: hidden;
}

.row-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  transition: width 0.5s ease;
}

.empty {
  color: var(--text-muted);
  font-size: 13px;
  padding: 8px;
}
</style>
