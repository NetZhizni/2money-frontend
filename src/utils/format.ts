import { locale, BCP47 } from '../i18n/locale'
import http from '../api/http'

const INTL_LOCALE = BCP47[locale]

/**
 * Best-effort mirror of a device-local preference (number/date/currency
 * format below) to the backend — same fire-and-forget PATCH /settings as
 * stores/settings.ts's own `persist()` for baseCurrency/theme, just called
 * from here instead since these three stay plain localStorage+reload
 * settings, not part of that Pinia store (see the comment above each
 * setting's own section for why). Purely so the choice survives a fresh
 * login elsewhere — see `seedFormatSettingsFromBackend` below, which is what
 * actually reads it back; the value THIS device renders with always comes
 * from localStorage, never from this call's (or any network call's) result.
 */
function persistDeviceSetting(patch: Record<string, string>): void {
  void http.patch('/settings', patch).catch((error) => {
    console.warn('[format] settings PATCH failed, will retry on next change', error)
  })
}

// ---------- Number format (Settings → "Формат чисел") ----------
// A pure grouping/decimal-separator preference, independent of the app's
// text language (`locale` above) — someone reading the English UI may still
// want "1 234,56" amounts, or vice versa. 'auto' (the default) just follows
// the current `locale`, same as before this setting existed. Persisted like
// `i18n/locale.ts`'s own setting: localStorage + a reload to apply, since
// every consumer (formatMoney, this file's own module-load-time constants)
// reads it once as a plain value rather than something reactive.

export type NumberFormatStyle = 'auto' | 'uk' | 'us' | 'eu'

/** One real BCP-47 locale per style, chosen only for the grouping/decimal punctuation its CLDR data produces — not tied to app text language. */
const NUMBER_FORMAT_LOCALE: Record<Exclude<NumberFormatStyle, 'auto'>, string> = {
  uk: 'uk-UA', // 1 234,56
  us: 'en-US', // 1,234.56
  eu: 'de-DE', // 1.234,56
}

const NUMBER_FORMAT_STORAGE_KEY = '2money:numberFormat'

export function getNumberFormatSetting(): NumberFormatStyle {
  try {
    const raw = localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY)
    return raw === 'uk' || raw === 'us' || raw === 'eu' ? raw : 'auto'
  } catch {
    return 'auto'
  }
}

export function setNumberFormatSetting(next: NumberFormatStyle): void {
  try {
    if (next === 'auto') localStorage.removeItem(NUMBER_FORMAT_STORAGE_KEY)
    else localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, next)
  } catch {
    // Storage unavailable — the reload still falls back to 'auto', just won't remember the choice.
  }
  persistDeviceSetting({ numberFormat: next })
  location.reload()
}

const numberFormatSetting = getNumberFormatSetting()

function numberFormatLocale(style: NumberFormatStyle): string {
  return style === 'auto' ? INTL_LOCALE : NUMBER_FORMAT_LOCALE[style]
}

// ---------- Currency display (Settings → "Формат валюти") ----------
// How a currency itself is rendered next to the number — independent of the
// number format above (that's only the grouping/decimal punctuation). The
// four values mirror Intl.NumberFormatOptions#currencyDisplay exactly (see
// the `Intl.NumberFormat` call in formatMoneyAs below): 'symbol' (₴, but
// falls back to the bare ISO code for most currencies under this locale's
// CLDR data — e.g. "1 000 UAH"), 'narrowSymbol' (always the short glyph when
// one exists — ₴ $ € £ zł Kč — which is why it's the default), 'code'
// ("1 000 UAH"), 'name' ("1 000 hryvnias").

export type CurrencyDisplayStyle = 'symbol' | 'narrowSymbol' | 'code' | 'name'

const CURRENCY_DISPLAY_STORAGE_KEY = '2money:currencyDisplay'

export function getCurrencyDisplaySetting(): CurrencyDisplayStyle {
  try {
    const raw = localStorage.getItem(CURRENCY_DISPLAY_STORAGE_KEY)
    return raw === 'symbol' || raw === 'code' || raw === 'name' ? raw : 'narrowSymbol'
  } catch {
    return 'narrowSymbol'
  }
}

export function setCurrencyDisplaySetting(next: CurrencyDisplayStyle): void {
  try {
    if (next === 'narrowSymbol') localStorage.removeItem(CURRENCY_DISPLAY_STORAGE_KEY)
    else localStorage.setItem(CURRENCY_DISPLAY_STORAGE_KEY, next)
  } catch {
    // Storage unavailable — the reload still falls back to 'narrowSymbol', just won't remember the choice.
  }
  persistDeviceSetting({ currencyDisplay: next })
  location.reload()
}

const currencyDisplaySetting = getCurrencyDisplaySetting()

/**
 * "15 612 ₴" / "-81,60 ₴" style formatting matching the reference app.
 *
 * `style` overrides the current number-format setting, same preview role as
 * `formatDateAs`; `opts.currencyDisplay` similarly overrides the current
 * currency-display setting — used both by the Settings picker (to preview
 * every option without applying it) and by callers with a per-account/
 * per-category override (see Account.currencyDisplay/Category.currencyDisplay
 * — `undefined`/`null` there means "use the base Settings choice", which is
 * exactly what leaving this opt out already does).
 */
export function formatMoneyAs(
  amount: number,
  currency: string,
  style: NumberFormatStyle,
  opts: { signed?: boolean; currencyDisplay?: CurrencyDisplayStyle | null } = {},
): string {
  return new Intl.NumberFormat(numberFormatLocale(style), {
    style: 'currency',
    currency,
    currencyDisplay: opts.currencyDisplay ?? currencyDisplaySetting,
    signDisplay: opts.signed ? 'exceptZero' : 'auto',
    maximumFractionDigits: 2,
    trailingZeroDisplay: 'stripIfInteger',
  }).format(amount)
}

export function formatMoney(amount: number, currency: string, opts: { signed?: boolean; currencyDisplay?: CurrencyDisplayStyle | null } = {}): string {
  return formatMoneyAs(amount, currency, numberFormatSetting, opts)
}

/**
 * Just the currency glyph/code/name `Intl.NumberFormat` would render next to
 * an amount — e.g. "₴" or "UAH" or "hryvnias" — for UI that shows the number
 * and the currency as two separate pieces instead of one formatted string
 * (AmountKeypad.vue's calculator: a big typed number with the currency
 * printed beside it). Resolves the style exactly like `formatMoney` does
 * (`opts.currencyDisplay` overrides the current Settings → "Формат валюти"
 * choice), so this always matches what `formatMoney` would have printed for
 * the same currency/opts.
 */
export function currencyDisplayText(currency: string, opts: { currencyDisplay?: CurrencyDisplayStyle | null } = {}): string {
  const parts = new Intl.NumberFormat(numberFormatLocale(numberFormatSetting), {
    style: 'currency',
    currency,
    currencyDisplay: opts.currencyDisplay ?? currencyDisplaySetting,
  }).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value ?? currency
}

// ---------- Date format (Settings → "Формат дат") ----------
// Applies only where a bare numeric date is actually rendered as text (the
// CSV export's date column) — every other date in the app is either a
// grammatical label built from MONTHS/WEEKDAYS below (fullDateLabel,
// dayHeader — "5 квітня" isn't expressible as a dd/mm/yyyy template) or a
// native `<input type="date">`, whose displayed format the browser controls
// and no amount of JS/CSS can override.

export type DateFormatStyle = 'iso' | 'dmy' | 'mdy'

const DATE_FORMAT_STORAGE_KEY = '2money:dateFormat'

export function getDateFormatSetting(): DateFormatStyle {
  try {
    const raw = localStorage.getItem(DATE_FORMAT_STORAGE_KEY)
    return raw === 'dmy' || raw === 'mdy' ? raw : 'iso'
  } catch {
    return 'iso'
  }
}

export function setDateFormatSetting(next: DateFormatStyle): void {
  try {
    if (next === 'iso') localStorage.removeItem(DATE_FORMAT_STORAGE_KEY)
    else localStorage.setItem(DATE_FORMAT_STORAGE_KEY, next)
  } catch {
    // Storage unavailable — falls back to 'iso', just won't remember the choice.
  }
  persistDeviceSetting({ dateFormat: next })
  location.reload()
}

const dateFormatSetting = getDateFormatSetting()

/**
 * One-time adoption of this profile's backend-synced number/date/currency
 * format preferences on a device that has never customized any of them
 * locally — called once from stores/auth.ts right after every successful
 * GET /api/auth/me (so also on a plain page load with an already-cached
 * Firebase session, not just a fresh sign-in). Only ever touches a key
 * that's currently ABSENT from localStorage, so a device's own explicit
 * choice always wins — including one that happens to equal the default,
 * since choosing a setting's default value also clears its key (see each
 * setter above), the same ambiguity `i18n/locale.ts`'s own setting already
 * accepts. Returns whether anything was adopted, so the caller can reload
 * the page once for all three instead of once per field.
 */
export function seedFormatSettingsFromBackend(settings: {
  numberFormat?: string | null
  dateFormat?: string | null
  currencyDisplay?: string | null
}): boolean {
  let changed = false
  try {
    if (
      (settings.numberFormat === 'uk' || settings.numberFormat === 'us' || settings.numberFormat === 'eu') &&
      localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY) === null
    ) {
      localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, settings.numberFormat)
      changed = true
    }
    if (
      (settings.dateFormat === 'dmy' || settings.dateFormat === 'mdy') &&
      localStorage.getItem(DATE_FORMAT_STORAGE_KEY) === null
    ) {
      localStorage.setItem(DATE_FORMAT_STORAGE_KEY, settings.dateFormat)
      changed = true
    }
    if (
      (settings.currencyDisplay === 'symbol' || settings.currencyDisplay === 'code' || settings.currencyDisplay === 'name') &&
      localStorage.getItem(CURRENCY_DISPLAY_STORAGE_KEY) === null
    ) {
      localStorage.setItem(CURRENCY_DISPLAY_STORAGE_KEY, settings.currencyDisplay)
      changed = true
    }
  } catch {
    // Storage unavailable — nothing to seed, this device just keeps its defaults.
  }
  return changed
}

/** `style` overrides the current date-format setting — same preview role as `formatMoneyAs`. */
export function formatDateAs(date: Date | number, style: DateFormatStyle): string {
  const d = typeof date === 'number' ? new Date(date) : date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  if (style === 'dmy') return `${day}.${m}.${y}`
  if (style === 'mdy') return `${m}/${day}/${y}`
  return `${y}-${m}-${day}`
}

export function formatDate(date: Date | number): string {
  return formatDateAs(date, dateFormatSetting)
}

const MONTH_REF_DATES = Array.from({ length: 12 }, (_, i) => new Date(2020, i, 1))

/** Nominative, lowercase in uk ("січень"/"January") — apply caps at the call site (CSS `text-transform`) where the design wants them. */
export const MONTHS = MONTH_REF_DATES.map((d) => new Intl.DateTimeFormat(INTL_LOCALE, { month: 'long' }).format(d))

/**
 * Intl's `month: 'short'` comes back with a trailing dot for most uk months ("січ.",
 * "квіт.") — stripped and capitalized here to match the compact, dot-free look used
 * in charts and pills. Lengths still vary since that's the real CLDR abbreviation,
 * just undotted (a no-op for locales, like en, whose short months have no dot).
 */
export const MONTHS_SHORT = MONTH_REF_DATES.map((d) => {
  const raw = new Intl.DateTimeFormat(INTL_LOCALE, { month: 'short' }).format(d).replace('.', '')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
})

const genitiveMonthFormatter = new Intl.DateTimeFormat(INTL_LOCALE, { day: 'numeric', month: 'long' })
/** Genitive case in uk ("5 квітня"); same as `MONTHS` for locales (like en) with no genitive month form. */
export const MONTHS_GENITIVE = MONTH_REF_DATES.map(
  (d) => genitiveMonthFormatter.formatToParts(d).find((p) => p.type === 'month')!.value,
)

/** Sunday-first (index = Date#getDay()), long form, lowercase in uk — apply caps at the call site. */
export const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2020, 0, 5 + i)) // 5 Jan 2020 was a Sunday
  .map((d) => new Intl.DateTimeFormat(INTL_LOCALE, { weekday: 'long' }).format(d))

/** Sunday-first, short/abbreviated form, dot-stripped like `MONTHS_SHORT`. */
export const WEEKDAYS_SHORT = Array.from({ length: 7 }, (_, i) => new Date(2020, 0, 5 + i)).map((d) => {
  const raw = new Intl.DateTimeFormat(INTL_LOCALE, { weekday: 'short' }).format(d).replace('.', '')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
})

/** `Date#getDay()` (Sunday=0) re-based so Monday=0…Sunday=6 — shared by `startOfWeek` and any Monday-first calendar grid. */
export function isoWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

export function dayHeader(date: Date): { day: number; weekday: string; monthYear: string } {
  return {
    day: date.getDate(),
    weekday: WEEKDAYS[date.getDay()],
    monthYear: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
  }
}

/** Trailing "year" abbreviation uk grammar wants after a full date ("2026 р."); en has no equivalent. */
const YEAR_SUFFIX: Record<string, string> = { uk: ' р.', en: '' }

export function fullDateLabel(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()]
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${capitalized}, ${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}${YEAR_SUFFIX[locale]}`
}

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>

const pluralRules = new Intl.PluralRules(INTL_LOCALE)

/** Picks the right plural form for `n` under the current locale's CLDR rules (uk: one/few/many; en: one/other). */
export function pluralize(n: number, forms: PluralForms): string {
  return forms[pluralRules.select(n)] ?? forms.other ?? ''
}

interface TimeWords {
  justNow: string
  ago: string
  seconds: PluralForms
  minutes: PluralForms
  hours: PluralForms
  days: PluralForms
}

const TIME_WORDS: Record<string, TimeWords> = {
  uk: {
    justNow: 'щойно',
    ago: 'тому',
    seconds: { one: 'секунду', few: 'секунди', many: 'секунд', other: 'секунд' },
    minutes: { one: 'хвилину', few: 'хвилини', many: 'хвилин', other: 'хвилин' },
    hours: { one: 'годину', few: 'години', many: 'годин', other: 'годин' },
    days: { one: 'день', few: 'дні', many: 'днів', other: 'днів' },
  },
  en: {
    justNow: 'just now',
    ago: 'ago',
    seconds: { one: 'second', other: 'seconds' },
    minutes: { one: 'minute', other: 'minutes' },
    hours: { one: 'hour', other: 'hours' },
    days: { one: 'day', other: 'days' },
  },
}

/** Coarse "N minutes ago" label for status timestamps (sync status, "last seen" etc.) — not for transaction dates. */
export function relativeTime(ms: number, now: number = Date.now()): string {
  const words = TIME_WORDS[locale]
  const diffSec = Math.max(0, Math.round((now - ms) / 1000))
  if (diffSec < 5) return words.justNow
  if (diffSec < 60) return `${diffSec} ${pluralize(diffSec, words.seconds)} ${words.ago}`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} ${pluralize(diffMin, words.minutes)} ${words.ago}`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour} ${pluralize(diffHour, words.hours)} ${words.ago}`
  const diffDay = Math.round(diffHour / 24)
  return `${diffDay} ${pluralize(diffDay, words.days)} ${words.ago}`
}

export function dateKey(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfMonth(year: number, month: number): number {
  return new Date(year, month, 1, 0, 0, 0, 0).getTime()
}

export function endOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** Monday-based week start. */
export function startOfWeek(ts: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() - isoWeekdayIndex(d))
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfWeek(ts: number): number {
  const d = new Date(startOfWeek(ts))
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}
