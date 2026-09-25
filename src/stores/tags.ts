import { defineStore } from 'pinia'
import { computed } from 'vue'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { useAuthStore } from './auth'
import { useTransactionsStore } from './transactions'
import { assertWritable } from './guards'
import type { Tag } from '../types/models'

export type NewTagInput = Omit<Tag, 'id' | 'createdAt' | 'ownerId'>

/**
 * Tags are a SHARED family resource, same as categories (see
 * stores/categories.ts's own doc comment) — every active member sees and can
 * create/edit/delete the same list, so this store has no owner filter at all.
 */
export const useTagsStore = defineStore('tags', () => {
  const authStore = useAuthStore()
  const collection = useSyncedCollection<Tag>('tags', async () => {
    const rows = await db.tags.toArray()
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  const active = computed(() => collection.all.value.filter((tg) => !tg.archived))
  const archived = computed(() => collection.all.value.filter((tg) => tg.archived))

  function byId(id: string | null | undefined): Tag | undefined {
    if (!id) return undefined
    return collection.all.value.find((tg) => tg.id === id)
  }

  async function add(input: NewTagInput): Promise<Tag> {
    assertWritable()
    const tag: Tag = { archived: false, ...input, id: newId(), ownerId: authStore.uid!, createdAt: Date.now() }
    await collection.put(tag)
    return tag
  }

  async function update(id: string, patch: Partial<Tag>): Promise<void> {
    assertWritable()
    const current = collection.all.value.find((tg) => tg.id === id)
    if (!current) return
    await collection.put({ ...current, ...patch })
  }

  /**
   * Soft alternative to remove(): the tag stays on every operation that
   * already carries it (and in analytics/the operations filter), it just
   * stops being offered in TagPickerModal for new ones.
   */
  async function setArchived(id: string, archivedValue: boolean): Promise<void> {
    await update(id, { archived: archivedValue })
  }

  /**
   * Hard delete — also strips this tag out of every transaction THIS profile
   * owns (an operation just loses the label, it isn't deleted). Scoped to
   * `ownerId === myUid` on purpose, not every visible transaction: the
   * backend only accepts writes to records this profile owns (same
   * cross-member write restriction stores/categories.ts's merge() already
   * documents), so touching another family member's transaction here would
   * just get silently rejected server-side and drift back on the next pull.
   * Their own copy keeps the now-deleted tag's id until they themselves
   * touch that transaction — same accepted gap a removed category already
   * leaves behind (see CategoryRankList's `?? '—'` fallback).
   */
  async function remove(id: string): Promise<void> {
    assertWritable()
    const transactions = useTransactionsStore()
    const myUid = authStore.uid
    const affected = transactions.all.filter((tx) => tx.ownerId === myUid && tx.tagIds?.includes(id))
    for (const tx of affected) {
      await transactions.update(tx.id, { tagIds: tx.tagIds!.filter((tagId) => tagId !== id) })
    }
    await collection.removeLocal(id)
  }

  return {
    all: collection.all,
    active,
    archived,
    loaded: collection.loaded,
    load,
    reset: collection.reset,
    isPending: collection.isPending,
    byId,
    add,
    update,
    setArchived,
    remove,
  }
})
