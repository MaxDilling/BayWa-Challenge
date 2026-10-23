import type { Grid } from '@/engine'
import { STEP_MS } from '@/engine/ts/frame'
import { ImportError, parseNumber, parseTimestamp, readTable, toUtc } from './csv'

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
}

/** A wind CSV (timestamp + wind speed in m/s) on the UTC 10-minute grid; missing values are null. */
export function parseWindCsv(id: string, text: string): WindSeries {
  const { header, rows } = readTable(text)
  if (!rows.length) throw new ImportError('The file has a header but no data rows.')
  const width = rows[0].cells.length
  const timeCol = findColumn(header, /time|date|zeit|datum/i) ?? rows[0].cells.findIndex((c) => parseTimestamp(c))
  if (timeCol < 0) throw new ImportError('No timestamp column found (expected e.g. 2026-10-01 00:10 or 01.10.2026 00:10).')
  const windCol =
    findColumn(header, /wind|speed|geschw|m\/s/i, timeCol) ??
    [...Array(width).keys()].find((i) => i !== timeCol && rows.some((r) => parseNumber(r.cells[i]) !== undefined))
  if (windCol === undefined) throw new ImportError('No wind speed column found.')

  const utc = toUtc(
    rows.map(({ line, cells }) => {
      const ts = parseTimestamp(cells[timeCol])
      if (!ts) throw new ImportError(`Line ${line}: "${cells[timeCol]}" is not a timestamp.`)
      return { line, ts }
    }),
  )
  const t0 = utc[0]
  utc.forEach((t, i) => {
    if (t % STEP_MS) throw new ImportError(`Line ${rows[i].line}: time is not on the 10-minute grid.`)
  })
  const values: (number | null)[] = Array((utc[utc.length - 1] - t0) / STEP_MS + 1).fill(null)
  let negative = 0
  rows.forEach(({ line, cells }, i) => {
    const v = parseNumber(cells[windCol])
    if (v === undefined) throw new ImportError(`Line ${line}: "${cells[windCol]}" is not a wind speed.`)
    if (v !== null && v < 0) negative++
    values[(utc[i] - t0) / STEP_MS] = v !== null && v >= 0 ? v : null
  })
  const measured = values.filter((v) => v !== null).length
  return {
    id,
    grid: { t0, stepS: 600, values },
    report: {
      rows: rows.length,
      measured,
      missing: values.length - measured,
      negative,
      ignoredColumns: (header ?? []).filter((_, i) => i !== timeCol && i !== windCol),
    },
  }
}

export function findColumn(header: string[] | null, pattern: RegExp, except = -1): number | undefined {
  const i = header?.findIndex((h, i) => i !== except && pattern.test(h)) ?? -1
  return i >= 0 ? i : undefined
}
