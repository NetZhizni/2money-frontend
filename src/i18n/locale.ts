import http from '../api/http'

export type Locale = 'uk' | 'en'

/** BCP-47 tag fed to every `Intl` call in the app — one place to extend if a locale ever needs a region variant. */
export const BCP47: Record<Locale, string> = {
  uk: 'uk-UA',
  en: 'en-US',
}

/** First `navigator.languages` entry (falling back to `navigator.language`) that starts with 'uk' or 'en'; 'en' otherwise. */
export function detectLocale(): Locale {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of candidates) {
    const lower = tag.toLowerCase()
    if (lower.startsWith('uk')) return 'uk'
    if (lower.startsWith('en')) return 'en'
  }
  return 'en'
}

/** The Settings screen's language field: 'system' follows the OS/browser (via detectLocale); 'uk'/'en' is an explicit override. */
export type LocaleSetting = 'system' | Locale

const STORAGE_KEY = '2money:locale'

/**
 * Per-device: what THIS browser renders text in always comes from here, read
 * once as a plain constant like `locale` below — never from the backend
 * value directly. `setLocaleSetting` does mirror a change to the backend
 * (best-effort, see there) purely so it survives a fresh login elsewhere —
 * see stores/auth.ts's `seedLocaleSettingFromBackend` call, which is what
 * actually reads that mirrored value back on a device that never chose one.
 */
export function getLocaleSetting(): LocaleSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'uk' || raw === 'en' ? raw : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Persists the override and reloads the page. A reload (rather than making
 * `locale` reactive) is deliberate: dozens of modules — `format.ts`'s
 * month/weekday arrays, `currencies.ts`'s labels, every `t()` call —
 * currently read `locale` once as a plain constant, which is what keeps
 * them simple synchronous reads with no reactivity to wire up. Re-deriving
 * that from scratch on reload is far less code than threading a reactive
 * locale through all of them.
 */
export function setLocaleSetting(next: LocaleSetting): void {
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage unavailable (private mode, quota) — the reload below still
    // picks up the OS/browser locale same as before, just won't remember an override.
  }
  // Fire-and-forget mirror to the backend, same pattern as format.ts's own
  // number/date/currency-display settings — see seedLocaleSettingFromBackend below.
  void http.patch('/settings', { language: next }).catch((error) => {
    console.warn('[locale] settings PATCH failed, will retry on next change', error)
  })
  location.reload()
}

/**
 * One-time adoption of this profile's backend-synced language on a device
 * that has never chosen one locally — same "only touch an absent key" rule
 * and same caller (stores/auth.ts, after every GET /api/auth/me) as
 * format.ts's `seedFormatSettingsFromBackend`, which this mirrors; kept
 * separate only because it lives in this file's own module (`locale`,
 * `STORAGE_KEY`) rather than format.ts's.
 */
export function seedLocaleSettingFromBackend(language: string | null | undefined): boolean {
  try {
    if ((language === 'uk' || language === 'en') && localStorage.getItem(STORAGE_KEY) === null) {
      localStorage.setItem(STORAGE_KEY, language)
      return true
    }
  } catch {
    // Storage unavailable — nothing to seed, this device just keeps its default.
  }
  return false
}

/**
 * Resolved once at app boot and never changes for the life of the tab —
 * `setLocaleSetting` applies a new choice via a full reload instead of live
 * reactivity (see its doc comment). Reading it as a plain constant (rather
 * than a ref/store) keeps every consumer (format.ts, i18n/index.ts,
 * currencies.ts) a single synchronous import.
 */
export const locale: Locale = (() => {
  const setting = getLocaleSetting()
  return setting === 'system' ? detectLocale() : setting
})()

document.documentElement.lang = locale
