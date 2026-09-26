import { describe, expect, test } from 'vitest'
import { dateAxisTicks } from '../dateAxisTicks'

const endOf = (year: number, month: number, day: number) => new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
const startOf = (year: number, month: number, day: number) => new Date(year, month - 1, day).getTime()

/** "2026-07-15" per tick — readable diffs instead of raw timestamps. */
function days(values: number[]): string[] {
  return values.map((ts) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}

describe('dateAxisTicks', () => {
  test('3-month range (the account modal default) labels the 1st and 15th', () => {
    const ticks = dateAxisTicks(startOf(2026, 6, 26), endOf(2026, 9, 26))
    expect(ticks.unit).toBe('day')
    expect(days(ticks.values)).toEqual(['2026-07-01', '2026-07-15', '2026-08-01', '2026-08-15', '2026-09-01', '2026-09-15'])
  })

  test('3-month range starting on the 1st still fits 1st/15th (7 labels)', () => {
    const ticks = dateAxisTicks(startOf(2026, 6, 1), endOf(2026, 9, 1))
    expect(days(ticks.values)).toEqual([
      '2026-06-01', '2026-06-15', '2026-07-01', '2026-07-15', '2026-08-01', '2026-08-15', '2026-09-01',
    ])
  })

  test('1-month range uses the 1st/8th/15th/22nd', () => {
    const ticks = dateAxisTicks(startOf(2026, 8, 26), endOf(2026, 9, 26))
    expect(ticks.unit).toBe('day')
    expect(days(ticks.values)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'])
  })

  test('1-year range labels every other month start, January included', () => {
    const ticks = dateAxisTicks(startOf(2025, 9, 26), endOf(2026, 9, 26))
    expect(ticks.unit).toBe('month')
    expect(days(ticks.values)).toEqual(['2025-11-01', '2026-01-01', '2026-03-01', '2026-05-01', '2026-07-01', '2026-09-01'])
  })

  test('a week labels every day, counting the first (partial) day', () => {
    const ticks = dateAxisTicks(new Date(2026, 8, 20, 15).getTime(), endOf(2026, 9, 26))
    expect(ticks.unit).toBe('day')
    expect(ticks.values).toHaveLength(7)
    expect(ticks.values[0]).toBe(endOf(2026, 9, 20))
  })

  test('two weeks steps from the range start, not the day of month', () => {
    const ticks = dateAxisTicks(startOf(2026, 8, 25), endOf(2026, 9, 7))
    expect(days(ticks.values)).toEqual(['2026-08-25', '2026-08-27', '2026-08-29', '2026-08-31', '2026-09-02', '2026-09-04', '2026-09-06'])
  })

  test('multi-year range falls back to whole years', () => {
    const ticks = dateAxisTicks(startOf(2021, 3, 10), endOf(2026, 9, 26))
    expect(ticks.unit).toBe('year')
    expect(days(ticks.values)).toEqual(['2022-01-01', '2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'])
  })

  test('never exceeds the cap', () => {
    const to = endOf(2026, 9, 26)
    for (let span = 1; span < 4000; span += 7) {
      const from = to - span * 24 * 60 * 60 * 1000
      expect(dateAxisTicks(from, to).values.length).toBeLessThanOrEqual(7)
    }
  })
})
