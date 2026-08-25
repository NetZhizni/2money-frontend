import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

// How often to poll for a new deployed version while the app sits open in a
// tab. The browser's own SW byte-check is capped at 24h (HTML spec) and only
// fires on navigation, which is too slow for an app people keep open all
// day — this fills that gap with an explicit `registration.update()`.
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 година

// True once a new service worker has installed and is waiting to activate.
// UpdateToast.vue watches this to show the "оновити застосунок" popup.
export const updateAvailable = ref(false)

let applyUpdateFn: ((reloadPage?: boolean) => Promise<void>) | null = null
let swRegistration: ServiceWorkerRegistration | null = null

export function setupServiceWorker() {
  applyUpdateFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailable.value = true
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      swRegistration = registration
      setInterval(() => {
        registration.update().catch(() => {
          // Offline or request failed — next tick tries again.
        })
      }, CHECK_INTERVAL_MS)
    },
  })
}

// Activates the waiting service worker and reloads the page to run the new
// version. Called from the update popup's "Оновити" button.
export async function applyUpdate() {
  if (!applyUpdateFn) return
  await applyUpdateFn(true)
}

// Manually asks the browser to re-fetch the service worker file right now,
// instead of waiting for the hourly interval or a full page navigation.
// Called from the "Перевірити оновлення" button in Settings. If a new
// version installs, it's applied immediately (page reloads); otherwise the
// caller is told there's nothing new.
export async function forceCheckForUpdate(): Promise<'updated' | 'up-to-date' | 'error'> {
  if (!swRegistration) return 'error'
  try {
    await swRegistration.update()
  } catch {
    return 'error'
  }
  // registerSW's onNeedRefresh fires asynchronously once the new worker
  // finishes downloading and installing — give it a moment before
  // concluding there's nothing new.
  for (let i = 0; i < 10; i++) {
    if (updateAvailable.value) {
      await applyUpdate()
      return 'updated'
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return 'up-to-date'
}
