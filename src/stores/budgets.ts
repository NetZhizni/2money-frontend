import { defineStore } from 'pinia'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { useAuthStore } from './auth'
import type { Budget } from '../types/models'

export type NewBudgetInput = Omit<Budget, 'id' | 'createdAt' | 'ownerId'>

export const useBudgetsStore = defineStore('budgets', () => {
  const authStore = useAuthStore()
  const collection = useSyncedCollection<Budget>('budgets', () => {
    if (!authStore.uid) return []
    return db.budgets.where('ownerId').equals(authStore.uid).toArray()
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  async function add(input: NewBudgetInput): Promise<Budget> {
    const budget: Budget = { ...input, id: newId(), ownerId: authStore.uid!, createdAt: Date.now() }
    await collection.put(budget)
    return budget
  }

  async function update(id: string, patch: Partial<Budget>): Promise<void> {
    const current = collection.all.value.find((b) => b.id === id)
    if (!current) return
    await collection.put({ ...current, ...patch })
  }

  async function remove(id: string): Promise<void> {
    await collection.removeLocal(id)
  }

  function forCategory(categoryId: string): Budget | undefined {
    return collection.all.value.find((b) => b.categoryId === categoryId)
  }

  return { all: collection.all, loaded: collection.loaded, load, reset: collection.reset, add, update, remove, forCategory }
})
