import type { AnalyzeRequest } from '@/engine'
import { ImportError, parseNumber, readTable } from './csv'
import { findColumn } from './wind'

export type PowerCurve = Omit<AnalyzeRequest['powerCurve'], 'nTurbines'>

/** Per-turbine power curve: wind speed (m/s) and power (kW, or MW when the header says so). */
export function parsePowerCurveCsv(text: string): PowerCurve {
  const { header, rows } = readTable(text)
  const windCol = findColumn(header, /wind|speed|m\/s|^v/i) ?? 0
  const powerCol = findColumn(header, /power|leistung|kw|mw|^p/i, windCol) ?? (windCol === 0 ? 1 : 0)
  const scale = header && /mw/i.test(header[powerCol]) && !/kw/i.test(header[powerCol]) ? 1000 : 1
  const windMs: number[] = []
  const powerKw: number[] = []
  for (const { line, cells } of rows) {
    const v = parseNumber(cells[windCol])
    const p = parseNumber(cells[powerCol])
    if (v == null || p == null) throw new ImportError(`Line ${line}: power curve rows need a wind speed and a power value.`)
    if (windMs.length && v <= windMs[windMs.length - 1]) throw new ImportError(`Line ${line}: wind speeds must increase.`)
    windMs.push(v)
    powerKw.push(p * scale)
  }
  if (windMs.length < 2) throw new ImportError('A power curve needs at least two points.')
  return { windMs, powerKw }
}
