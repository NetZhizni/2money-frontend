import { watch } from 'vue'
import { createI18n } from 'vue-i18n'
import { locale } from './locale'
import type { Locale } from './locale'
import enMessages from './locales/en'

// Type-only — erased entirely at runtime (see tsconfig's erasableSyntaxOnly),
// used ONLY so `MessageKey` below gets its precise literal union straight
// from `en`'s own flat object shape (every OTHER locale falls back to it —
// vue-i18n's `fallbackLocale: 'en'` below — so it's always the complete
// key set). Not using vue-i18n's own typed-resource-schema feature
// (`createI18n<[Schema], Locale>()`): that machinery is built around NESTED
// message objects and a path-string type-generator, while these messages
// stay flat (`'common.save'` as one literal key, not `common: { save: … }`)
// — `keyof` the shape already gives the same precision with none of that
// setup.
import type EnMessages from './locales/en'
export type MessageKey = keyof typeof EnMessages

export { locale, LOCALES, LOCALE_NAMES, localeFlagUrl, BCP47, detectLocale, getLocaleSetting, setLocaleSetting, hasChosenLocale } from './locale'
export type { Locale, LocaleSetting } from './locale'

/**
 * The vue-i18n instance backing `t`/`tFor` below — Composition API mode
 * (`legacy: false`), seeded with only `en` up front (every other locale
 * loads lazily — see `LOAD_LOCALE` and `ensureLocaleLoaded` further down).
 * `missingWarn`/`fallbackWarn` are off: this app treats "key not yet
 * translated in this locale, falls back to English" as an expected state,
 * not a console-worthy problem. Registered on the app in main.ts via
 * `app.use(i18n)`.
 */
export const i18n = createI18n({
  legacy: false,
  locale: locale.value,
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: enMessages } as Partial<Record<Locale, Record<string, string>>>,
})

// One loader per src/i18n/locales/*.ts file, discovered automatically —
// Vite code-splits each into its own chunk (that's the whole point: a
// locale's strings only download when actually needed). `en` is imported
// eagerly above instead of through this map — it's vue-i18n's
// `fallbackLocale`, so it can't itself be lazy without leaving EVERY locale
// without a safety net until its own (potentially never-requested) chunk
// arrives; harmless that its loader is also sitting unused in this map.
const LOAD_LOCALE = new Map<Locale, () => Promise<Record<string, string>>>(
  Object.entries(import.meta.glob<Record<string, string>>('./locales/*.ts', { import: 'default' })).map(([path, load]) => [
    path.match(/([a-z]+)\.ts$/)![1] as Locale,
    load,
  ]),
)

const loadedLocales = new Set<Locale>(['en'])
const loadingPromises = new Map<Locale, Promise<void>>()

/**
 * Kicks off (or reuses an in-flight) fetch of `loc`'s messages and hands
 * them to vue-i18n via `setLocaleMessage` — from there on, `t`/`tFor` below
 * (and vue-i18n's own internal reactivity) just see them. Cheap to call on
 * every `tFor()` — a no-op past the first call for any given locale.
 */
function ensureLocaleLoaded(loc: Locale): Promise<void> {
  if (loadedLocales.has(loc)) return Promise.resolve()
  let promise = loadingPromises.get(loc)
  if (!promise) {
    const load = LOAD_LOCALE.get(loc)
    promise = (load ? load() : Promise.reject(new Error(`no locales/${loc}.ts module`)))
      .then((messages) => {
        i18n.global.setLocaleMessage(loc, messages)
        loadedLocales.add(loc)
      })
      .catch((error: unknown) => {
        console.warn(`[i18n] failed to load "${loc}" messages, staying on the English fallback`, error)
      })
    loadingPromises.set(loc, promise)
  }
  return promise
}

// Mirrors i18n/locale.ts's `locale` ref into vue-i18n's own active locale —
// switches the text immediately (including on every later
// `setLocaleSetting`, which just assigns `locale.value` — no reload) and
// starts fetching that locale's messages in the same tick; vue-i18n's
// `fallbackLocale: 'en'` covers the gap until they arrive.
watch(
  locale,
  (loc) => {
    i18n.global.locale.value = loc
    void ensureLocaleLoaded(loc)
  },
  { immediate: true },
)

/**
 * Resolves once `loc`'s messages are ready (immediately for one already
 * loaded, `en` included). Awaited once at boot (see main.ts) so the very
 * first paint already renders in the target locale instead of flashing
 * English while its chunk is still in flight; also used by
 * stores/categories.ts's `retranslateDefaults`, which checks a category's
 * name against every locale's translation at once and so needs all of them
 * loaded, not just the active one.
 */
export function preloadLocale(loc: Locale): Promise<void> {
  return ensureLocaleLoaded(loc)
}

/** Looks up `key` in the current locale, falling back to English, then the raw key itself. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return i18n.global.t(key, params ?? {})
}

/**
 * Same lookup as `t()`, but against an explicitly given locale instead of the
 * device's own — used where a piece of text needs translating for a locale
 * OTHER than the one currently rendering (e.g. stores/categories.ts's
 * `retranslateDefaults`, re-labeling default categories to the locale the
 * user is about to switch to).
 */
export function tFor(loc: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  void ensureLocaleLoaded(loc)
  return i18n.global.t(key, params ?? {}, { locale: loc })
}
