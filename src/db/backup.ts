import { db, type UserDirectoryEntry } from './schema'
import {
  enqueueDeleteMany,
  pullAllAccounts,
  pullAllBudgets,
  pullAllCategories,
  pullAllReceipts,
  pullAllTemplates,
  pullAllTransactions,
} from './sync'
import { downloadFile } from '../utils/download'
import { newId } from '../utils/id'
import { isCrossProfileTransfer } from '../utils/transferAnalytics'
import http from '../api/http'
import { useAccountsStore } from '../stores/accounts'
import { useCategoriesStore } from '../stores/categories'
import { useTransactionsStore } from '../stores/transactions'
import { useTemplatesStore } from '../stores/templates'
import { useBudgetsStore } from '../stores/budgets'
import { useReceiptsStore } from '../stores/receipts'
import { useSettingsStore } from '../stores/settings'
import { useAuthStore } from '../stores/auth'
import { useViewAsStore } from '../stores/viewAs'
import type { Account, Budget, Category, Receipt, RecurringTemplate, Transaction, UserRole } from '../types/models'
import { t } from '../i18n'

export interface BackupPayload {
  version: 1
  exportedAt: number
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  templates: RecurringTemplate[]
  budgets: Budget[]
  // Optional only for backward compatibility with a file exported before
  // this field existed — applyBackup() treats a missing one as `[]`, same
  // as it always was for those older files. Every new export always
  // includes it (see exportData()/extractPersonalSlice()).
  receipts?: Receipt[]
  exchangeRates: unknown[]
  // Absent when this payload was extracted from a FamilyBackupPayload (see
  // extractPersonalSlice) — a family export has no per-member settings to
  // carry (base currency/theme are per-device preferences, never synced
  // family-wide — see stores/settings.ts). applyBackup() just leaves the
  // current profile's own settings untouched when this is missing.
  settings?: { baseCurrency: string; theme: string }
}

/** One row of the family member directory as exportFamilyBackup() sees it — includes email/role, unlike the client-facing UserDirectoryEntry (see db/schema.ts), because only the owner-only admin API exposes those. */
export interface FamilyBackupUser {
  id: string
  email: string
  displayName: string
  role: UserRole
  isActive: boolean
}

/**
 * Owner-only, whole-family equivalent of BackupPayload — every member's
 * accounts/transactions/recurring templates/budgets/receipts, plus the
 * shared categories and the member directory (see FamilyBackupUser). See
 * exportFamilyBackup()'s own doc comment for how this is meant to be used:
 * restoreFamilyBackup() below for the owner restoring everyone at once, or
 * mergeBackupFile()/extractPersonalSlice() for one member pulling just
 * their own slice back out of it.
 */
export interface FamilyBackupPayload {
  version: 'family-1'
  exportedAt: number
  users: FamilyBackupUser[]
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  templates: RecurringTemplate[]
  budgets: Budget[]
  receipts: Receipt[]
  exchangeRates: unknown[]
}

/**
 * Cross-profile transfers can't be faithfully restored on import — the
 * counterparty's account (and, for one someone sent YOU, their whole
 * profile) never appears anywhere else in a PERSONAL export, so
 * `toAccountId`/`accountId` would just dangle after a round trip (see
 * applyBackup()'s doc comment). Rather than dropping them, each one is
 * folded into a self-contained expense (you sent it) or income (you
 * received it) against a synthetic category — named after the other person
 * and their card, and carrying that card's icon/color — so both the money
 * movement and who it was with survive the export/import round trip without
 * needing any reference outside this profile's own data. `ownedTransactions`
 * may contain ordinary rows too (only actual cross-profile transfers in it
 * are touched); `incomingTransfers` is transfers-only, sent by someone else,
 * with this profile as the counterparty.
 *
 * Pure/synchronous core, shared by two entry points below that differ only
 * in WHERE the counterparty accounts/names come from: `synthesizeTransfer-
 * Categories` (this device's own Dexie, already family-wide — see
 * exportData()) vs. `synthesizeTransferCategoriesFromFamilyBackup` (a
 * FamilyBackupPayload's own arrays, since a fresh device restoring from one
 * has no Dexie data yet to look the counterparty up in — see
 * extractPersonalSlice()).
 */
function synthesizeTransferCategoriesCore(
  uid: string,
  ownedTransactions: Transaction[],
  incomingTransfers: Transaction[],
  accountsById: Map<string, Account>,
  nameByUid: Map<string, string>,
): { transactions: Transaction[]; extraCategories: Category[] } {
  const extraCategories: Category[] = []
  const categoryByKey = new Map<string, Category>()
  function categoryFor(kind: 'income' | 'expense', counterparty: Account, currency: string): Category {
    const key = `${kind}:${counterparty.id}`
    const existing = categoryByKey.get(key)
    if (existing) return existing
    const category: Category = {
      id: newId(),
      ownerId: uid,
      name: `${nameByUid.get(counterparty.ownerId) ?? '?'} · ${counterparty.name}`,
      kind,
      icon: counterparty.icon,
      color: counterparty.color,
      parentId: null,
      archived: false,
      order: 0,
      createdAt: Date.now(),
      currency,
    }
    categoryByKey.set(key, category)
    extraCategories.push(category)
    return category
  }

  const transactions: Transaction[] = []

  for (const tx of ownedTransactions) {
    const counterparty = isCrossProfileTransfer(tx) && tx.toAccountId ? accountsById.get(tx.toAccountId) : undefined
    if (!counterparty) {
      transactions.push(tx)
      continue
    }
    const category = categoryFor('expense', counterparty, tx.currency)
    transactions.push({
      ...tx,
      participantIds: [uid],
      type: 'expense',
      categoryId: category.id,
      subcategoryId: null,
      toAccountId: undefined,
      toAmount: undefined,
      templateId: undefined,
    })
  }

  for (const tx of incomingTransfers) {
    const myAccount = tx.toAccountId ? accountsById.get(tx.toAccountId) : undefined
    const counterparty = accountsById.get(tx.accountId)
    // Can't reconstruct without both sides (e.g. this device's local cache
    // is stale and one side was since deleted) — drop rather than half-export it.
    if (!myAccount || !counterparty) continue
    const category = categoryFor('income', counterparty, myAccount.currency)
    transactions.push({
      ...tx,
      ownerId: uid,
      participantIds: [uid],
      type: 'income',
      accountId: myAccount.id,
      amount: tx.toAmount ?? tx.amount,
      currency: myAccount.currency,
      categoryId: category.id,
      subcategoryId: null,
      toAccountId: undefined,
      toAmount: undefined,
      templateId: undefined,
    })
  }

  return { transactions, extraCategories }
}

/** synthesizeTransferCategoriesCore, looking counterparty accounts/names up in this device's own (already family-wide) Dexie tables — see exportData(). */
async function synthesizeTransferCategories(
  uid: string,
  ownedTransactions: Transaction[],
  incomingTransfers: Transaction[],
): Promise<{ transactions: Transaction[]; extraCategories: Category[] }> {
  const relevantAccountIds = new Set<string>()
  for (const tx of ownedTransactions) if (isCrossProfileTransfer(tx) && tx.toAccountId) relevantAccountIds.add(tx.toAccountId)
  for (const tx of incomingTransfers) {
    relevantAccountIds.add(tx.accountId)
    if (tx.toAccountId) relevantAccountIds.add(tx.toAccountId)
  }
  const accountRows = await db.accounts.bulkGet([...relevantAccountIds])
  const accountsById = new Map(accountRows.filter((a): a is Account => !!a).map((a) => [a.id, a]))
  const ownerIds = [...new Set([...accountsById.values()].map((a) => a.ownerId))]
  const userRows = await db.users.bulkGet(ownerIds)
  const nameByUid = new Map(userRows.filter((u): u is UserDirectoryEntry => !!u).map((u) => [u.id, u.displayName]))
  return synthesizeTransferCategoriesCore(uid, ownedTransactions, incomingTransfers, accountsById, nameByUid)
}

/** synthesizeTransferCategoriesCore, looking counterparty accounts/names up in a FamilyBackupPayload's own arrays instead of Dexie — see extractPersonalSlice(). */
function synthesizeTransferCategoriesFromFamilyBackup(
  uid: string,
  ownedTransactions: Transaction[],
  incomingTransfers: Transaction[],
  family: FamilyBackupPayload,
): { transactions: Transaction[]; extraCategories: Category[] } {
  const accountsById = new Map(family.accounts.map((a) => [a.id, a]))
  const nameByUid = new Map(family.users.map((u) => [u.id, u.displayName]))
  return synthesizeTransferCategoriesCore(uid, ownedTransactions, incomingTransfers, accountsById, nameByUid)
}

/**
 * Exports exactly the signed-in profile's own data — read straight from
 * Dexie by `ownerId`, NOT from the live Pinia stores. accounts/transactions/
 * budgets/receipts re-query filtered by whatever "Переглянути як"
 * (stores/viewAs.ts) currently points at, and transactions additionally
 * surface any cross-profile transfer you're merely a participant in —
 * reading `.all` here would let either one silently pull another family
 * member's data into your backup file. Categories are the one deliberately
 * shared, family-wide resource, so they're read from their store as-is;
 * recurring templates are always queried by the real signed-in uid
 * regardless of viewAs, so that store is safe to read directly too.
 *
 * Cross-profile transfers (sent by this profile, or received from someone
 * else) are folded into synthetic income/expense categories rather than
 * exported as `type: 'transfer'` — see synthesizeTransferCategories()'s doc
 * comment for why. Receipts don't need any of that: unlike a transaction, a
 * receipt has exactly one owner and no cross-profile participation, so a
 * plain `ownerId` filter is enough.
 */
export async function exportData(): Promise<BackupPayload> {
  const authStore = useAuthStore()
  const uid = authStore.uid
  if (!uid) throw new Error(t('sync.mustSignIn'))

  const categories = useCategoriesStore()
  const templates = useTemplatesStore()
  const settings = useSettingsStore()

  const [accountRows, ownedTransactions, incomingTransfers, budgetRows, receiptRows] = await Promise.all([
    db.accounts.where('ownerId').equals(uid).toArray(),
    // No `ownerId` index on transactions (see db/schema.ts) — only
    // `*participantIds`, which is exactly the field we must NOT filter by
    // here (see the doc comment above), so a full-table scan it is.
    db.transactions.filter((tx) => tx.ownerId === uid).toArray(),
    db.transactions.where('participantIds').equals(uid).and((tx) => tx.ownerId !== uid && tx.type === 'transfer').toArray(),
    db.budgets.where('ownerId').equals(uid).toArray(),
    db.receipts.where('ownerId').equals(uid).toArray(),
  ])
  const { transactions: transactionRows, extraCategories } = await synthesizeTransferCategories(uid, ownedTransactions, incomingTransfers)

  return {
    version: 1,
    exportedAt: Date.now(),
    accounts: accountRows,
    categories: [...categories.all, ...extraCategories],
    transactions: transactionRows,
    templates: templates.all,
    budgets: budgetRows,
    receipts: receiptRows,
    exchangeRates: await db.exchangeRates.toArray(),
    settings: { baseCurrency: settings.baseCurrency, theme: settings.theme },
  }
}

export function downloadBackup(payload: BackupPayload): void {
  const stamp = new Date(payload.exportedAt).toISOString().slice(0, 10)
  downloadFile(JSON.stringify(payload, null, 2), `2money-backup-${stamp}.json`, 'application/json')
}

export function downloadFamilyBackup(payload: FamilyBackupPayload): void {
  const stamp = new Date(payload.exportedAt).toISOString().slice(0, 10)
  downloadFile(JSON.stringify(payload, null, 2), `2money-family-backup-${stamp}.json`, 'application/json')
}

/**
 * Owner-only export of literally everyone's data — every family member's
 * accounts/transactions/recurring templates/budgets/receipts, plus the
 * shared categories and the member directory (with email/role, fetched
 * directly via the admin API rather than through stores/admin.ts's own
 * load() — that one swallows failures into a `.error` ref instead of
 * throwing, which would silently ship a backup with an empty `users` list
 * on a hiccup instead of failing loudly). Reading the rest straight from
 * Dexie's synced tables works because of this app's trust model (see
 * db/sync.ts's own doc comment): every "own" store's data is really just a
 * client-side filter over these same family-wide tables. A fresh
 * family-wide pull of each one runs first (best-effort — offline just means
 * "backup from whatever's cached", same as any other best-effort pull in
 * this app) so the export reflects the latest server state rather than only
 * whatever this device's cache happened to have.
 *
 * This file can come back in one of two ways: the owner restores it whole,
 * in one shot, onto a fresh server via restoreFamilyBackup() below (backed
 * by the admin-only POST /api/admin/restore —
 * backend/src/services/internal/admin/restoreFamilyBackup.js — the one
 * endpoint allowed to attribute records to someone other than whoever's
 * actually signed in, unlike every normal per-record endpoint); or each
 * family member instead pulls just their own slice back out of it after
 * signing in themselves, via mergeBackupFile()/extractPersonalSlice() below
 * — e.g. to top up an already-active family instead of restoring onto an
 * empty one. See views/OnboardingView.vue for both, offered side by side.
 */
export async function exportFamilyBackup(): Promise<FamilyBackupPayload> {
  const authStore = useAuthStore()
  if (!authStore.isOwner) throw new Error(t('errors.ownerOnly'))

  await Promise.allSettled([
    pullAllAccounts(),
    pullAllCategories(),
    pullAllTransactions(),
    pullAllTemplates(),
    pullAllBudgets(),
    pullAllReceipts(),
  ])

  const [usersResponse, accounts, categories, transactions, templates, budgets, receipts, exchangeRates] = await Promise.all([
    http.get<FamilyBackupUser[]>('/admin/users'),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.recurringTemplates.toArray(),
    db.budgets.toArray(),
    db.receipts.toArray(),
    db.exchangeRates.toArray(),
  ])

  return {
    version: 'family-1',
    exportedAt: Date.now(),
    users: usersResponse.data.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, role: u.role, isActive: u.isActive })),
    accounts,
    categories,
    transactions,
    templates,
    budgets,
    receipts,
    exchangeRates,
  }
}

export function isFamilyBackup(payload: unknown): payload is FamilyBackupPayload {
  return !!payload && typeof payload === 'object' && (payload as { version?: unknown }).version === 'family-1'
}

/**
 * Case-insensitive email match — the only reliable link between a
 * FamilyBackupPayload's user rows and whoever's importing on the new
 * server: ids are always freshly minted per backend (see
 * backend/src/middleware/auth.js's bootstrap/pre-provision paths), so the
 * old id alone means nothing on a different server.
 */
function matchFamilyBackupUser(family: FamilyBackupPayload, email: string): FamilyBackupUser | undefined {
  const target = email.trim().toLowerCase()
  return family.users.find((u) => u.email.trim().toLowerCase() === target)
}

/**
 * Turns one member's slice of a FamilyBackupPayload into an ordinary
 * BackupPayload, so it can flow through the exact same applyBackup()
 * pipeline mergeData() already uses for a personal export — see
 * mergeBackupFile()'s doc comment for the full story. `oldOwnerId` is this
 * member's id in the OLD family (see matchFamilyBackupUser). Everything not
 * owned by them is dropped except categories (shared, kept in full — the
 * existing reconciliation in applyBackup() converges every member's import
 * of the same file onto one shared set regardless of import order) and any
 * cross-profile transfer they were the receiving end of, folded into a
 * synthetic category exactly like exportData() would — the sending side's
 * account belongs to a profile this single member's import has no way to
 * recreate here (see FamilyBackupUser's own doc comment on why).
 */
function extractPersonalSlice(family: FamilyBackupPayload, oldOwnerId: string): BackupPayload {
  const ownedTransactions = family.transactions.filter((tx) => tx.ownerId === oldOwnerId)
  const incomingTransfers = family.transactions.filter(
    (tx) => tx.type === 'transfer' && tx.ownerId !== oldOwnerId && tx.participantIds.includes(oldOwnerId),
  )
  const { transactions, extraCategories } = synthesizeTransferCategoriesFromFamilyBackup(
    oldOwnerId,
    ownedTransactions,
    incomingTransfers,
    family,
  )

  return {
    version: 1,
    exportedAt: family.exportedAt,
    accounts: family.accounts.filter((a) => a.ownerId === oldOwnerId),
    categories: [...family.categories, ...extraCategories],
    transactions,
    templates: family.templates.filter((tpl) => tpl.ownerId === oldOwnerId),
    budgets: family.budgets.filter((b) => b.ownerId === oldOwnerId),
    receipts: family.receipts.filter((r) => r.ownerId === oldOwnerId),
    exchangeRates: family.exchangeRates,
  }
}

/**
 * Merges either backup shape into whoever's currently signed in — the
 * shared entry point for SettingsModal's "Приєднати дані з файлу" and
 * views/OnboardingView.vue's own-data import step, so both accept a
 * personal export (from exportData()) AND a whole-family one (from
 * exportFamilyBackup()): a family-wide file only ever contributes what
 * belonged to the CURRENT profile's own email in the old family (see
 * extractPersonalSlice) — this particular entry point never touches anyone
 * else's data. For the owner restoring EVERYONE at once instead, see
 * restoreFamilyBackup() below. Throws `sync.familyBackupEmailNotFound` if
 * this profile's email isn't in the file at all (wrong file, or a genuinely
 * new member with no history to bring along).
 */
export async function mergeBackupFile(payload: unknown): Promise<void> {
  if (isFamilyBackup(payload)) {
    const email = useAuthStore().profile?.email
    if (!email) throw new Error(t('sync.mustSignIn'))
    const match = matchFamilyBackupUser(payload, email)
    if (!match) throw new Error(t('sync.familyBackupEmailNotFound'))
    await mergeData(extractPersonalSlice(payload, match.id))
    return
  }
  await mergeData(payload as BackupPayload)
}

/** Summary counts POST /api/admin/restore returns — see restoreFamilyBackup()'s own doc comment. */
export interface FamilyRestoreSummary {
  usersCreated: number
  accounts: number
  categories: number
  templates: number
  transactions: number
  budgets: number
  receipts: number
}

/**
 * Owner-only, one-shot "restore literally everyone" — the counterpart to
 * exportFamilyBackup(), backed by the admin-only
 * backend/src/services/internal/admin/restoreFamilyBackup.js, the one
 * endpoint allowed to write records under someone OTHER than whoever's
 * actually signed in. Recreates every member's accounts/categories/
 * transactions/templates/budgets/receipts in a single request, provisioning
 * (by email, via the same mechanism as POST /api/admin/users) any member
 * who doesn't exist on this server yet — so it's meant for restoring onto a
 * genuinely fresh/empty family (see views/OnboardingView.vue's owner-only
 * option), not for topping up an already-active one, where mergeBackupFile()
 * (each member restoring their own slice) is the right tool instead. Ids
 * are preserved as-is server-side, so this device still needs a fresh pull
 * afterwards (see db/sync.ts's fullSync) to actually see any of it locally —
 * every call site does that itself right after this resolves.
 */
export async function restoreFamilyBackup(payload: FamilyBackupPayload): Promise<FamilyRestoreSummary> {
  const { data } = await http.post<FamilyRestoreSummary>('/admin/restore', payload)
  return data
}

/** The `ownerId` shared by the most rows — in practice, whoever actually ran the export. */
function dominantOwnerId(rows: { ownerId: string }[]): string | undefined {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.ownerId, (counts.get(r.ownerId) ?? 0) + 1)
  let dominant: string | undefined
  let best = 0
  for (const [id, count] of counts) {
    if (count > best) {
      best = count
      dominant = id
    }
  }
  return dominant
}

/** Common validation for importData()/mergeData() — returns the uid everything below gets stamped with. */
function assertImportable(payload: BackupPayload): string {
  if (!payload || payload.version !== 1) throw new Error(t('sync.unsupportedBackupFormat'))
  const ownerId = useAuthStore().uid
  if (!ownerId) throw new Error(t('sync.mustSignIn'))
  // Fail before touching anything rather than partway through — every store
  // mutation below would eventually hit this same guard (see
  // stores/guards.ts), but only after some of the raw deletes/creates
  // further down had already run.
  if (useViewAsStore().isReadOnly) throw new Error(t('errors.readOnlyProfile'))
  return ownerId
}

/**
 * Raw Dexie deletes (mirroring db/reset.ts's resetAllData), not
 * accounts.remove()/transactions.remove(): those cascade (removing an
 * account also removes every transaction that touches it) using the live,
 * viewAs/participantIds-shaped `collection.all`, which could reach a
 * transaction this profile doesn't own — e.g. a cross-profile transfer a
 * family member sent you, whose `toAccountId` is one of your own accounts.
 * Reading straight from Dexie by `ownerId` instead guarantees only rows
 * this profile actually owns are ever touched. Categories are never wiped
 * here — see applyBackup()'s doc comment.
 */
async function wipeOwnPersonalData(ownerId: string): Promise<void> {
  const [ownAccounts, ownTransactions, ownTemplates, ownBudgets, ownReceipts] = await Promise.all([
    db.accounts.where('ownerId').equals(ownerId).toArray(),
    db.transactions.filter((tx) => tx.ownerId === ownerId).toArray(),
    db.recurringTemplates.where('ownerId').equals(ownerId).toArray(),
    db.budgets.where('ownerId').equals(ownerId).toArray(),
    db.receipts.where('ownerId').equals(ownerId).toArray(),
  ])
  const ownAccountIds = ownAccounts.map((a) => a.id)
  const ownTransactionIds = ownTransactions.map((tx) => tx.id)
  const ownTemplateIds = ownTemplates.map((rec) => rec.id)
  const ownBudgetIds = ownBudgets.map((b) => b.id)
  const ownReceiptIds = ownReceipts.map((r) => r.id)

  await db.transactions.bulkDelete(ownTransactionIds)
  await db.accounts.bulkDelete(ownAccountIds)
  await db.recurringTemplates.bulkDelete(ownTemplateIds)
  await db.budgets.bulkDelete(ownBudgetIds)
  await db.receipts.bulkDelete(ownReceiptIds)
  await enqueueDeleteMany('transactions', ownerId, ownTransactionIds)
  await enqueueDeleteMany('accounts', ownerId, ownAccountIds)
  await enqueueDeleteMany('recurringTemplates', ownerId, ownTemplateIds)
  await enqueueDeleteMany('budgets', ownerId, ownBudgetIds)
  await enqueueDeleteMany('receipts', ownerId, ownReceiptIds)
}

/**
 * Re-creates everything in `payload` under `ownerId`, shared by importData()
 * (which wipes this profile's existing data first) and mergeData() (which
 * doesn't — see its own doc comment). Every re-imported doc is re-stamped
 * with this profile's uid (never trusting `ownerId`/`participantIds` baked
 * into the file) — otherwise re-importing an old backup, or someone else's
 * export, would silently create docs owned by a stale/foreign uid.
 *
 * Rows that don't belong to whoever actually ran the export (an old backup
 * taken while "Переглянути як" pulled in another family member's data, or a
 * cross-profile transfer whose owner is the OTHER party) are skipped rather
 * than imported under your uid: the backend enforces per-owner writes
 * anyway (accounts/transactions/budgets are owner-scoped server-side), so
 * there's no way to faithfully restore someone else's records from here,
 * and stamping them as yours would just fabricate data neither of you
 * actually entered. The counterparty's own copy of a transfer you DO own is
 * unaffected either way, since it's the same shared document elsewhere.
 *
 * Categories are the one exception: a shared, family-wide resource (see
 * stores/categories.ts), so they're never deleted here — only reconciled
 * against what the family already has (see below).
 */
async function applyBackup(payload: BackupPayload, ownerId: string): Promise<void> {
  const accounts = useAccountsStore()
  const categories = useCategoriesStore()
  const transactions = useTransactionsStore()
  const templates = useTemplatesStore()
  const budgets = useBudgetsStore()
  const receipts = useReceiptsStore()
  const settings = useSettingsStore()

  const payloadReceipts = payload.receipts ?? []
  const sourceOwnerId =
    dominantOwnerId([...payload.accounts, ...payload.transactions, ...payload.templates, ...payload.budgets, ...payloadReceipts]) ??
    ownerId
  const accountsToImport = payload.accounts.filter((a) => a.ownerId === sourceOwnerId)
  const transactionsToImport = payload.transactions.filter((tx) => tx.ownerId === sourceOwnerId)
  const templatesToImport = payload.templates.filter((rec) => rec.ownerId === sourceOwnerId)
  const budgetsToImport = payload.budgets.filter((b) => b.ownerId === sourceOwnerId)
  const receiptsToImport = payloadReceipts.filter((r) => r.ownerId === sourceOwnerId)

  // Every doc below gets a brand-new id on the way in (accounts.add/etc.
  // always mint one — see newId() in each store), so any relational field
  // that still pointed at the OLD id (a transaction's accountId/categoryId,
  // a category's parentId, ...) would dangle once the originals are gone:
  // the transaction list would render the operation with an unknown-category
  // "?" icon, a "—" amount, and "? → ?" for a transfer. These maps let every
  // reference below get re-pointed at the freshly-minted id instead.
  const accountIdMap = new Map<string, string>()
  for (const a of accountsToImport) {
    const { id: oldId, ownerId: _o, createdAt: _c, order: _ord, ...rest } = a
    const created = await accounts.add(rest)
    accountIdMap.set(oldId, created.id)
  }

  // Categories can reference each other via parentId, but the export order
  // doesn't guarantee a parent comes before its children (each `order` is
  // only meaningful among siblings, not across the whole list) — so import
  // in dependency order instead of payload order, re-pointing each
  // parentId at its already-imported parent's new id.
  //
  // Nothing here is ever deleted (see the doc comment above) — a category
  // already matching one the family has (by kind/name/parent) is reused as
  // -is instead of creating a duplicate; only a genuinely new one gets
  // added. `liveCategories` is seeded from the store and updated locally as
  // this loop creates rows, since the store's own reactive list only
  // catches up on the next Dexie liveQuery tick.
  const categoryIdMap = new Map<string, string>()
  const liveCategories = [...categories.all]
  let remainingCategories = [...payload.categories]
  while (remainingCategories.length) {
    const ready = remainingCategories.filter((c) => c.parentId === null || categoryIdMap.has(c.parentId))
    // A dangling/cyclic parentId shouldn't happen in a well-formed export,
    // but fall back to importing everything left as top-level rather than
    // looping forever or silently dropping categories.
    const batch = ready.length ? ready : remainingCategories
    for (const c of batch) {
      const { id: oldId, ownerId: _o, createdAt: _c, order: _ord, parentId, ...rest } = c
      const newParentId = parentId !== null ? (categoryIdMap.get(parentId) ?? null) : null
      const match = liveCategories.find((x) => x.parentId === newParentId && x.kind === rest.kind && x.name === rest.name)
      let resolvedId: string
      if (match) {
        resolvedId = match.id
      } else {
        const created = await categories.add({ ...rest, parentId: newParentId })
        liveCategories.push(created)
        resolvedId = created.id
      }
      categoryIdMap.set(oldId, resolvedId)
    }
    const batchIds = new Set(batch.map((c) => c.id))
    remainingCategories = remainingCategories.filter((c) => !batchIds.has(c.id))
  }

  // Templates only reference accounts/categories, so they can go in right
  // after those maps are ready — before transactions, since a transaction
  // generated from a template points back at it via templateId.
  const templateIdMap = new Map<string, string>()
  for (const rec of templatesToImport) {
    const { id: oldId, ownerId: _o, createdAt: _c, accountId, toAccountId, categoryId, subcategoryId, ...rest } = rec
    const created = await templates.add({
      ...rest,
      accountId: accountIdMap.get(accountId) ?? accountId,
      toAccountId: toAccountId ? (accountIdMap.get(toAccountId) ?? toAccountId) : toAccountId,
      categoryId: categoryId ? (categoryIdMap.get(categoryId) ?? categoryId) : categoryId,
      subcategoryId: subcategoryId ? (categoryIdMap.get(subcategoryId) ?? subcategoryId) : subcategoryId,
    })
    templateIdMap.set(oldId, created.id)
  }

  // Receipts only reference an account, so they can go in any time after
  // accountIdMap is ready — before transactions, since a transaction saved
  // from a receipt points back at it via receiptId.
  const receiptIdMap = new Map<string, string>()
  for (const r of receiptsToImport) {
    const { id: oldId, ownerId: _o, createdAt: _c, updatedAt: _u, accountId, ...rest } = r
    const created = await receipts.add({
      ...rest,
      accountId: accountId ? (accountIdMap.get(accountId) ?? accountId) : accountId,
    })
    receiptIdMap.set(oldId, created.id)
  }

  for (const tx of transactionsToImport) {
    const {
      id: _id,
      ownerId: _o,
      participantIds: _p,
      createdAt: _c,
      updatedAt: _u,
      receiptId,
      accountId,
      toAccountId,
      categoryId,
      subcategoryId,
      templateId,
      ...rest
    } = tx
    await transactions.add({
      ...rest,
      accountId: accountIdMap.get(accountId) ?? accountId,
      toAccountId: toAccountId ? (accountIdMap.get(toAccountId) ?? toAccountId) : toAccountId,
      categoryId: categoryId ? (categoryIdMap.get(categoryId) ?? categoryId) : categoryId,
      subcategoryId: subcategoryId ? (categoryIdMap.get(subcategoryId) ?? subcategoryId) : subcategoryId,
      // Dropped rather than left dangling if the source template/receipt
      // didn't come along in this same backup (templateId is otherwise only
      // used to bulk-delete a template's generated transactions, never to
      // render one; a missing receipt just ungroups the transaction).
      templateId: templateId ? templateIdMap.get(templateId) : undefined,
      receiptId: receiptId ? receiptIdMap.get(receiptId) : undefined,
    })
  }
  for (const b of budgetsToImport) {
    const { id: _id, ownerId: _o, createdAt: _c, categoryId, ...rest } = b
    await budgets.add({ ...rest, categoryId: categoryIdMap.get(categoryId) ?? categoryId })
  }

  // Absent when this payload came from extractPersonalSlice() — see
  // BackupPayload.settings's own doc comment. A family export has no
  // per-member settings to restore, so this profile's current
  // baseCurrency/theme are simply left as they are.
  if (payload.settings) {
    await settings.setBaseCurrency(payload.settings.baseCurrency)
    await settings.setTheme(payload.settings.theme as 'system' | 'light' | 'dark')
  }
}

/**
 * Restores a backup into the CURRENTLY SIGNED-IN profile, REPLACING
 * everything it currently owns (accounts/transactions/templates/budgets/
 * receipts — see wipeOwnPersonalData()) with what's in the file. Use this for "undo my
 * recent changes" / "reinstalled the app, get my data back". For bringing a
 * separately-tracked history INTO an existing profile without erasing what's
 * already there (e.g. joining the family after tracking finances solo), use
 * mergeData() instead. See applyBackup()'s doc comment for what happens to
 * each entity and to rows this profile doesn't own.
 */
export async function importData(payload: BackupPayload): Promise<void> {
  const ownerId = assertImportable(payload)
  await wipeOwnPersonalData(ownerId)
  await applyBackup(payload, ownerId)
}

/**
 * Adds a backup's accounts/categories/transactions/templates/budgets/
 * receipts ON TOP OF whatever this profile already has, instead of
 * replacing it — for
 * someone who tracked their finances separately (local mode, or a personal
 * server) and is now joining this family: nothing of theirs exists here yet,
 * so there's nothing to wipe, and going through importData()'s replace path
 * would be actively wrong once they DO have family data (it would erase it).
 * Same id-remapping and shared-category reconciliation as importData() — see
 * applyBackup()'s doc comment. Note this only merges the new rows in; it
 * doesn't try to detect/merge duplicate ACCOUNTS the way categories are
 * reconciled (e.g. a "Готівка" from each side won't be combined) — that's
 * left for the user to tidy up by hand afterwards.
 */
export async function mergeData(payload: BackupPayload): Promise<void> {
  const ownerId = assertImportable(payload)
  await applyBackup(payload, ownerId)
}
