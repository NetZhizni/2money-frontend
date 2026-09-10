import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { setupServiceWorker } from './pwa/updateService'
import { i18n, locale, preloadLocale } from './i18n'
import './styles/style.scss'

// Dev-only service worker (see vite.config.ts's devOptions.enabled) is
// meant purely to test PWA installability locally — registering it during
// `npm run dev` fights Vite's ever-changing dev-sw.js: `clientsClaim: true`
// makes each "new" registration immediately claim the tab, which fires
// `controllerchange`, which `virtual:pwa-register` reacts to by reloading
// the page — so it re-registers, re-claims, and reloads again forever. A
// production build has a stable, versioned precache and doesn't hit this.
if (import.meta.env.PROD) setupServiceWorker()

// i18n/index.ts lazy-loads every locale but `en` — awaited here so the very
// first paint already renders in the device's actual locale instead of
// flashing the English fallback while that chunk is still in flight. Only
// blocks the initial mount, not later `setLocaleSetting` switches (those
// apply live — see i18n/locale.ts).
async function bootstrap() {
  await preloadLocale(locale.value)

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(i18n)
  app.mount('#app')
}

void bootstrap()
