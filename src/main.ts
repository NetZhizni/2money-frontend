import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { setupServiceWorker } from './pwa/updateService'
import './style.scss'

// Dev-only service worker (see vite.config.ts's devOptions.enabled) is
// meant purely to test PWA installability locally — registering it during
// `npm run dev` fights Vite's ever-changing dev-sw.js: `clientsClaim: true`
// makes each "new" registration immediately claim the tab, which fires
// `controllerchange`, which `virtual:pwa-register` reacts to by reloading
// the page — so it re-registers, re-claims, and reloads again forever. A
// production build has a stable, versioned precache and doesn't hit this.
if (import.meta.env.PROD) setupServiceWorker()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
