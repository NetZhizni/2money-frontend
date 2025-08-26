import './assets/main.scss'
import '@quasar/extras/mdi-v7/mdi-v7.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Quasar } from 'quasar'
import mdiSvgCdn from 'quasar/icon-set/mdi-v7.js'

import App from './App.vue'
import router from './router'

const app = createApp(App)
const pinia = createPinia()

app
  .use(pinia)
  .use(router)
  .use(Quasar, {
    plugins: {}, // import Quasar plugins and add here
    iconSet: mdiSvgCdn,
  })
  .mount('#app')
