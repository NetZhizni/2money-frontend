export const CSV_BOM = '﻿'

export type CsvCell = string | number | null | undefined

/** RFC-4180 field: quoted whenever it contains the delimiter, a quote, or a line break; inner quotes doubled. */
export function csvField(value: CsvCell, delimiter: string): string {
  const s = value == null ? '' : String(value)
  if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Joins rows with CRLF, fields with `delimiter`. Does not prepend a BOM. */
export function toCsv(rows: CsvCell[][], delimiter: string): string {
  return rows.map((row) => row.map((cell) => csvField(cell, delimiter)).join(delimiter)).join('\r\n')
}
