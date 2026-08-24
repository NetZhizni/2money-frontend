import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isAxiosError } from 'axios'
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import http from '../api/http'
import { db } from '../db/schema'
import { startAutoSync } from '../db/sync'
import type { AppSettings, Profile } from '../types/models'

const CACHE_KEY = '2money:profile'

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
 * Firebase Auth (Google sign-in) is now ONLY the identity layer. "Am I
 * allowed in, and who am I" comes from the backend's own `users` table —
 * GET /api/auth/me — which also bootstraps the very first owner and 403s
 * anyone not yet provisioned (see src/middleware/auth.js on the backend).
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const ready = ref(false)
  const deniedEmail = ref<string | null>(null)
  const deniedMessage = ref<string | null>(null)

  const uid = computed(() => profile.value?.uid ?? null)
  const isOwner = computed(() => profile.value?.role === 'owner')

  let stopSync: (() => void) | null = null

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

  async function loadProfile(firebaseUser: User): Promise<void> {
    try {
      const { data } = await http.get('/auth/me')
      profile.value = mapProfile(data.user)
      cacheProfile(profile.value)
      const s = data.settings as { baseCurrency: string; theme: AppSettings['theme']; onboarded: boolean } | undefined
      if (s) await db.settings.put({ id: profile.value.uid, baseCurrency: s.baseCurrency, theme: s.theme, onboarded: s.onboarded })
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
        deniedMessage.value = 'Немає з’єднання з сервером, і немає збереженого профілю для офлайн-входу.'
        return
      }
    }
  }

  onAuthStateChanged(auth, async (firebaseUser) => {
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

    await loadProfile(firebaseUser)
    if (profile.value) stopSync = startAutoSync(() => profile.value?.uid ?? null)
    ready.value = true
  })

  async function signInWithGoogle(): Promise<void> {
    deniedEmail.value = null
    deniedMessage.value = null
    await signInWithPopup(auth, googleProvider)
    // onAuthStateChanged drives `user`/`profile`/`deniedEmail` from here.
  }

  async function signOutUser(): Promise<void> {
    await firebaseSignOut(auth)
  }

  return {
    user,
    profile,
    ready,
    deniedEmail,
    deniedMessage,
    uid,
    isOwner,
    signInWithGoogle,
    signOut: signOutUser,
  }
})
