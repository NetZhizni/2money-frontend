import { ref, watch } from 'vue'
import http from '../api/http'

/**
 * Every language the app can render in. Picked to cover the countries
 * Ukrainian families most often resettle to (pl/de/cs/sk/hu/ro/nl/sv, plus
 * fr/es/it/pt) alongside the world's other most-spoken languages
 * (ru/tr/ar/zh/ja/ko/hi), on top of the original uk/en.
 */
export type Locale =
  | 'uk'
  | 'en'
  | 'ru'
  | 'pl'
  | 'de'
  | 'fr'
  | 'es'
  | 'it'
  | 'pt'
  | 'ro'
  | 'cs'
  | 'sk'
  | 'hu'
  | 'nl'
  | 'sv'
  | 'tr'
  | 'ar'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'hi'

/** Every supported locale, in the order shown in the picker (see components/layout/LanguagePickerModal.vue) — the one place to extend when another language is added. */
export const LOCALES: Locale[] = [
  'uk', 'en', 'ru', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'ro',
  'cs', 'sk', 'hu', 'nl', 'sv', 'tr', 'ar', 'zh', 'ja', 'ko', 'hi',
]

/** A locale's own name, in ITS OWN language — what the picker shows (never translated into the currently-active language, so it stays readable to someone who can't read the current one). */
export const LOCALE_NAMES: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
  ru: 'Русский',
  pl: 'Polski',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  ro: 'Română',
  cs: 'Čeština',
  sk: 'Slovenčina',
  hu: 'Magyar',
  nl: 'Nederlands',
  sv: 'Svenska',
  tr: 'Türkçe',
  ar: 'العربية',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  hi: 'हिन्दी',
}

/** Right-to-left locales — flips `<html dir>` (see the bottom of this file) so native form controls and bidi text lay out correctly. The rest of the UI isn't mirrored (no logical-property pass over every component), but text direction itself is correct. */
const RTL_LOCALES: Locale[] = ['ar']

/** Path to a locale's flag icon (see public/flags — vendored from the Circle Flags project, MIT-licensed; files are named by locale code already, so no separate lookup table is needed here). */
export function localeFlagUrl(loc: Locale): string {
  return `/flags/${loc}.svg`
}

/** BCP-47 tag fed to every `Intl` call in the app. */
export const BCP47: Record<Locale, string> = {
  uk: 'uk-UA',
  en: 'en-US',
  ru: 'ru-RU',
  pl: 'pl-PL',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  ro: 'ro-RO',
  cs: 'cs-CZ',
  sk: 'sk-SK',
  hu: 'hu-HU',
  nl: 'nl-NL',
  sv: 'sv-SE',
  tr: 'tr-TR',
  ar: 'ar-SA',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  hi: 'hi-IN',
}

/** First `navigator.languages` entry (falling back to `navigator.language`) that matches a supported locale; 'en' otherwise. */
export function detectLocale(): Locale {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of candidates) {
    const lower = tag.toLowerCase()
    const match = LOCALES.find((loc) => lower === loc || lower.startsWith(`${loc}-`))
    if (match) return match
  }
  return 'en'
}

/** The Settings screen's language field: 'system' follows the OS/browser (via detectLocale); an explicit `Locale` is an override. */
export type LocaleSetting = 'system' | Locale

const STORAGE_KEY = '2money:locale'

// Separate from STORAGE_KEY above on purpose: 'system' is itself a valid,
// deliberate choice on the language-onboarding screen (see
// views/LanguageOnboardingView.vue), so "has a value been saved" alone can't
// tell that screen apart from "never asked at all" — this flag is the one
// thing that does, and it's set unconditionally by setLocaleSetting below
// regardless of which option was picked (including a later change from
// Settings, which harmlessly re-confirms it).
const CHOSEN_KEY = '2money:locale-chosen'

/** Whether the user has ever gone through the language choice — either the first-launch screen or Settings → Мова. Gates App.vue's LanguageOnboardingView. */
export function hasChosenLocale(): boolean {
  try {
    if (localStorage.getItem(CHOSEN_KEY) === '1') return true
    // Back-compat: a device that explicitly set an override before this
    // screen existed already made this choice — don't re-ask it.
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return true // storage unavailable — never block boot on it, just skip the screen
  }
}

function markLocaleChosen(): void {
  try {
    localStorage.setItem(CHOSEN_KEY, '1')
  } catch {
    // Storage unavailable — same as above, harmless to skip remembering this.
  }
}

function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value)
}

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
    return raw && isLocale(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Persists the override and applies it live — `locale` is a `ref`, so every
 * `t()` call, `format.ts`'s month/weekday arrays and `currencies.ts`'s
 * labels all re-derive themselves the moment `locale.value` changes (each
 * via its own `watch(locale, …)`; see format.ts and i18n/index.ts). No
 * reload: i18n/index.ts lazy-loads each locale's strings on first use (see
 * its own doc comment), so switching may show a brief English fallback for
 * text that hasn't finished loading yet, same as any other locale not yet
 * fetched.
 */
export function setLocaleSetting(next: LocaleSetting): void {
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage unavailable (private mode, quota) — this device just won't remember an override.
  }
  markLocaleChosen()
  // Fire-and-forget mirror to the backend, same pattern as format.ts's own
  // number/date/currency-display settings — see seedLocaleSettingFromBackend below.
  void http.patch('/settings', { language: next }).catch((error) => {
    console.warn('[locale] settings PATCH failed, will retry on next change', error)
  })
  locale.value = next === 'system' ? detectLocale() : next
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
    if (language && isLocale(language) && localStorage.getItem(STORAGE_KEY) === null) {
      localStorage.setItem(STORAGE_KEY, language)
      return true
    }
  } catch {
    // Storage unavailable — nothing to seed, this device just keeps its default.
  }
  return false
}

/**
 * The single source of truth for what the UI is currently rendered in — a
 * `ref` (not a plain constant) so `setLocaleSetting` can apply a new choice
 * live: every consumer (format.ts, i18n/index.ts, currencies.ts) reads
 * `locale.value`, either directly or through its own `watch(locale, …)`,
 * instead of capturing it once at import time.
 */
export const locale = ref<Locale>((() => {
  const setting = getLocaleSetting()
  return setting === 'system' ? detectLocale() : setting
})())

watch(
  locale,
  (loc) => {
    document.documentElement.lang = loc
    document.documentElement.dir = RTL_LOCALES.includes(loc) ? 'rtl' : 'ltr'
  },
  { immediate: true },
)
