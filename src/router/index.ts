import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Auth gating lives in App.vue (it renders LoginView directly and never
// mounts RouterView until signed in), so there's no dedicated /login route
// here and no navigation guard needed — every route below is only ever
// reachable once App.vue has already confirmed the user is authenticated.
// /admin is the one exception: it also needs an OWNER, not just any
// signed-in profile (see the beforeEach guard below).
const routes = [
  { path: '/', redirect: '/categories' },
  { path: '/accounts', name: 'accounts', component: () => import('../views/AccountsView.vue') },
  { path: '/categories', name: 'categories', component: () => import('../views/CategoriesView.vue') },
  { path: '/operations', name: 'operations', component: () => import('../views/OperationsView.vue') },
  { path: '/overview', name: 'overview', component: () => import('../views/OverviewView.vue') },
  { path: '/total', name: 'total', component: () => import('../views/TotalBalanceView.vue') },
  { path: '/admin', name: 'admin', component: () => import('../views/AdminUsersView.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.name !== 'admin') return true
  const authStore = useAuthStore()
  return authStore.isOwner ? true : '/'
})

// Every route's component is a dynamic import() (see `routes` above). After a
// new deploy, the old build's chunk files are gone from the server — a tab
// left open on the previous build then fails this fetch the moment it
// navigates to any route it hasn't already loaded, leaving the shell (nav
// bars) rendered but RouterView's content empty, since the failed import
// never resolves a component to show. The PWA service worker's `autoUpdate`
// makes this worse: it can activate a new precache in the background while
// the page is open, so even routes visited earlier in the session can start
// failing later. A one-time hard reload picks up the new build's chunks and
// is the standard fix vue-router itself recommends for this class of error.
router.onError((error, to) => {
  const isChunkLoadError =
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
      error.message,
    )
  if (!isChunkLoadError) return

  const target = to.fullPath
  if (sessionStorage.getItem('chunk-reload-target') === target) return // already retried once for this route — avoid a reload loop
  sessionStorage.setItem('chunk-reload-target', target)
  window.location.href = target
})

// Clears the retry marker once a route actually loads, so a later transient
// failure on the same route (unrelated to a stale build) can still retry.
router.afterEach((to) => {
  if (sessionStorage.getItem('chunk-reload-target') === to.fullPath) {
    sessionStorage.removeItem('chunk-reload-target')
  }
})
