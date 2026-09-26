import { describe, expect, test, vi } from 'vitest'

// Labels come out as "key{params}" so the tests can see which string was
// picked; format.ts (browser-only locale setup) is stood in for.
vi.mock('../../i18n', () => ({ t: (key: string, params?: object) => (params ? `${key}${JSON.stringify(params)}` : key) }))
vi.mock('../format', () => ({
  dayMonthShort: (ms: number) => {
    const d = new Date(ms)
    return `${d.getDate()}.${d.getMonth() + 1}`
  },
  pluralize: (n: number, forms: Record<string, string>) => (n === 1 ? forms.one : forms.other),
}))
vi.mock('../../db/sync', () => ({ putAndQueue: vi.fn(), withTabLock: vi.fn() }))
vi.mock('../../db/schema', () => ({ db: {} }))

import { isPreset, recurrenceLabel, recurrencePreview } from '../recurrence'

const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 10).getTime()

describe('recurrence labels', () => {
  test('the common schedules are presets, with names of their own where they have one', () => {
    expect(isPreset('monthly', 3)).toBe(true)
    expect(isPreset('weekly', 2)).toBe(true)
    expect(isPreset('daily', 5)).toBe(false)
    expect(recurrenceLabel('monthly', 1)).toBe('transactions.form.freqMonthly')
    expect(recurrenceLabel('monthly', 3)).toBe('recurring.preset.quarterly')
  })

  test('anything else reads "every N <units>", in the phrase for that unit', () => {
    expect(recurrenceLabel('weekly', 2)).toBe('recurring.every.week{"n":2,"unit":"recurring.unit.week.other"}')
    expect(recurrenceLabel('daily', 5)).toBe('recurring.every.day{"n":5,"unit":"recurring.unit.day.other"}')
  })
})

describe('recurrence preview', () => {
  test('lists the dates after the start, month-end kept', () => {
    expect(recurrencePreview('monthly', 1, at(2027, 1, 31))).toBe('recurring.preview{"dates":"28.2, 31.3, 30.4"}')
  })

  test('counts from the saved anchor when there is one', () => {
    // Next payment Feb 28, but the schedule is anchored on the 31st.
    expect(recurrencePreview('monthly', 1, at(2027, 2, 28), at(2027, 1, 31))).toBe('recurring.preview{"dates":"31.3, 30.4, 31.5"}')
  })
})
