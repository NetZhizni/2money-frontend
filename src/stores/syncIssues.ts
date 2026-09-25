import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { liveQuery } from 'dexie'
import { db, type SyncIssue } from '../db/schema'
import { useAuthStore } from './auth'

const SEEN_KEY = 'stork:syncIssuesSeenUpTo'

function readSeen(uid: string | null): number {
  if (!uid) return 0
  try {
    const n = Number(localStorage.getItem(`${SEEN_KEY}:${uid}`))
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function writeSeen(uid: string | null, value: number): void {
  if (!uid) return
  try {
    localStorage.setItem(`${SEEN_KEY}:${uid}`, String(value))
  } catch {
    // Storage unavailable — the toast just shows again after a reload.
  }
}

/**
 * The signed-in profile's changes the server never took (see db/schema.ts's
 * SyncIssue), newest first — listed in the sync details modal
 * (components/layout/SyncStatusBadge.vue) and announced by
 * components/layout/SyncIssuesToast.vue. "Seen" is the highest issue id the
 * user has been shown, remembered per profile on this device, so an issue
 * that arrived just before the app was closed still gets its toast on the
 * next launch.
 */
export const useSyncIssuesStore = defineStore('syncIssues', () => {
  const authStore = useAuthStore()
  const issues = ref<SyncIssue[]>([])
  const seenUpTo = ref(0)
  // Shared rather than local to the badge, so the toast can open the same modal.
  const detailsOpen = ref(false)
  let subscription: { unsubscribe: () => void } | null = null

  watch(
    () => authStore.uid,
    (uid) => {
      subscription?.unsubscribe()
      subscription = null
      issues.value = []
      seenUpTo.value = readSeen(uid)
      if (!uid) return
      subscription = liveQuery(() => db.syncIssues.where('ownerId').equals(uid).reverse().sortBy('at')).subscribe({
        next: (rows) => {
          issues.value = rows
          // Nothing to announce about an issue that shows up while its list is already on screen.
          if (detailsOpen.value) markSeen()
        },
        error: (error) => console.error('[syncIssues] liveQuery failed', error),
      })
    },
    { immediate: true },
  )

  const unseen = computed(() => issues.value.filter((issue) => (issue.id ?? 0) > seenUpTo.value))

  function markSeen(): void {
    const newest = issues.value.reduce((max, issue) => Math.max(max, issue.id ?? 0), seenUpTo.value)
    if (newest === seenUpTo.value) return
    seenUpTo.value = newest
    writeSeen(authStore.uid, newest)
  }

  function openDetails(): void {
    markSeen()
    detailsOpen.value = true
  }

  return { issues, unseen, detailsOpen, markSeen, openDetails }
})
