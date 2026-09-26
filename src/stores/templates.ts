import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { runDueRecurring, firstOccurrenceFrom, passOccurrence, scheduledNext } from '../db/recurring'
import { startOfDay } from '../utils/format'
import { useAuthStore } from './auth'
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

  function byId(id: string | null | undefined): RecurringTemplate | undefined {
    if (!id) return undefined
    return collection.all.value.find((t) => t.id === id)
  }

  async function add(input: NewTemplateInput): Promise<RecurringTemplate> {
    const template: RecurringTemplate = { ...input, id: newId(), ownerId: authStore.uid!, createdAt: Date.now() }
    await collection.put(template)
    return template
  }

  // toRaw: `current` comes out of a deep ref, so its tagIds would otherwise
  // still be a reactive Proxy, which Dexie's structured clone refuses (same
  // reason as stores/transactions.ts's update()).
  async function update(id: string, patch: Partial<RecurringTemplate>): Promise<void> {
    const current = byId(id)
    if (!current) return
    await collection.put({ ...toRaw(current), ...patch })
  }

  async function remove(id: string): Promise<void> {
    await collection.removeLocal(id)
  }

  /**
   * Pause stops the schedule where it is; resume picks it up at the first
   * occurrence from today on, so a long pause doesn't come back as a pile of
   * back-dated operations (or, for a requireConfirm template, of reminders).
   */
  async function setPaused(id: string, paused: boolean): Promise<void> {
    const current = byId(id)
    if (!current) return
    if (paused) return update(id, { active: false })
    const nextDate = firstOccurrenceFrom(toRaw(current), startOfDay(Date.now()))
    await update(id, { active: current.endDate == null || nextDate <= current.endDate, nextDate })
  }

  /**
   * One occurrence dealt with by hand — booked (see TransactionFormModal.vue's
   * `occurrence`) or skipped — moves the schedule one step past it. Only if
   * it's still the template's next one: a second device (or a double tap)
   * that already moved it along leaves nothing to do.
   */
  async function passOccurrenceOf(id: string, occurrence: number): Promise<void> {
    const current = byId(id)
    if (!current || scheduledNext(current) !== occurrence) return
    await collection.put(passOccurrence(toRaw(current), occurrence))
  }

  /**
   * Runs due-recurring generation. Call once on app start. Writes go to Dexie
   * + the outbox (see db/recurring.ts's runDueRecurring, which also keeps two
   * tabs from generating the same occurrences), so the already-subscribed
   * liveQuery views pick them up with no manual reload.
   */
  async function runDueGeneration(): Promise<number> {
    if (!authStore.uid) return 0
    return runDueRecurring(authStore.uid)
  }

  return {
    all: collection.all,
    loaded: collection.loaded,
    load,
    reset: collection.reset,
    isPending: collection.isPending,
    byId,
    add,
    update,
    remove,
    setPaused,
    passOccurrence: passOccurrenceOf,
    runDueGeneration,
  }
})
