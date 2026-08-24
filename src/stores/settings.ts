import { defineStore } from 'pinia'
import { ref } from 'vue'
import { liveQuery } from 'dexie'
import { db } from '../db/schema'
import http from '../api/http'
import { useAuthStore } from './auth'
import type { AppSettings } from '../types/models'

/**
 * One row per profile, read/written straight from Dexie (seeded on login by
 * stores/auth.ts from GET /api/auth/me). Unlike the other stores this one
 * doesn't go through the outbox — it's a low-stakes preference, so a change
 * made while offline is simply a best-effort PATCH that's retried the next
 * time it changes online; it isn't queued for guaranteed delivery.
 */
export const useSettingsStore = defineStore('settings', () => {
  const baseCurrency = ref('UAH')
  const theme = ref<AppSettings['theme']>('system')
  const loaded = ref(false)
  let subscription: { unsubscribe: () => void } | null = null

  function load(): Promise<void> {
    stop()
    const authStore = useAuthStore()
    if (!authStore.uid) return Promise.resolve()
    const uid = authStore.uid

    return new Promise((resolve) => {
      let first = true
      subscription = liveQuery(() => db.settings.get(uid)).subscribe({
        next: (s) => {
          if (s) {
            baseCurrency.value = s.baseCurrency
            theme.value = s.theme
          }
          loaded.value = true
          if (first) {
            first = false
            resolve()
          }
        },
        error: (error) => console.error('[settings] liveQuery failed', error),
      })
    })
  }

  function stop() {
    subscription?.unsubscribe()
    subscription = null
  }

  function reset() {
    stop()
    baseCurrency.value = 'UAH'
    theme.value = 'system'
    loaded.value = false
  }

  async function persist(patch: Partial<Pick<AppSettings, 'baseCurrency' | 'theme' | 'onboarded'>>) {
    const authStore = useAuthStore()
    if (!authStore.uid) return
    const current = (await db.settings.get(authStore.uid)) ?? {
      id: authStore.uid,
      baseCurrency: baseCurrency.value,
      theme: theme.value,
      onboarded: true,
    }
    await db.settings.put({ ...current, ...patch })
    try {
      await http.patch('/settings', patch)
    } catch (error) {
      console.warn('[settings] PATCH failed, will reconcile on next successful change', error)
    }
  }

  async function setBaseCurrency(code: string) {
    baseCurrency.value = code
    await persist({ baseCurrency: code })
  }

  async function setTheme(value: AppSettings['theme']) {
    theme.value = value
    await persist({ theme: value })
  }

  return { baseCurrency, theme, loaded, load, reset, setBaseCurrency, setTheme }
})
