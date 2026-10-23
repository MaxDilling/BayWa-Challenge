// Tolerant CSV reading: delimiter, decimal comma, header, timestamp format and missing-value tokens are detected.
import { berlinCandidates } from './berlin'

export class ImportError extends Error {}

export interface Table {
  header: string[] | null
  rows: { line: number; cells: string[] }[]
}

const MISSING = new Set(['', 'nan', 'na', 'n/a', 'null', 'none', '-'])

export function readTable(text: string): Table {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((s, i) => ({ line: i + 1, text: s }))
    .filter((l) => l.text.trim())
  if (!lines.length) throw new ImportError('The file is empty.')
  const sample = lines.slice(0, 20).map((l) => l.text)
  const delimiter = ['\t', ';', ','].find((d) => sample.every((s) => s.split(d).length === sample[0].split(d).length && s.includes(d)))
  if (!delimiter) throw new ImportError('Could not detect the column separator (expected ";", "," or tab).')
  const split = (s: string) => s.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())
  const first = split(lines[0].text)
  const hasHeader = first.every((c) => parseNumber(c) === undefined && parseTimestamp(c) === undefined)
  return {
    header: hasHeader ? first : null,
    rows: lines.slice(hasHeader ? 1 : 0).map((l) => ({ line: l.line, cells: split(l.text) })),
  }
}

/** Number with decimal point or comma; null for a missing-value token; undefined if not a number at all. */
export function parseNumber(cell: string): number | null | undefined {
  if (MISSING.has(cell.toLowerCase())) return null
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/.test(cell)) return undefined
  return Number(cell.replace(',', '.'))
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/
const GERMAN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/

export interface Timestamp {
  /** Wall-clock time encoded as if it were UTC. */
  ms: number
  /** Offset in minutes when the cell names one (Z, +02:00); otherwise the time is Europe/Berlin. */
  offsetMin?: number
}

export function parseTimestamp(cell: string): Timestamp | undefined {
  const iso = ISO.exec(cell)
  if (iso) {
    const [, y, mo, d, h, mi, s, zone] = iso
    const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))
    if (!zone) return { ms }
    if (zone === 'Z') return { ms, offsetMin: 0 }
    const sign = zone[0] === '-' ? -1 : 1
    const digits = zone.slice(1).replace(':', '')
    return { ms, offsetMin: sign * (+digits.slice(0, 2) * 60 + +digits.slice(2)) }
  }
  const de = GERMAN.exec(cell)
  if (de) {
    const [, d, mo, y, h, mi, s] = de
    return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)) }
  }
  return undefined
}

/**
 * UTC instants for a column of timestamps. Berlin times in the doubled hour of the autumn change are
 * resolved by order: the first pass is summer time, the repeat winter time.
 */
export function toUtc(stamps: { line: number; ts: Timestamp }[]): number[] {
  let previous = -Infinity
  return stamps.map(({ line, ts }) => {
    let utc: number
    if (ts.offsetMin !== undefined) utc = ts.ms - ts.offsetMin * 60_000
    else {
      const candidates = berlinCandidates(ts.ms)
      if (!candidates.length) throw new ImportError(`Line ${line}: this time does not exist in Europe/Berlin (spring clock change).`)
      utc = candidates.find((c) => c > previous) ?? candidates[candidates.length - 1]
    }
    if (utc <= previous) throw new ImportError(`Line ${line}: timestamps must be in chronological order without duplicates.`)
    previous = utc
    return utc
  })
}
