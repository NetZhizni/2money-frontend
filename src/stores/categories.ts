import { defineStore } from 'pinia'
import { computed } from 'vue'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { useAuthStore } from './auth'
import { useTransactionsStore } from './transactions'
import type { Category, CategoryKind } from '../types/models'

export type NewCategoryInput = Omit<Category, 'id' | 'createdAt' | 'order' | 'ownerId'>

export const useCategoriesStore = defineStore('categories', () => {
  const authStore = useAuthStore()
  const collection = useSyncedCollection<Category>('categories', async () => {
    if (!authStore.uid) return []
    const rows = await db.categories.where('ownerId').equals(authStore.uid).toArray()
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
    const siblings = collection.all.value.filter((c) => c.parentId === (input.parentId ?? null))
    const order = siblings.length ? Math.max(...siblings.map((c) => c.order)) + 1 : 0
    const category: Category = { ...input, id: newId(), ownerId: authStore.uid!, order, createdAt: Date.now() }
    await collection.put(category)
    return category
  }

  async function update(id: string, patch: Partial<Category>): Promise<void> {
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
