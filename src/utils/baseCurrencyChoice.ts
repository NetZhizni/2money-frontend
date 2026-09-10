import { COMMON_CURRENCIES } from './currencies'

/**
 * Per-device bookkeeping for the base-currency onboarding screen (see
 * views/BaseCurrencyOnboardingView.vue, shown right after
 * LanguageOnboardingView on every brand-new device — see App.vue's
 * `needsBaseCurrencyChoice`) — mirrors i18n/locale.ts's own
 * CHOSEN_KEY/STORAGE_KEY pair.
 *
 * Unlike `locale`, there's no live global "current base currency" here:
 * nothing renders in a particular currency before a profile is signed in, so
 * this is only ever read once, by db/seed.ts and db/onboarding.ts, as the
 * INITIAL value for a brand-new profile's own `settings.baseCurrency` —
 * never overriding one that already exists. After that it's just a normal
 * per-profile setting, changeable anytime from Settings (same as language).
 */
const STORAGE_KEY = '2money:base-currency-chosen'

/** Whether this device has ever gone through the base-currency choice — gates App.vue's BaseCurrencyOnboardingView. */
export function hasChosenBaseCurrency(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return true // storage unavailable — never block boot on it, just skip the screen
  }
}

/** The currency this device picked (or confirmed) on the base-currency onboarding screen, if any — `null` until then, or if storage is unavailable/holds something no longer in COMMON_CURRENCIES. */
export function getChosenBaseCurrency(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw && COMMON_CURRENCIES.some((c) => c.code === raw) ? raw : null
  } catch {
    return null
  }
}

/** Persists the choice — called once from BaseCurrencyOnboardingView.vue's confirm(). */
export function setChosenBaseCurrency(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Storage unavailable — this device just won't remember the choice, and
    // the onboarding screen simply shows again next launch; harmless (same
    // as i18n/locale.ts's setLocaleSetting).
  }
}
