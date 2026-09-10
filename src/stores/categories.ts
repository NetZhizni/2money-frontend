import { defineStore } from 'pinia'
import { computed } from 'vue'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { useAuthStore } from './auth'
import { useSettingsStore } from './settings'
import { useTransactionsStore } from './transactions'
import { useBudgetsStore } from './budgets'
import { assertWritable } from './guards'
import { t, tFor, preloadLocale, LOCALES } from '../i18n'
import type { Locale } from '../i18n'
import { ALL_DEFAULT_CATEGORY_DEFS } from '../db/defaultCategories'
import type { Category, CategoryKind } from '../types/models'

export type NewCategoryInput = Omit<Category, 'id' | 'createdAt' | 'order' | 'ownerId'>

/**
 * Categories are a SHARED family resource, unlike every other per-profile
 * store here (accounts/transactions/budgets stay owner-scoped) — every
 * active member sees and can edit the same list, so this store has no owner
 * filter at all (own vs "Всі" is the same query; see the backend's
 * CategoryModel and the merge-shared-categories migration for how the old
 * per-owner duplicates were consolidated). `viewAs` still gates whether
 * mutations are allowed below — read-only while "viewing as" someone else —
 * it just no longer changes which rows are visible.
 */
export const useCategoriesStore = defineStore('categories', () => {
  const authStore = useAuthStore()
  const collection = useSyncedCollection<Category>('categories', async () => {
    const rows = await db.categories.toArray()
    return rows.sort((a, b) => a.order - b.order)
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  function topLevel(kind?: CategoryKind, includeArchived = false): Category[] {
    return collection.all.value.filter(
      (c) => c.parentId === null && (kind ? c.kind === kind : true) && (includeArchived || !c.archived),
    )
  }

  function childrenOf(parentId: string, includeArchived = false): Category[] {
    return collection.all.value.filter((c) => c.parentId === parentId && (includeArchived || !c.archived))
  }

  function byId(id: string | null | undefined): Category | undefined {
    if (!id) return undefined
    return collection.all.value.find((c) => c.id === id)
  }

  async function add(input: NewCategoryInput): Promise<Category> {
    assertWritable()
    const siblings = collection.all.value.filter((c) => c.parentId === (input.parentId ?? null))
    const order = siblings.length ? Math.max(...siblings.map((c) => c.order)) + 1 : 0
    // Only a top-level category carries its own currency (a subcategory always
    // inherits its parent's — see CategoryFormModal.vue) — and it's mandatory
    // there, defaulting to the base currency when the caller didn't pick one
    // (covers db/seed.ts's default categories, which pass none at all).
    const currency = input.parentId ? undefined : input.currency || useSettingsStore().baseCurrency
    const category: Category = { ...input, currency, id: newId(), ownerId: authStore.uid!, order, createdAt: Date.now() }
    await collection.put(category)
    return category
  }

  /** Whether ANY family member has an operation against this category (or as its subcategory) — see AccountModel/CategoryModel's server-side twin, which enforces this for real. */
  async function hasTransactions(id: string): Promise<boolean> {
    const count = await db.transactions
      .toCollection()
      .filter((t) => t.categoryId === id || t.subcategoryId === id)
      .count()
    return count > 0
  }

  /**
   * The DOMINANT currency among every family member's operations already
   * recorded against this (top-level) category — used to give a category
   * saved before currencies were mandatory a sensible currency the first
   * time it's edited (see CategoryFormModal.vue), instead of blindly
   * defaulting to the base currency (which would silently turn a category
   * that's only ever seen e.g. USD operations into a fake cross-currency one
   * going forward). `undefined` for a category with no history yet.
   */
  async function inferCurrency(id: string): Promise<string | undefined> {
    // `categoryId` is never indexed (see db/schema.ts) — same full-table
    // filter approach as hasTransactions above. `t.categoryId` always holds
    // the TOP-LEVEL id (a subcategory's own operations count toward its
    // parent's currency too), so no separate subcategoryId match is needed here.
    const rows = await db.transactions.toCollection().filter((t) => t.categoryId === id).toArray()
    const counts = new Map<string, number>()
    for (const t of rows) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1)
    let best: string | undefined
    let bestCount = 0
    for (const [currency, count] of counts) {
      if (count > bestCount) {
        bestCount = count
        best = currency
      }
    }
    return best
  }

  async function update(id: string, patch: Partial<Category>): Promise<void> {
    assertWritable()
    const current = collection.all.value.find((c) => c.id === id)
    if (!current) return
    await collection.put({ ...current, ...patch })
  }

  async function setArchived(id: string, archivedValue: boolean): Promise<void> {
    await update(id, { archived: archivedValue })
    // Archiving a parent archives its subcategories too; historic transactions are untouched.
    for (const child of childrenOf(id, true)) {
      await update(child.id, { archived: archivedValue })
    }
  }

  function collectWithDescendants(id: string): string[] {
    const ids = [id]
    for (const child of collection.all.value.filter((c) => c.parentId === id)) {
      ids.push(...collectWithDescendants(child.id))
    }
    return ids
  }

  /** Hard delete: removes the category, all its subcategories, and every transaction tied to any of them. */
  async function remove(id: string): Promise<void> {
    assertWritable()
    const transactions = useTransactionsStore()
    const ids = collectWithDescendants(id)
    for (const categoryId of ids) {
      await transactions.removeByCategory(categoryId)
      await collection.removeLocal(categoryId)
    }
  }

  /**
   * Hard delete EVERY category (both kinds) and every transaction tied to
   * any of them — the "Очистити всі категорії" danger-zone action in
   * Settings, for wiping a mismatched-language or otherwise-stale category
   * set before reseeding it (see db/seed.ts's `seedDefaultCategoriesNow`).
   * Loops `remove()` one top-level category at a time so the exact same
   * cascade (subcategories, then every linked transaction) applies to each.
   */
  async function removeAll(): Promise<void> {
    assertWritable()
    const topLevelIds = collection.all.value.filter((c) => c.parentId === null).map((c) => c.id)
    for (const id of topLevelIds) {
      await remove(id)
    }
  }

  /**
   * Re-labels every still-factory default category to `nextLocale`'s
   * translation — called right after a language switch (see
   * i18n/locale.ts's `setLocaleSetting`, which applies live — no reload) so
   * a category seeded under one language keeps reading naturally after
   * switching, instead of freezing at whatever text it was created with.
   *
   * A category only qualifies if it's still recognizably "factory": marked
   * `isDefault` AND its `(kind, icon)` still fingerprints one of
   * defaultCategories.ts's defs AND its current name still equals THAT def's
   * translation in some locale (not some other def's — two defs can share an
   * icon, e.g. "Кафе і ресторани" and its own "Обід на роботі" subcategory
   * both carry the parent's icon, but only the one whose translated name
   * actually matches gets touched). A category failing any of those checks
   * has been customized (renamed and/or re-iconed) and is left exactly as
   * the user left it — see defaultCategories.ts's own doc comment.
   *
   * The `LOCALES.some(...)` check below needs EVERY locale's real strings,
   * not just whichever one or two happen to be loaded already — i18n's lazy
   * loading otherwise silently falls back to English for a not-yet-fetched
   * locale, which would make this comparison wrong instead of merely slow.
   * `preloadLocale` is a no-op for anything already loaded, so this is only
   * ever a real fetch for locales the app hasn't touched yet.
   */
  async function retranslateDefaults(nextLocale: Locale): Promise<void> {
    await Promise.all(LOCALES.map((loc) => preloadLocale(loc)))
    for (const c of collection.all.value) {
      if (!c.isDefault) continue
      const def = ALL_DEFAULT_CATEGORY_DEFS.find((d) => d.kind === c.kind && d.icon === c.icon && LOCALES.some((loc) => tFor(loc, d.key) === c.name))
      if (!def) continue
      const newName = tFor(nextLocale, def.key)
      if (newName !== c.name) await collection.put({ ...c, name: newName })
    }
  }

  /**
   * Folds `sourceId` into `targetId` (both must be the same kind) — for
   * consolidating accidental duplicates (e.g. two "Таксі" categories).
   * Any of source's own subcategories are reparented onto target first, then
   * this profile's own transactions/budgets pointing at source are
   * repointed to target. Categories are shared family-wide (see the module
   * doc comment above), so another family member's own transactions/budgets
   * can't be rewritten from here — the backend only accepts writes to
   * records this profile owns — which is exactly why source is deleted
   * outright only once NOTHING in the whole family still references it
   * (checked unfiltered by owner, like hasTransactions() does); otherwise
   * it's archived instead, so it drops out of pickers without leaving
   * whoever still uses it pointing at a category that's gone.
   */
  async function merge(sourceId: string, targetId: string): Promise<void> {
    assertWritable()
    if (sourceId === targetId) return
    const source = byId(sourceId)
    const target = byId(targetId)
    if (!source || !target) return
    if (source.kind !== target.kind) throw new Error(t('errors.mergeKindMismatch'))

    for (const child of childrenOf(sourceId, true)) {
      await update(child.id, { parentId: targetId })
    }

    const myUid = authStore.uid
    const transactions = useTransactionsStore()
    for (const tx of transactions.all.filter((row) => row.ownerId === myUid && (row.categoryId === sourceId || row.subcategoryId === sourceId))) {
      if (tx.categoryId === sourceId) await transactions.update(tx.id, { categoryId: targetId })
      if (tx.subcategoryId === sourceId) await transactions.update(tx.id, { subcategoryId: targetId })
    }
    const budgets = useBudgetsStore()
    for (const b of budgets.all.filter((row) => row.ownerId === myUid && row.categoryId === sourceId)) {
      await budgets.update(b.id, { categoryId: targetId })
    }

    if (await hasTransactions(sourceId)) {
      await setArchived(sourceId, true)
    } else {
      await remove(sourceId)
    }
  }

  const expenseTree = computed(() => topLevel('expense').map((c) => ({ ...c, children: childrenOf(c.id) })))
  const incomeTree = computed(() => topLevel('income').map((c) => ({ ...c, children: childrenOf(c.id) })))

  return {
    all: collection.all,
    loaded: collection.loaded,
    load,
    reset: collection.reset,
    isPending: collection.isPending,
    topLevel,
    childrenOf,
    byId,
    add,
    update,
    setArchived,
    remove,
    removeAll,
    retranslateDefaults,
    merge,
    hasTransactions,
    inferCurrency,
    expenseTree,
    incomeTree,
  }
})
