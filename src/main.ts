import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { setupServiceWorker } from './pwa/updateService'
import './style.css'

setupServiceWorker()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
