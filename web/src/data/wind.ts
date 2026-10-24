import type { Grid } from '@/engine'
import { STEP_MS } from '@/engine/ts/frame'
import { DATE_ONLY, ImportError, isDayFirst, looksLikeTimestamp, parseNumber, parseTimestamp, readTable, toUtc, type Table } from './csv'

export interface WindSeries {
  id: string
  grid: Grid
  report: {
    rows: number
    measured: number
    missing: number
    /** Negative values (e.g. -999 sentinels) are not wind speeds and count as missing. */
    negative: number
    ignoredColumns: string[]
  }
  /** Wind direction in degrees on the same grid, when the file has one wind and one direction column. */
  direction?: Grid
}

const WIND = /wind|speed|geschw|m\/s|\bws\b/i
const NOT_WIND = /dir|richt|deg|°|temp|press|druck|hpa|mbar|humid|feucht|precip|nieder|power|leistung|rpm|status|flag|qual|gust|böe|max|std|sigma/i
const DIRECTION = /dir|richt/i
const NOT_DIRECTION = /std|sigma/i
const UTC_HEADER = /\b(utc|gmt)\b(?!\s*[+-])/i
const TIME_ONLY = /^\d{1,2}:\d{2}(:\d{2})?$/

/** Every wind column of a CSV (SPEC.md S1) as its own series on the UTC 10-minute grid; missing values are null. */
export const parseWindCsv = (name: string, text: string) => windSeries(name, readTable(text))

/** The column holding the timestamp in a data row, or a date and a time column side by side. */
export function timeColumns(cells: string[]): number[] | undefined {
  const i = cells.findIndex((c, i) => looksLikeTimestamp(c) || (DATE_ONLY.test(c) && TIME_ONLY.test(cells[i + 1] ?? '')))
  if (i >= 0) return looksLikeTimestamp(cells[i]) ? [i] : [i, i + 1]
}

export function windSeries(name: string, { header, rows }: Table): WindSeries[] {
  const first = rows[0].cells
  const timeCols = timeColumns(first)
  if (!timeCols) throw new ImportError('No timestamp column found (expected e.g. 2026-10-01 00:10 or 01.10.2026 00:10).')
  const timeCol = timeCols[0]
  const stamp = (cells: string[]) => timeCols.map((i) => cells[i]).join(' ')

  const others = first.map((_, i) => i).filter((i) => !timeCols.includes(i))
  const candidates = others.filter((i) => !header || !NOT_WIND.test(header[i]))
  const named = candidates.filter((i) => header && WIND.test(header[i]))
  const windCols = named.length ? named : candidates.filter((i) => rows.some((r) => typeof parseNumber(r.cells[i]) === 'number'))
  if (!windCols.length) throw new ImportError('No wind speed column found.')

  const dayFirst = isDayFirst(rows.map((r) => stamp(r.cells)))
  const utcHeader = !!header && UTC_HEADER.test(header[timeCol])
  const utc = toUtc(
    rows.map(({ line, cells }) => {
      const ts = parseTimestamp(stamp(cells), dayFirst)
      if (!ts) throw new ImportError(`Line ${line}: "${stamp(cells)}" is not a timestamp.`)
      return { line, ts: utcHeader && ts.offsetMin === undefined ? { ...ts, offsetMin: 0 } : ts }
    }),
  )
  utc.forEach((t, i) => {
    if (t % STEP_MS)
      throw new ImportError(`Line ${rows[i].line}: "${stamp(rows[i].cells)}" is not on the 10-minute grid; the data must be 10-minute values.`)
  })
  const steps = utc.slice(1).map((t, i) => t - utc[i])
  const typical = steps.sort((a, b) => a - b)[steps.length >> 1]
  if (typical > STEP_MS) throw new ImportError(`Most rows are ${typical / 60_000} minutes apart; the data must be 10-minute values.`)

  const t0 = utc[0]
  const n = (utc[utc.length - 1] - t0) / STEP_MS + 1
  const directions = others.filter((i) => header && DIRECTION.test(header[i]) && !NOT_DIRECTION.test(header[i]))
  const directionCol = windCols.length === 1 && directions.length === 1 ? directions[0] : undefined
  const ignoredColumns = header ? others.filter((i) => !windCols.includes(i) && i !== directionCol).map((i) => header[i]) : []
  const direction = directionCol === undefined ? undefined : directionGrid(rows, directionCol, utc, t0, n)
  return windCols.map((col) => {
    const values: (number | null)[] = Array(n).fill(null)
    let negative = 0
    rows.forEach(({ line, cells }, i) => {
      const v = parseNumber(cells[col])
      if (v === undefined) throw new ImportError(`Line ${line}: "${cells[col]}" is not a wind speed.`)
      if (v !== null && v < 0) negative++
      values[(utc[i] - t0) / STEP_MS] = v !== null && v >= 0 ? v : null
    })
    const measured = values.filter((v) => v !== null).length
    return {
      id: windCols.length === 1 ? name : header?.[col] || `${name} column ${col + 1}`,
      grid: { t0, stepS: 600, values },
      report: { rows: rows.length, measured, missing: n - measured, negative, ignoredColumns },
      ...(direction && { direction }),
    }
  })
}

/** Degrees on the grid; values outside 0–360 are missing, other text is an error. */
function directionGrid(rows: Table['rows'], col: number, utc: number[], t0: number, n: number): Grid {
  const values: (number | null)[] = Array(n).fill(null)
  rows.forEach(({ line, cells }, i) => {
    const v = parseNumber(cells[col])
    if (v === undefined) throw new ImportError(`Line ${line}: "${cells[col]}" is not a wind direction.`)
    values[(utc[i] - t0) / STEP_MS] = v !== null && v >= 0 && v <= 360 ? v : null
  })
  return { t0, stepS: 600, values }
}
