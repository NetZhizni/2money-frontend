import { defineStore } from 'pinia'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { useAuthStore } from './auth'
import type { Transaction } from '../types/models'

/**
 * `toOwnerId` is input-only: when set (and different from the current
 * profile), it marks a cross-profile transfer — the store derives
 * `participantIds` from it so BOTH profiles' `participantIds`-based query
 * picks up the transaction locally. It is never itself persisted on the
 * record (the backend re-derives participant_ids server-side anyway, from
 * the accounts' real owners — see upsertTransaction.js — so this is only
 * for the local Dexie index to work before that round trip completes).
 */
export type NewTransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'ownerId' | 'participantIds'> & {
  toOwnerId?: string
}

export const useTransactionsStore = defineStore('transactions', () => {
  const authStore = useAuthStore()
  const collection = useSyncedCollection<Transaction>('transactions', async () => {
    if (!authStore.uid) return []
    const rows = await db.transactions.where('participantIds').equals(authStore.uid).toArray()
    return rows.sort((a, b) => b.date - a.date)
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  function participantsFor(ownerId: string, toOwnerId?: string): string[] {
    return toOwnerId && toOwnerId !== ownerId ? [ownerId, toOwnerId] : [ownerId]
  }

  async function add(input: NewTransactionInput): Promise<Transaction> {
    const { toOwnerId, ...rest } = input
    const now = Date.now()
    const tx: Transaction = {
      ...rest,
      id: newId(),
      ownerId: authStore.uid!,
      participantIds: participantsFor(authStore.uid!, toOwnerId),
      createdAt: now,
      updatedAt: now,
    }
    await collection.put(tx)
    return tx
  }

  async function update(id: string, patch: Partial<Transaction> & { toOwnerId?: string }): Promise<void> {
    const current = collection.all.value.find((t) => t.id === id)
    if (!current) return
    const { toOwnerId, ...rest } = patch
    const updated: Transaction = { ...current, ...rest, updatedAt: Date.now() }
    if (toOwnerId !== undefined) {
      updated.participantIds = participantsFor(authStore.uid!, toOwnerId)
    }
    await collection.put(updated)
  }

  /** Anyone in `participantIds` can delete — removing a transfer removes it for both sides. */
  async function remove(id: string): Promise<void> {
    await collection.removeLocal(id)
  }

  async function duplicate(id: string): Promise<Transaction | null> {
    const original = collection.all.value.find((t) => t.id === id)
    if (!original) return null
    const { id: _id, createdAt: _c, updatedAt: _u, ownerId, participantIds, ...rest } = original
    const toOwnerId = participantIds.find((p) => p !== ownerId)
    return add({ ...rest, toOwnerId })
  }

  /** Cascade delete used when a category is removed entirely. */
  async function removeByCategory(categoryId: string): Promise<void> {
    const ids = collection.all.value
      .filter((t) => t.categoryId === categoryId || t.subcategoryId === categoryId)
      .map((t) => t.id)
    for (const id of ids) await collection.removeLocal(id)
  }

  /** Cascade delete used when an account is removed entirely. */
  async function removeByAccount(accountId: string): Promise<void> {
    const ids = collection.all.value
      .filter((t) => t.accountId === accountId || t.toAccountId === accountId)
      .map((t) => t.id)
    for (const id of ids) await collection.removeLocal(id)
  }

  function forAccount(accountId: string): Transaction[] {
    return collection.all.value.filter((t) => t.accountId === accountId || t.toAccountId === accountId)
  }

  function forPeriod(start: number, end: number): Transaction[] {
    return collection.all.value.filter((t) => t.date >= start && t.date <= end)
  }

  return {
    all: collection.all,
    loaded: collection.loaded,
    load,
    reset: collection.reset,
    add,
    update,
    remove,
    duplicate,
    removeByCategory,
    removeByAccount,
    forAccount,
    forPeriod,
  }
})
