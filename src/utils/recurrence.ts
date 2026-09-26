import { advance } from '../db/recurring'
import { dayMonthShort, pluralize } from './format'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'
import type { RecurringFrequency } from '../types/models'

/**
 * The schedules offered as one tap in the recurrence picker (see
 * components/recurring/RecurrencePicker.vue) — each one a frequency plus an
 * interval, since "every 2 weeks" or "quarterly" is just weekly×2 or
 * monthly×3 to the schedule itself. Anything else is picked as a custom
 * interval and labelled "every N <units>".
 */
export const RECURRENCE_PRESETS: { frequency: RecurringFrequency; interval: number; labelKey?: MessageKey }[] = [
  { frequency: 'daily', interval: 1, labelKey: 'transactions.form.freqDaily' },
  { frequency: 'weekly', interval: 1, labelKey: 'transactions.form.freqWeekly' },
  { frequency: 'weekly', interval: 2 },
  { frequency: 'monthly', interval: 1, labelKey: 'transactions.form.freqMonthly' },
  { frequency: 'monthly', interval: 3, labelKey: 'recurring.preset.quarterly' },
  { frequency: 'monthly', interval: 6, labelKey: 'recurring.preset.halfYearly' },
  { frequency: 'yearly', interval: 1, labelKey: 'transactions.form.freqYearly' },
]

export function isPreset(frequency: RecurringFrequency, interval: number): boolean {
  return RECURRENCE_PRESETS.some((p) => p.frequency === frequency && p.interval === interval)
}

const UNIT_KEYS: Record<RecurringFrequency, Record<'one' | 'few' | 'many' | 'other', MessageKey>> = {
  daily: { one: 'recurring.unit.day.one', few: 'recurring.unit.day.few', many: 'recurring.unit.day.many', other: 'recurring.unit.day.other' },
  weekly: { one: 'recurring.unit.week.one', few: 'recurring.unit.week.few', many: 'recurring.unit.week.many', other: 'recurring.unit.week.other' },
  monthly: { one: 'recurring.unit.month.one', few: 'recurring.unit.month.few', many: 'recurring.unit.month.many', other: 'recurring.unit.month.other' },
  yearly: { one: 'recurring.unit.year.one', few: 'recurring.unit.year.few', many: 'recurring.unit.year.many', other: 'recurring.unit.year.other' },
}

/** "тижні" for 2, "тижнів" for 5 — the unit word that goes after `n`. */
export function unitWord(frequency: RecurringFrequency, n: number): string {
  const keys = UNIT_KEYS[frequency]
  return pluralize(n, { one: t(keys.one), few: t(keys.few), many: t(keys.many), other: t(keys.other) })
}

// One phrase per unit rather than one "every {n} {unit}" for all: the words
// around the number agree with the unit in plenty of languages (fr "Tous les
// 2 jours" / "Toutes les 2 semaines"), or aren't built from it at all
// (tr "2 haftada bir", hu "Minden 2. héten").
const EVERY_KEYS: Record<RecurringFrequency, MessageKey> = {
  daily: 'recurring.every.day',
  weekly: 'recurring.every.week',
  monthly: 'recurring.every.month',
  yearly: 'recurring.every.year',
}

/** "Щомісяця", "Щокварталу", "Кожні 5 днів" — how a schedule reads everywhere it's shown. */
export function recurrenceLabel(frequency: RecurringFrequency, interval: number): string {
  const preset = RECURRENCE_PRESETS.find((p) => p.frequency === frequency && p.interval === interval)
  if (preset?.labelKey) return t(preset.labelKey)
  return t(EVERY_KEYS[frequency], { n: interval, unit: unitWord(frequency, interval) })
}

/**
 * "Далі: 31 жовт., 30 лист., 31 груд." — the next few occurrences after
 * `start`, so a schedule can be judged by the dates it actually produces
 * (a payment on the 31st, a quarterly one) rather than by its name alone.
 * `anchor` as in db/recurring.ts's advance — `start` itself unless the
 * schedule keeps an older one.
 */
export function recurrencePreview(frequency: RecurringFrequency, interval: number, start: number, anchor: number = start, count = 3): string {
  const dates: string[] = []
  let cursor = start
  for (let i = 0; i < count; i++) {
    cursor = advance(cursor, frequency, interval, anchor)
    dates.push(dayMonthShort(cursor))
  }
  return t('recurring.preview', { dates: dates.join(', ') })
}
