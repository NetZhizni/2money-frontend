import { describe, expect, test, vi } from 'vitest'

// Only the schedule math is under test — keep the storage/sync layer (and
// the browser-only modules it pulls in) out of the way.
vi.mock('../sync', () => ({ putAndQueue: vi.fn(), withTabLock: vi.fn() }))
vi.mock('../schema', () => ({ db: {} }))

import { advance, alignToSchedule, firstOccurrenceFrom, isFinished, occurrencesBetween, passOccurrence, scheduledNext } from '../recurring'
import type { RecurringTemplate } from '../../types/models'

const at = (year: number, month: number, day: number, hours = 10) => new Date(year, month - 1, day, hours).getTime()
const ymd = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const template = (overrides: Partial<RecurringTemplate> = {}): RecurringTemplate => ({
  id: 't1',
  ownerId: 'u1',
  type: 'expense',
  accountId: 'a1',
  categoryId: 'c1',
  amount: 100,
  currency: 'UAH',
  frequency: 'monthly',
  interval: 1,
  startDate: at(2026, 1, 31),
  nextDate: at(2026, 2, 28),
  active: true,
  createdAt: at(2026, 1, 31),
  ...overrides,
})

describe('advance', () => {
  test('a monthly payment on the 31st keeps the 31st, clamped to shorter months', () => {
    const anchor = at(2026, 1, 31)
    const dates = [anchor]
    for (let i = 0; i < 4; i++) dates.push(advance(dates[dates.length - 1], 'monthly', 1, anchor))
    expect(dates.map(ymd)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  test('leap years give February its 29th', () => {
    expect(ymd(advance(at(2028, 1, 30), 'monthly', 1))).toBe('2028-02-29')
  })

  test('every N months keeps the anchor day too', () => {
    expect(ymd(advance(at(2026, 8, 31), 'monthly', 6))).toBe('2027-02-28')
  })

  test('a yearly Feb 29 lands on Feb 28, and back on the 29th in a leap year', () => {
    const anchor = at(2028, 2, 29)
    const next = advance(anchor, 'yearly', 1, anchor)
    expect(ymd(next)).toBe('2029-02-28')
    expect(ymd(advance(at(2031, 2, 28), 'yearly', 1, anchor))).toBe('2032-02-29')
  })

  test('keeps the time of day', () => {
    expect(new Date(advance(at(2026, 1, 31, 15), 'monthly', 1)).getHours()).toBe(15)
  })

  test('daily and weekly are plain day arithmetic', () => {
    expect(ymd(advance(at(2026, 2, 27), 'daily', 3))).toBe('2026-03-02')
    expect(ymd(advance(at(2026, 12, 28), 'weekly', 1))).toBe('2027-01-04')
  })
})

describe('alignToSchedule', () => {
  test('puts a date the old overflow bug produced back on the previous month', () => {
    const anchor = at(2026, 1, 31)
    expect(ymd(alignToSchedule(at(2026, 3, 3), 'monthly', anchor))).toBe('2026-02-28')
    expect(ymd(alignToSchedule(at(2026, 5, 3), 'monthly', anchor))).toBe('2026-04-30')
    expect(ymd(alignToSchedule(at(2026, 4, 1), 'yearly', at(2024, 2, 29)))).toBe('2026-04-01')
    expect(ymd(alignToSchedule(at(2027, 3, 1), 'yearly', at(2024, 2, 29)))).toBe('2027-02-28')
  })

  test('leaves a date that is already on schedule alone', () => {
    expect(ymd(alignToSchedule(at(2026, 2, 28), 'monthly', at(2026, 1, 31)))).toBe('2026-02-28')
    expect(ymd(alignToSchedule(at(2026, 3, 3), 'monthly', at(2026, 1, 3)))).toBe('2026-03-03')
    expect(ymd(alignToSchedule(at(2026, 3, 1), 'weekly', at(2026, 1, 31)))).toBe('2026-03-01')
  })
})

describe('occurrences', () => {
  test('lists the upcoming ones up to a date, and none past the end date', () => {
    const tpl = template({ endDate: at(2026, 5, 1) })
    expect(occurrencesBetween(tpl, 0, at(2026, 12, 31)).map(ymd)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })

  test('a paused template has none', () => {
    expect(occurrencesBetween(template({ active: false }), 0, at(2026, 12, 31))).toEqual([])
  })

  test('a drifted nextDate is read as the occurrence it stands for', () => {
    expect(ymd(scheduledNext(template({ nextDate: at(2026, 4, 3) })))).toBe('2026-03-31')
  })

  test('resuming skips what fell due while paused', () => {
    expect(ymd(firstOccurrenceFrom(template(), at(2026, 4, 15)))).toBe('2026-04-30')
  })

  test('booking or skipping one moves past it, and ends the schedule after its last one', () => {
    const tpl = template({ endDate: at(2026, 3, 31, 23) })
    const afterFeb = passOccurrence(tpl, at(2026, 2, 28))
    expect(ymd(afterFeb.nextDate)).toBe('2026-03-31')
    expect(afterFeb.active).toBe(true)
    const afterMar = passOccurrence(afterFeb, afterFeb.nextDate)
    expect(afterMar.active).toBe(false)
    expect(isFinished(afterMar)).toBe(true)
  })
})
