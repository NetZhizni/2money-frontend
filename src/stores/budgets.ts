import { defineStore } from 'pinia'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { useAuthStore } from './auth'
import { useViewAsStore } from './viewAs'
import { assertWritable } from './guards'
import type { Budget } from '../types/models'

export type NewBudgetInput = Omit<Budget, 'id' | 'createdAt' | 'ownerId'>

export const useBudgetsStore = defineStore('budgets', () => {
  const authStore = useAuthStore()
  const viewAs = useViewAsStore()
  const collection = useSyncedCollection<Budget>('budgets', () => {
    // 'all' mode (viewAs.effectiveUid === null): every family member's budgets, unfiltered.
    if (viewAs.mode === 'all') return db.budgets.toArray()
    return viewAs.effectiveUid ? db.budgets.where('ownerId').equals(viewAs.effectiveUid).toArray() : []
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  async function add(input: NewBudgetInput): Promise<Budget> {
    assertWritable()
    const budget: Budget = { ...input, id: newId(), ownerId: authStore.uid!, createdAt: Date.now() }
    await collection.put(budget)
    return budget
  }

  async function update(id: string, patch: Partial<Budget>): Promise<void> {
    assertWritable()
    const current = collection.all.value.find((b) => b.id === id)
    if (!current) return
    await collection.put({ ...current, ...patch })
  }

  async function remove(id: string): Promise<void> {
    assertWritable()
    await collection.removeLocal(id)
  }

  function forCategory(categoryId: string): Budget | undefined {
    return collection.all.value.find((b) => b.categoryId === categoryId)
  }

  return {
    all: collection.all,
    loaded: collection.loaded,
    load,
    reset: collection.reset,
    isPending: collection.isPending,
    add,
    update,
    remove,
    forCategory,
  }
})
