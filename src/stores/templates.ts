import { defineStore } from 'pinia'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { generateDueRecurring } from '../db/recurring'
import { useAuthStore } from './auth'
import { useSettingsStore } from './settings'
import type { RecurringTemplate } from '../types/models'

export type NewTemplateInput = Omit<RecurringTemplate, 'id' | 'createdAt' | 'ownerId'>

export const useTemplatesStore = defineStore('templates', () => {
  const authStore = useAuthStore()
  const collection = useSyncedCollection<RecurringTemplate>('recurringTemplates', () => {
    if (!authStore.uid) return []
    return db.recurringTemplates.where('ownerId').equals(authStore.uid).toArray()
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  async function add(input: NewTemplateInput): Promise<RecurringTemplate> {
    const template: RecurringTemplate = { ...input, id: newId(), ownerId: authStore.uid!, createdAt: Date.now() }
    await collection.put(template)
    return template
  }

  async function update(id: string, patch: Partial<RecurringTemplate>): Promise<void> {
    const current = collection.all.value.find((t) => t.id === id)
    if (!current) return
    await collection.put({ ...current, ...patch })
  }

  async function remove(id: string): Promise<void> {
    await collection.removeLocal(id)
  }

  /**
   * Runs due-recurring generation. Call once on app start. Writes go through
   * `transactions.add`/this store's own `update` (both Dexie + outbox), so
   * the already-subscribed liveQuery views pick them up with no manual reload.
   */
  async function runDueGeneration(): Promise<number> {
    const settings = useSettingsStore()
    if (!authStore.uid) return 0
    return generateDueRecurring(collection.all.value, authStore.uid, Date.now(), settings.baseCurrency)
  }

  return { all: collection.all, loaded: collection.loaded, load, reset: collection.reset, add, update, remove, runDueGeneration }
})
