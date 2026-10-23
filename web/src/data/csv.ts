// Tolerant CSV reading by the rules of SPEC.md S1; windgap/core/io.py is the Python twin and must stay in step.
import { berlinCandidates } from './berlin'

export class ImportError extends Error {}

export interface Table {
  header: string[] | null
  rows: { line: number; cells: string[] }[]
}

const MISSING = new Set(['', 'nan', 'na', 'n/a', '#n/a', '#nv', 'null', 'none', '-'])
const DELIMITERS = ['\t', ';', ',', '|']

export function readTable(text: string): Table {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((s, i) => ({ line: i + 1, text: s }))
    .filter((l) => l.text.trim())
  if (!lines.length) throw new ImportError('The file is empty.')
  const sample = lines.slice(0, 50).map((l) => l.text)
  let best = { score: 0, delimiter: '', width: 0 }
  for (const delimiter of DELIMITERS) {
    const width = sample[sample.length - 1].split(delimiter).length
    const score = width > 1 ? sample.filter((s) => s.split(delimiter).length === width).length : 0
    if (score > best.score) best = { score, delimiter, width }
  }
  const { delimiter, width } = best
  if (!delimiter) throw new ImportError('Could not detect the column separator (expected ";", ",", "|" or tab).')
  const split = (s: string) => s.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())
  const cells = lines.map((l) => split(l.text))
  const first = cells.findIndex((c) => c.length === width && c.some((x) => typeof parseNumber(x) === 'number' || looksLikeTimestamp(x) || DATE_ONLY.test(x)))
  if (first < 0) throw new ImportError('The file has no data rows.')
  return {
    header: cells.slice(0, first).find((c) => c.length === width) ?? null,
    rows: lines.slice(first).map(({ line }, i) => {
      const row = cells[first + i]
      if (row.length !== width) throw new ImportError(`Line ${line}: expected ${width} columns, found ${row.length}.`)
      return { line, cells: row }
    }),
  }
}

/** Number with decimal point or comma; null for a missing-value token; undefined if not a number at all. */
export function parseNumber(cell: string): number | null | undefined {
  if (MISSING.has(cell.toLowerCase())) return null
  if (/^[+-]?\d{1,3}(\.\d{3})+,\d*$/.test(cell)) return Number(cell.replaceAll('.', '').replace(',', '.'))
  if (/^[+-]?\d{1,3}(,\d{3})+\.\d*$/.test(cell)) return Number(cell.replaceAll(',', ''))
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/.test(cell)) return undefined
  return Number(cell.replace(',', '.'))
}

const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?`
const YEAR_FIRST = new RegExp(String.raw`^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:T|\s+)${TIME}\s*(Z|[+-]\d{2}:?\d{2})?$`)
const YEAR_LAST = new RegExp(String.raw`^(\d{1,2})([./-])(\d{1,2})\2(\d{4})\s+${TIME}$`)
export const DATE_ONLY = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})$/
const AMBIGUOUS = /^(\d{1,2})([/-])(\d{1,2})\2\d{4}\b/

export const looksLikeTimestamp = (cell: string) => YEAR_FIRST.test(cell) || YEAR_LAST.test(cell)

export interface Timestamp {
  /** Wall-clock time encoded as if it were UTC. */
  ms: number
  /** Offset in minutes when the cell names one (Z, +02:00); otherwise the time is Europe/Berlin. */
  offsetMin?: number
}

/** `dayFirst` only decides dates like 01/10/2026; see `isDayFirst`. Invalid dates (31.02.) are not timestamps. */
export function parseTimestamp(cell: string, dayFirst = true): Timestamp | undefined {
  const ymd = YEAR_FIRST.exec(cell)
  const m = ymd ?? YEAR_LAST.exec(cell)
  if (!m) return undefined
  let [y, mo, d] = ymd ? [m[1], m[3], m[4]] : [m[4], m[3], m[1]]
  if (!ymd && m[2] !== '.' && !dayFirst) [mo, d] = [d, mo]
  const [h, mi, s = '0', frac = ''] = m.slice(5, 9)
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  const t = new Date(ms)
  if (t.getUTCFullYear() !== +y || t.getUTCMonth() !== +mo - 1 || t.getUTCDate() !== +d) return undefined
  if (t.getUTCHours() !== +h || t.getUTCMinutes() !== +mi || t.getUTCSeconds() !== +s) return undefined
  const stamp = { ms: ms + Math.floor(Number('0' + frac) * 1000) }
  const zone = ymd?.[9]
  if (!zone) return stamp
  if (zone === 'Z') return { ...stamp, offsetMin: 0 }
  const digits = zone.slice(1).replace(':', '')
  return { ...stamp, offsetMin: (zone[0] === '-' ? -1 : 1) * (+digits.slice(0, 2) * 60 + +digits.slice(2)) }
}

/** Day/month order of dates like 01/10/2026 for a whole file: a part above 12 must be the day. */
export function isDayFirst(cells: string[]): boolean {
  let ambiguous = false
  let day = false
  let month = false
  for (const cell of cells) {
    const m = AMBIGUOUS.exec(cell)
    if (!m) continue
    ambiguous = true
    day ||= +m[1] > 12
    month ||= +m[3] > 12
  }
  if (day && month) throw new ImportError('The dates mix day-first (31/10/2026) and month-first (10/31/2026) order.')
  if (ambiguous && !day && !month)
    throw new ImportError('Dates like 01/10/2026 can mean 1 October or 10 January, and no day above 12 decides it. Please use 2026-10-01 or 01.10.2026.')
  return !month
}

/**
 * UTC instants for a column of timestamps. Berlin times in the doubled hour of the autumn change are
 * resolved by order: the first pass is summer time, the repeat winter time.
 */
export function toUtc(stamps: { line: number; ts: Timestamp }[]): number[] {
  let previous = -Infinity
  let previousLine = 0
  return stamps.map(({ line, ts }) => {
    let utc: number
    if (ts.offsetMin !== undefined) utc = ts.ms - ts.offsetMin * 60_000
    else {
      const candidates = berlinCandidates(ts.ms)
      if (!candidates.length) throw new ImportError(`Line ${line}: this time does not exist in Europe/Berlin (spring clock change).`)
      utc = candidates.find((c) => c > previous) ?? candidates[candidates.length - 1]
    }
    if (utc === previous) throw new ImportError(`Line ${line}: duplicate timestamp, the same time as line ${previousLine}.`)
    if (utc < previous) throw new ImportError(`Line ${line}: timestamps must be in chronological order.`)
    previous = utc
    previousLine = line
    return utc
  })
}
