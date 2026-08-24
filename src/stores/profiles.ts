import { defineStore } from 'pinia'
import { ref } from 'vue'
import { liveQuery } from 'dexie'
import { db, type UserDirectoryEntry } from '../db/schema'
import { pullUserDirectory } from '../db/sync'
import type { Profile } from '../types/models'

/** Minimal directory row -> Profile shape (email/role/isActive/createdAt aren't in GET /api/users — nothing here reads them). */
function toProfile(entry: UserDirectoryEntry): Profile {
  return {
    uid: entry.id,
    displayName: entry.displayName,
    photoURL: entry.photoUrl,
    color: entry.color,
    email: '',
    role: 'member',
    isActive: true,
    createdAt: 0,
  }
}

/**
 * Every active family member (small, family-scale list) — used to label
 * cross-profile transfer counterparties and the combined-balance breakdown.
 * Backed by Dexie (`db.users`, kept fresh by src/db/sync.ts's
 * pullUserDirectory), so it's available offline from whatever was last synced.
 */
export const useProfilesStore = defineStore('profiles', () => {
  const all = ref<Profile[]>([])
  const loaded = ref(false)
  let subscription: { unsubscribe: () => void } | null = null

  function load(): Promise<void> {
    stop()
    return new Promise((resolve) => {
      let first = true
      subscription = liveQuery(() => db.users.toArray()).subscribe({
        next: (entries) => {
          all.value = entries.map(toProfile)
          loaded.value = true
          if (first) {
            first = false
            resolve()
          }
        },
        error: (error) => console.error('[profiles] liveQuery failed', error),
      })
      void pullUserDirectory()
    })
  }

  function stop() {
    subscription?.unsubscribe()
    subscription = null
  }

  function reset() {
    stop()
    all.value = []
    loaded.value = false
  }

  function byId(uid: string | null | undefined): Profile | undefined {
    if (!uid) return undefined
    return all.value.find((p) => p.uid === uid)
  }

  return { all, loaded, load, reset, byId }
})
