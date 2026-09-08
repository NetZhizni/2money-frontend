import axios from 'axios'

/**
 * Persistence + network layer behind "connect this device to a server"
 * (see stores/server.ts for the reactive state, views/ServerSetupView.vue
 * for the UI). Kept dependency-free of Vue/Pinia on purpose: src/api/http.ts
 * reads `getPersistedServerUrl` synchronously at module-eval time (before
 * any store exists) to compute its baseURL, and stores/server.ts's `init()`
 * needs the exact same synchronous read to decide what to boot into.
 */

export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

export interface RemoteConfig {
  firebase: FirebaseWebConfig
  features: { receiptScanning: boolean }
}

const SERVER_URL_KEY = '2money:serverUrl'
const LOCAL_MODE_KEY = '2money:localMode'
const REMOTE_CONFIG_CACHE_KEY = '2money:remoteConfig'

export class RemoteConfigError extends Error {
  code: 'network' | 'invalid'
  constructor(code: 'network' | 'invalid', message: string) {
    super(message)
    this.code = code
  }
}

/**
 * "money.example.com", "https://money.example.com/", "  http://localhost:3100 "
 * all resolve to the same normalized origin (no trailing slash, scheme
 * defaulted to https so a bare domain typed by a user works out of the box).
 * Throws RemoteConfigError('invalid', …) — never returns something unusable.
 */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) throw new RemoteConfigError('invalid', 'Server URL is empty')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    return `${url.protocol}//${url.host}`
  } catch {
    throw new RemoteConfigError('invalid', `Not a valid URL: ${input}`)
  }
}

export function apiBaseUrl(serverUrl: string): string {
  return `${serverUrl}/api`
}

/** Maps a fetchRemoteConfig() failure to an i18n message key (see messages/server.ts) — shared by ServerSetupView and SettingsModal.vue's "change server" flow so both report the same errors the same way. */
export function describeRemoteConfigError(error: unknown): 'server.errorUnreachable' | 'server.errorInvalid' | 'server.errorUnknown' {
  if (error instanceof RemoteConfigError) {
    return error.code === 'network' ? 'server.errorUnreachable' : 'server.errorInvalid'
  }
  return 'server.errorUnknown'
}

const FETCH_TIMEOUT_MS = 8_000

/**
 * GET {serverUrl}/api/config/public (see backend/src/routers/config.js).
 * Deliberately a bare axios call, not the shared `http` client
 * (src/api/http.ts) — that client's baseURL and Authorization header belong
 * to whatever server is ALREADY connected, and must not leak a token meant
 * for one backend into a probe of a completely different one.
 */
export async function fetchRemoteConfig(serverUrl: string): Promise<RemoteConfig> {
  let data: unknown
  try {
    const response = await axios.get(`${apiBaseUrl(serverUrl)}/config/public`, { timeout: FETCH_TIMEOUT_MS })
    data = response.data
  } catch (cause) {
    throw new RemoteConfigError('network', `Server unreachable: ${(cause as Error).message}`)
  }

  const d = data as { service?: string; firebase?: Partial<FirebaseWebConfig>; features?: { receiptScanning?: boolean } }
  const fb = d?.firebase
  if (d?.service !== '2money-backend' || !fb?.apiKey || !fb?.projectId || !fb?.appId) {
    throw new RemoteConfigError('invalid', 'Not a 2Money server (unexpected /api/config/public response)')
  }

  return {
    firebase: {
      apiKey: fb.apiKey,
      authDomain: fb.authDomain ?? '',
      projectId: fb.projectId,
      storageBucket: fb.storageBucket ?? '',
      messagingSenderId: fb.messagingSenderId ?? '',
      appId: fb.appId,
    },
    features: { receiptScanning: Boolean(d.features?.receiptScanning) },
  }
}

function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocalStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode, quota) — the in-memory state this
    // session used still works, it just won't survive a reload.
  }
}

export function getPersistedServerUrl(): string | null {
  return readLocalStorage(SERVER_URL_KEY)
}

export function persistServerUrl(url: string | null): void {
  writeLocalStorage(SERVER_URL_KEY, url)
}

export function getPersistedLocalMode(): boolean {
  return readLocalStorage(LOCAL_MODE_KEY) === '1'
}

export function persistLocalMode(value: boolean): void {
  writeLocalStorage(LOCAL_MODE_KEY, value ? '1' : null)
}

export function getCachedRemoteConfig(): RemoteConfig | null {
  const raw = readLocalStorage(REMOTE_CONFIG_CACHE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as RemoteConfig
  } catch {
    return null
  }
}

export function persistCachedRemoteConfig(config: RemoteConfig | null): void {
  writeLocalStorage(REMOTE_CONFIG_CACHE_KEY, config ? JSON.stringify(config) : null)
}

/**
 * Whether *any* network sync/scan call is meaningful right now — a server
 * URL is persisted, whether or not it's currently reachable. src/db/sync.ts
 * checks this before every push/pull so local-mode devices (see
 * getPersistedLocalMode) never fire a doomed request against a server that
 * was never configured in the first place.
 */
export function hasConfiguredServer(): boolean {
  return getPersistedServerUrl() !== null
}
