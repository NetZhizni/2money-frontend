import { defineStore } from 'pinia'
import { computed } from 'vue'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { useAuthStore } from './auth'
import { useViewAsStore } from './viewAs'
import { useTransactionsStore } from './transactions'
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
  const viewAs = useViewAsStore()
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

  // Belt-and-suspenders: the UI never exposes create/edit/delete affordances
  // while viewAs.isReadOnly (viewing another profile, or "Всі"), so this
  // should never actually fire — it's just a loud failure if something slips
  // through, instead of silently writing under the wrong owner.
  function assertWritable() {
    if (viewAs.isReadOnly) throw new Error('Перегляд профілю іншого користувача доступний лише для читання')
  }

  async function add(input: NewCategoryInput): Promise<Category> {
    assertWritable()
    const siblings = collection.all.value.filter((c) => c.parentId === (input.parentId ?? null))
    const order = siblings.length ? Math.max(...siblings.map((c) => c.order)) + 1 : 0
    const category: Category = { ...input, id: newId(), ownerId: authStore.uid!, order, createdAt: Date.now() }
    await collection.put(category)
    return category
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
    expenseTree,
    incomeTree,
  }
})
