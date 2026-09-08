import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isAxiosError } from 'axios'
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type Auth, type User } from 'firebase/auth'
import { getFirebaseAuth, googleProvider } from '../firebase'
import http from '../api/http'
import { db } from '../db/schema'
import { startAutoSync } from '../db/sync'
import { t } from '../i18n'
import { seedFormatSettingsFromBackend } from '../utils/format'
import { seedLocaleSettingFromBackend } from '../i18n/locale'
import type { AppSettings, Profile } from '../types/models'

const CACHE_KEY = '2money:profile'

/**
 * The synthetic profile local mode (see stores/server.ts's goLocalFirstTime)
 * runs as — always the owner of its own single-device data, never persisted
 * or sent anywhere. `uid: 'local'` is what every store's Dexie rows get
 * stamped with as `ownerId`/`participantIds` while in this mode (same code
 * path as a real profile's uid — see stores/accounts.ts etc.).
 */
const LOCAL_PROFILE: Profile = {
  uid: 'local',
  email: '',
  displayName: t('login.localProfileName'),
  photoURL: null,
  color: '#8a8d91',
  role: 'owner',
  isActive: true,
  createdAt: 0,
}

function mapProfile(apiUser: {
  id: string
  email: string
  displayName: string
  photoUrl: string | null
  color: string
  role: 'owner' | 'member'
  isActive: boolean
  createdAt: number
}): Profile {
  return {
    uid: apiUser.id,
    email: apiUser.email,
    displayName: apiUser.displayName,
    photoURL: apiUser.photoUrl,
    color: apiUser.color,
    role: apiUser.role,
    isActive: apiUser.isActive,
    createdAt: apiUser.createdAt,
  }
}

/**
 * Firebase Auth (Google sign-in) is only the identity layer, and only in
 * "remote" mode (see stores/server.ts) — "am I allowed in, and who am I"
 * comes from the backend's own `users` table, GET /api/auth/me, which also
 * bootstraps the very first owner and 403s anyone not yet provisioned (see
 * backend/src/middleware/auth.js). In "local" mode there is no Firebase, no
 * backend, and no such question — see startLocalMode below.
 *
 * Unlike before, this store no longer wires up `onAuthStateChanged` at
 * module scope: which server (if any) this device talks to — and therefore
 * which Firebase project's `auth` even exists — is only known once
 * stores/server.ts has resolved that (see its `init`/`connect`). It calls
 * exactly one of startRemoteAuth/startLocalMode once it has.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const ready = ref(false)
  const deniedEmail = ref<string | null>(null)
  const deniedMessage = ref<string | null>(null)
  const localMode = ref(false)

  const uid = computed(() => profile.value?.uid ?? null)
  const isOwner = computed(() => profile.value?.role === 'owner')

  let stopSync: (() => void) | null = null
  let stopAuthListener: (() => void) | null = null

  function cacheProfile(p: Profile) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p))
  }

  function readCachedProfile(): Profile | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      return raw ? (JSON.parse(raw) as Profile) : null
    } catch {
      return null
    }
  }

  async function loadProfile(firebaseUser: User, auth: Auth): Promise<void> {
    try {
      const { data } = await http.get('/auth/me')
      profile.value = mapProfile(data.user)
      cacheProfile(profile.value)
      const s = data.settings as
        | Pick<AppSettings, 'baseCurrency' | 'theme' | 'onboarded' | 'language' | 'numberFormat' | 'dateFormat' | 'currencyDisplay'>
        | undefined
      if (s) {
        await db.settings.put({ id: profile.value.uid, baseCurrency: s.baseCurrency, theme: s.theme, onboarded: s.onboarded })
        // One-time adoption of this profile's synced language/number/date/
        // currency-display preference on a device that never chose one of
        // its own (see the seed functions' own doc comments) — a no-op after
        // the first successful login here, since that already fills in the
        // localStorage key each one checks for.
        const changedFormat = seedFormatSettingsFromBackend(s)
        const changedLocale = seedLocaleSettingFromBackend(s.language)
        if (changedFormat || changedLocale) {
          location.reload()
          return
        }
      }
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 403) {
        deniedEmail.value = firebaseUser.email
        deniedMessage.value = (error.response.data as { message?: string })?.message ?? null
        localStorage.removeItem(CACHE_KEY)
        await firebaseSignOut(auth)
        return
      }
      // Offline (or backend unreachable) on a session that already logged in
      // successfully before — fall back to what GET /api/auth/me returned
      // last time instead of blocking the whole app on a network error.
      const cached = readCachedProfile()
      if (cached) {
        profile.value = cached
      } else {
        deniedEmail.value = firebaseUser.email
        deniedMessage.value = t('login.noConnectionNoOfflineProfile')
        return
      }
    }
  }

  /** Called once by stores/server.ts once it has a connected server's Firebase app initialized. */
  function startRemoteAuth(): void {
    reset()
    const auth = getFirebaseAuth()
    stopAuthListener = onAuthStateChanged(auth, async (firebaseUser) => {
      stopSync?.()
      stopSync = null
      deniedEmail.value = null
      deniedMessage.value = null
      user.value = firebaseUser

      if (!firebaseUser) {
        profile.value = null
        ready.value = true
        return
      }

      await loadProfile(firebaseUser, auth)
      if (profile.value) stopSync = startAutoSync(() => profile.value?.uid ?? null)
      ready.value = true
    })
  }

  /** Called once by stores/server.ts's goLocalFirstTime — no Firebase, no backend, no sync: just the synthetic single-device profile, immediately ready. */
  function startLocalMode(): void {
    reset()
    localMode.value = true
    profile.value = LOCAL_PROFILE
    ready.value = true
    // db/sync.ts's enqueue* functions now skip the outbox entirely in local
    // mode (there's no server that will ever drain it), but a device that
    // used local mode before that fix can still be sitting on outbox rows
    // from back then — which would otherwise show every record as
    // permanently "pending sync" forever, since nothing will ever push them.
    // Best-effort, one-time cleanup on every local-mode boot.
    void db.outbox.clear().catch((error) => console.warn('[auth] failed to clear stale local-mode outbox', error))
  }

  function reset(): void {
    stopAuthListener?.()
    stopAuthListener = null
    stopSync?.()
    stopSync = null
    user.value = null
    profile.value = null
    ready.value = false
    deniedEmail.value = null
    deniedMessage.value = null
    localMode.value = false
  }

  async function signInWithGoogle(): Promise<void> {
    deniedEmail.value = null
    deniedMessage.value = null
    await signInWithPopup(getFirebaseAuth(), googleProvider)
    // onAuthStateChanged (see startRemoteAuth) drives `user`/`profile`/`deniedEmail` from here.
  }

  async function signOutUser(): Promise<void> {
    if (localMode.value) {
      // Nothing to sign out of — "signing out" of local mode just means
      // leaving it, which is handled by stores/server.ts's switchTo (it
      // needs to also decide what to switch TO), not this store alone.
      return
    }
    await firebaseSignOut(getFirebaseAuth())
  }

  return {
    user,
    profile,
    ready,
    deniedEmail,
    deniedMessage,
    localMode,
    uid,
    isOwner,
    signInWithGoogle,
    signOut: signOutUser,
    startRemoteAuth,
    startLocalMode,
    reset,
  }
})
