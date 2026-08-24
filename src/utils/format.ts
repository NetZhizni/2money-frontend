const CURRENCY_SYMBOLS: Record<string, string> = {
  UAH: '₴',
  USD: '$',
  EUR: '€',
  GBP: '£',
  PLN: 'zł',
  CZK: 'Kč',
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code
}

/** "15 612 ₴" / "-81,60 ₴" style formatting matching the reference app. */
export function formatMoney(amount: number, currency: string, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(amount)
  const hasFraction = Math.round(abs * 100) % 100 !== 0
  const formatted = new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(abs)
  const sign = amount < 0 ? '-' : opts.signed && amount > 0 ? '+' : ''
  return `${sign}${formatted} ${currencySymbol(currency)}`
}

export const MONTHS_UK = [
  'СІЧЕНЬ', 'ЛЮТИЙ', 'БЕРЕЗЕНЬ', 'КВІТЕНЬ', 'ТРАВЕНЬ', 'ЧЕРВЕНЬ',
  'ЛИПЕНЬ', 'СЕРПЕНЬ', 'ВЕРЕСЕНЬ', 'ЖОВТЕНЬ', 'ЛИСТОПАД', 'ГРУДЕНЬ',
]

export const MONTHS_UK_SHORT = [
  'Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру',
]

export const MONTHS_UK_GENITIVE = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
]

const WEEKDAYS_UK = ['НЕДІЛЯ', 'ПОНЕДІЛОК', 'ВІВТОРОК', 'СЕРЕДА', "ЧЕТВЕР", "П'ЯТНИЦЯ", 'СУБОТА']

export function monthLabel(year: number, month: number): string {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return `${daysInMonth}) ${MONTHS_UK[month]} ${year}`
}

export function dayHeader(date: Date): { day: number; weekday: string; monthYear: string } {
  return {
    day: date.getDate(),
    weekday: WEEKDAYS_UK[date.getDay()],
    monthYear: `${MONTHS_UK[date.getMonth()]} ${date.getFullYear()}`,
  }
}

export function fullDateLabel(date: Date): string {
  const weekday = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'][date.getDay()]
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${capitalized}, ${date.getDate()} ${MONTHS_UK_GENITIVE[date.getMonth()]} ${date.getFullYear()} р.`
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
  const isoDay = (d.getDay() + 6) % 7 // Mon=0 ... Sun=6
  d.setDate(d.getDate() - isoDay)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfWeek(ts: number): number {
  const d = new Date(startOfWeek(ts))
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}
