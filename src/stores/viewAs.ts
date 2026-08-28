import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from './auth'

export type ViewMode = 'self' | 'user' | 'all'

/**
 * "View as" — lets the signed-in user browse Accounts/Categories/Operations/
 * Overview from another family member's perspective (read-only), or all of
 * them merged together (also read-only). Purely a client-side UI lens: it
 * never survives a reload (see TopHeader's UserSwitcherModal) and never
 * changes which uid writes are attributed to — the per-profile stores
 * (accounts/categories/transactions/budgets) just re-query Dexie filtered by
 * `effectiveUid` instead of the authenticated user's own uid.
 */
export const useViewAsStore = defineStore('viewAs', () => {
  const authStore = useAuthStore()

  // Set only while mode is 'user'; both are cleared by viewSelf()/reset().
  const viewedUid = ref<string | null>(null)
  const viewingAll = ref(false)

  const mode = computed<ViewMode>(() => (viewingAll.value ? 'all' : viewedUid.value ? 'user' : 'self'))

  /** uid the per-profile stores should filter by — null in 'all' mode, where they return every owner's rows unfiltered. */
  const effectiveUid = computed(() => (mode.value === 'all' ? null : (viewedUid.value ?? authStore.uid)))

  const isReadOnly = computed(() => mode.value !== 'self')

  function viewSelf() {
    viewedUid.value = null
    viewingAll.value = false
  }

  function viewUser(uid: string) {
    if (uid === authStore.uid) {
      viewSelf()
      return
    }
    viewedUid.value = uid
    viewingAll.value = false
  }

  function viewAll() {
    viewedUid.value = null
    viewingAll.value = true
  }

  /** Called on sign-out/sign-in so a stale "viewing X" selection never survives a session switch. */
  function reset() {
    viewedUid.value = null
    viewingAll.value = false
  }

  return { mode, effectiveUid, isReadOnly, viewSelf, viewUser, viewAll, reset }
})
