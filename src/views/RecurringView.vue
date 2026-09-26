<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import IconCircle from '../components/common/IconCircle.vue'
import RecurringFormModal from '../components/recurring/RecurringFormModal.vue'
import { useTemplatesStore } from '../stores/templates'
import { useAccountsStore } from '../stores/accounts'
import { useAllAccountsStore } from '../stores/allAccounts'
import { useCategoriesStore } from '../stores/categories'
import { useViewAsStore } from '../stores/viewAs'
import { usePopupsStore } from '../stores/popups'
import { useBaseCurrency } from '../composables/useBaseCurrency'
import { isFinished, occurrencesBetween, scheduledNext } from '../db/recurring'
import { endOfMonth, formatDate, formatMoney } from '../utils/format'
import { TRANSFER_CATEGORY_COLOR } from '../utils/transferAnalytics'
import { recurrenceLabel } from '../utils/recurrence'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'
import type { RecurringTemplate } from '../types/models'

// Everything about recurring templates in one place: occurrences waiting
// for a requireConfirm template to be booked or skipped, what's coming up
// and where that leaves this month's balance, and the templates themselves
// (create/edit/pause/delete). Templates are always the signed-in profile's
// own (see stores/templates.ts), so this page stays out of "view as" mode
// entirely rather than mixing their templates with someone else's accounts.

const DAY_MS = 24 * 60 * 60 * 1000
const UPCOMING_DAYS = 30

const templates = useTemplatesStore()
const accounts = useAccountsStore()
const allAccounts = useAllAccountsStore()
const categories = useCategoriesStore()
const viewAs = useViewAsStore()
const popups = usePopupsStore()
const baseCurrency = useBaseCurrency()

const readOnly = computed(() => viewAs.isReadOnly)
// Read once per visit: a page left open past midnight is refreshed by
// visiting it again, same as the rest of the app's "today".
const now = Date.now()

function describe(tpl: RecurringTemplate) {
  const account = allAccounts.byId(tpl.accountId)
  if (tpl.type === 'transfer') {
    const to = allAccounts.byId(tpl.toAccountId)
    return {
      title: `${account?.name ?? '?'} → ${to?.name ?? '?'}`,
      icon: account?.icon ?? 'mdiSwapHorizontal',
      color: account?.color ?? TRANSFER_CATEGORY_COLOR,
      square: true,
    }
  }
  const category = categories.byId(tpl.categoryId)
  const sub = tpl.subcategoryId ? categories.byId(tpl.subcategoryId) : undefined
  return {
    title: [category?.name ?? '?', sub?.name].filter(Boolean).join(' · '),
    icon: category?.icon ?? 'mdiShapeOutline',
    color: category?.color ?? '#9a9a9e',
    square: false,
  }
}

function amountLabel(tpl: RecurringTemplate): string {
  const signed = tpl.type === 'expense' ? -tpl.amount : tpl.amount
  return formatMoney(signed, tpl.currency, { signed: tpl.type !== 'transfer', currencyDisplay: allAccounts.byId(tpl.accountId)?.currencyDisplay })
}

// ---------- waiting for confirmation ----------

const dueRows = computed(() =>
  templates.all
    .filter((tpl) => tpl.active && tpl.requireConfirm && scheduledNext(tpl) <= now)
    .map((tpl) => ({ tpl, date: scheduledNext(tpl), count: occurrencesBetween(tpl, -Infinity, now).length, ...describe(tpl) }))
    .sort((a, b) => a.date - b.date),
)

function book(tpl: RecurringTemplate, date: number) {
  popups.openTransactionForm({
    presetType: tpl.type,
    presetAccountId: tpl.accountId,
    presetToAccountId: tpl.toAccountId,
    presetCategoryId: tpl.subcategoryId ?? tpl.categoryId,
    presetAmount: tpl.amount,
    presetToAmount: tpl.toAmount ?? undefined,
    presetNote: tpl.note,
    presetDate: date,
    presetTagIds: tpl.tagIds,
    occurrence: { templateId: tpl.id, date },
  })
}

async function skip(tpl: RecurringTemplate, date: number) {
  await templates.passOccurrence(tpl.id, date)
}

// ---------- coming up + this month's forecast ----------

const upcomingRows = computed(() => {
  const until = now + UPCOMING_DAYS * DAY_MS
  return templates.all
    .flatMap((tpl) => occurrencesBetween(tpl, now + 1, until).map((date) => ({ tpl, date, ...describe(tpl) })))
    .sort((a, b) => a.date - b.date)
})

/** Whether an account's money counts toward the total balance — the same rule stores/accounts.ts's totalBalanceInBase uses. */
function counted(accountId: string | undefined): boolean {
  const account = accountId ? accounts.all.find((a) => a.id === accountId) : undefined
  return !!account && account.includeInTotal
}

const forecast = computed(() => {
  const today = new Date(now)
  const monthEnd = endOfMonth(today.getFullYear(), today.getMonth())
  let current = 0
  for (const account of accounts.all) {
    if (account.includeInTotal) current += baseCurrency.toBase(accounts.balanceOf(account), account.currency)
  }
  let incoming = 0
  let outgoing = 0
  for (const tpl of templates.all) {
    // -Infinity: a due requireConfirm occurrence not booked yet still lands this month.
    const count = occurrencesBetween(tpl, -Infinity, monthEnd).length
    if (!count) continue
    const out = counted(tpl.accountId) && tpl.type !== 'income' ? baseCurrency.toBase(tpl.amount, tpl.currency) : 0
    let into = 0
    if (tpl.type === 'income' && counted(tpl.accountId)) into = baseCurrency.toBase(tpl.amount, tpl.currency)
    if (tpl.type === 'transfer' && counted(tpl.toAccountId)) {
      const dest = allAccounts.byId(tpl.toAccountId)
      into = tpl.toAmount != null && dest ? baseCurrency.toBase(tpl.toAmount, dest.currency) : baseCurrency.toBase(tpl.amount, tpl.currency)
    }
    // A transfer between two counted accounts moves nothing in or out of the total.
    const net = (into - out) * count
    if (net > 0) incoming += net
    else outgoing -= net
  }
  return { current, incoming, outgoing, projected: current + incoming - outgoing, monthEnd }
})

// ---------- all templates ----------

const templateRows = computed(() =>
  [...templates.all]
    .map((tpl) => {
      const status: 'active' | 'paused' | 'finished' = isFinished(tpl) ? 'finished' : tpl.active ? 'active' : 'paused'
      return { tpl, status, next: scheduledNext(tpl), ...describe(tpl) }
    })
    .sort((a, b) => {
      const rank = { active: 0, paused: 1, finished: 2 }
      return rank[a.status] - rank[b.status] || a.next - b.next
    }),
)

const STATUS_KEY: Record<'paused' | 'finished', MessageKey> = {
  paused: 'recurring.status.paused',
  finished: 'recurring.status.finished',
}

// ---------- form ----------

const showForm = ref(false)
const editing = ref<RecurringTemplate | null>(null)

function openNew() {
  editing.value = null
  showForm.value = true
}

function openEdit(tpl: RecurringTemplate) {
  editing.value = tpl
  showForm.value = true
}

// Closing the form and opening the confirm dialog in the same tick can crash
// the patcher — see App.vue's handleTransactionDeleteRequest.
async function handleDeleteRequest() {
  const tpl = editing.value
  if (!tpl) return
  showForm.value = false
  await nextTick()
  popups.confirmDialog({
    title: t('recurring.deleteTitle'),
    message: t('layout.settings.removeTemplateConfirm'),
    confirmLabel: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      await templates.remove(tpl.id)
      popups.closeConfirm()
    },
  })
}
</script>

<template>
  <div class="view">
    <div>
      <h1 class="page-title">{{ t('recurring.title') }}</h1>
    </div>
    <div class="view-scroll">
      <div class="view-scroll-content">
        <p v-if="readOnly" class="hint">{{ t('layout.settings.viewingOtherHint') }}</p>
        <template v-else>
          <p class="hint">{{ t('recurring.hint') }}</p>

          <button class="btn btn-primary add-btn" @click="openNew">
            <MdiIcon name="mdiPlus" :size="18" />
            {{ t('recurring.add') }}
          </button>

          <section v-if="dueRows.length" class="card due-card">
            <h3 class="card-title">
              <MdiIcon name="mdiBellRingOutline" :size="16" color="var(--accent)" />
              {{ t('recurring.dueTitle') }}
            </h3>
            <div v-for="row in dueRows" :key="row.tpl.id" class="due-row">
              <div class="row-main">
                <IconCircle :icon="row.icon" :color="row.color" :size="36" :square="row.square" />
                <div class="row-text">
                  <span class="row-title">{{ row.title }}</span>
                  <span class="row-sub">
                    {{ formatDate(row.date) }}
                    <template v-if="row.count > 1"> · {{ t('recurring.dueMore', { count: row.count - 1 }) }}</template>
                  </span>
                </div>
                <span class="row-amount" :class="row.tpl.type">{{ amountLabel(row.tpl) }}</span>
              </div>
              <div class="due-actions">
                <button class="btn btn-secondary" @click="skip(row.tpl, row.date)">{{ t('recurring.skip') }}</button>
                <button class="btn btn-primary" @click="book(row.tpl, row.date)">{{ t('recurring.book') }}</button>
              </div>
            </div>
          </section>

          <section v-if="templates.all.length" class="card">
            <h3 class="card-title">{{ t('recurring.forecastTitle') }}</h3>
            <div class="forecast-line">
              <span>{{ t('recurring.forecastNow') }}</span>
              <span class="value">{{ formatMoney(forecast.current, baseCurrency.code) }}</span>
            </div>
            <div class="forecast-line">
              <span>{{ t('recurring.forecastIncome') }}</span>
              <span class="value income">{{ formatMoney(forecast.incoming, baseCurrency.code, { signed: true }) }}</span>
            </div>
            <div class="forecast-line">
              <span>{{ t('recurring.forecastExpense') }}</span>
              <span class="value expense">{{ formatMoney(-forecast.outgoing, baseCurrency.code, { signed: true }) }}</span>
            </div>
            <div class="forecast-line total">
              <span>{{ t('recurring.forecastEnd', { date: formatDate(forecast.monthEnd) }) }}</span>
              <span class="value" :class="{ expense: forecast.projected < 0 }">{{ formatMoney(forecast.projected, baseCurrency.code) }}</span>
            </div>
            <p class="hint">{{ t('recurring.forecastHint') }}</p>
          </section>

          <section v-if="templates.all.length" class="card">
            <h3 class="card-title">{{ t('recurring.upcomingTitle', { days: UPCOMING_DAYS }) }}</h3>
            <p v-if="!upcomingRows.length" class="hint">{{ t('recurring.upcomingEmpty') }}</p>
            <ul v-else class="list">
              <li v-for="row in upcomingRows" :key="`${row.tpl.id}-${row.date}`" class="list-row">
                <span class="date-chip">{{ formatDate(row.date) }}</span>
                <div class="row-text">
                  <span class="row-title">{{ row.title }}</span>
                  <span v-if="row.tpl.requireConfirm" class="row-sub">{{ t('recurring.status.confirm') }}</span>
                </div>
                <span class="row-amount" :class="row.tpl.type">{{ amountLabel(row.tpl) }}</span>
              </li>
            </ul>
          </section>

          <section class="card">
            <h3 class="card-title">{{ t('recurring.allTitle', { count: templates.all.length }) }}</h3>
            <p v-if="!templates.all.length" class="hint">{{ t('recurring.empty') }}</p>
            <ul v-else class="list">
              <li
                v-for="row in templateRows"
                :key="row.tpl.id"
                class="list-row clickable"
                :class="{ inactive: row.status !== 'active' }"
                @click="openEdit(row.tpl)"
              >
                <IconCircle :icon="row.icon" :color="row.color" :size="32" :square="row.square" />
                <div class="row-text">
                  <span class="row-title">{{ row.title }}</span>
                  <span class="row-sub">
                    {{ recurrenceLabel(row.tpl.frequency, row.tpl.interval) }} ·
                    <template v-if="row.status === 'active'">{{ t('recurring.next', { date: formatDate(row.next) }) }}</template>
                    <template v-else>{{ t(STATUS_KEY[row.status]) }}</template>
                    <template v-if="row.tpl.requireConfirm"> · {{ t('recurring.status.confirm') }}</template>
                  </span>
                  <span v-if="row.tpl.note" class="row-note">{{ row.tpl.note }}</span>
                </div>
                <span class="row-amount" :class="row.tpl.type">{{ amountLabel(row.tpl) }}</span>
                <MdiIcon name="mdiChevronRight" :size="18" color="var(--text-muted)" />
              </li>
            </ul>
          </section>
        </template>
      </div>
    </div>

    <RecurringFormModal :open="showForm" :template="editing" @close="showForm = false" @saved="showForm = false" @deleted="handleDeleteRequest" />
  </div>
</template>

<style lang="scss" scoped>
.page-title {
  font-size: 20px;
  margin: 8px 0 4px;
}
.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
}
.add-btn {
  width: 100%;
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.card {
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: 14px;
  margin-top: 12px;
}
.due-card {
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}
.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  margin: 0 0 8px;
  color: var(--text-primary);
}
.due-row + .due-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.row-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.due-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.due-actions .btn {
  flex: 1;
}
.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.row-title {
  font-size: 13.5px;
  font-weight: 600;
  @include lineClamp(1);
}
.row-sub {
  font-size: 11.5px;
  color: var(--text-muted);
}
.row-note {
  font-size: 11.5px;
  color: var(--text-secondary);
  font-style: italic;
  @include lineClamp(1);
}
.row-amount {
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  color: var(--text-secondary);
}
.row-amount.expense {
  color: var(--expense);
}
.row-amount.income {
  color: var(--income);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
.list-row.clickable {
  cursor: pointer;
}
.list-row.inactive {
  opacity: 0.6;
}
.date-chip {
  flex-shrink: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 76px;
}
.forecast-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 4px 0;
}
.forecast-line .value {
  font-weight: 600;
  color: var(--text-primary);
}
.forecast-line .value.income {
  color: var(--income);
}
.forecast-line .value.expense {
  color: var(--expense);
}
.forecast-line.total {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-weight: 600;
  color: var(--text-primary);
}
.forecast-line.total .value {
  font-size: 15px;
}
</style>
