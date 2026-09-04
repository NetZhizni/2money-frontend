import { defineStore } from 'pinia'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { useAuthStore } from './auth'
import { useViewAsStore } from './viewAs'
import { assertWritable } from './guards'
import type { Receipt } from '../types/models'

export type NewReceiptInput = Omit<Receipt, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>

/**
 * The signed-in profile's own receipts — `add()` is what ReceiptEditModal.vue
 * needs both for a genuine "Зберегти" and, in its scanFile-режим, to lazily
 * create the grouping row the first time an operation from a scan is saved;
 * listing/lookup for display goes through stores/allReceipts.ts instead, same
 * split as budgets/allBudgets.
 */
export const useReceiptsStore = defineStore('receipts', () => {
  const authStore = useAuthStore()
  const viewAs = useViewAsStore()
  const collection = useSyncedCollection<Receipt>('receipts', () => {
    if (viewAs.mode === 'all') return db.receipts.toArray()
    return viewAs.effectiveUid ? db.receipts.where('ownerId').equals(viewAs.effectiveUid).toArray() : []
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  async function add(input: NewReceiptInput): Promise<Receipt> {
    assertWritable()
    const now = Date.now()
    const receipt: Receipt = { ...input, id: newId(), ownerId: authStore.uid!, createdAt: now, updatedAt: now }
    await collection.put(receipt)
    return receipt
  }

  async function update(id: string, patch: Partial<Receipt>): Promise<void> {
    assertWritable()
    const current = collection.all.value.find((r) => r.id === id)
    if (!current) return
    await collection.put({ ...current, ...patch, updatedAt: Date.now() })
  }

  return {
    all: collection.all,
    loaded: collection.loaded,
    load,
    reset: collection.reset,
    add,
    update,
  }
})
