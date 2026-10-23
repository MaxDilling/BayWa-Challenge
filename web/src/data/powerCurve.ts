import type { AnalyzeRequest } from '@/engine'
import { ImportError, parseNumber, readTable, type Table } from './csv'

export type PowerCurve = Omit<AnalyzeRequest['powerCurve'], 'nTurbines'>

const WIND = /wind|speed|geschw|m\/s|^v\b|^ws\b/i
const POWER = /power|leistung|kw|mw|^p\b/i
const COEFFICIENT = /coeff|\bc[pt]\b|thrust|schub/i

/** Per-turbine power curve (SPEC.md S1): wind speed (m/s) and power (kW, or MW when the header says so). */
export const parsePowerCurveCsv = (text: string) => powerCurve(readTable(text))

export function powerCurve({ header, rows }: Table): PowerCurve {
  const columns = rows[0].cells.map((_, i) => i)
  const windCol = columns.find((i) => header && WIND.test(header[i])) ?? 0
  const powerCols = columns.filter((i) => header && i !== windCol && POWER.test(header[i]) && !COEFFICIENT.test(header[i]))
  if (powerCols.length > 1)
    throw new ImportError(`The power curve has several power columns (${powerCols.map((i) => header![i]).join(', ')}); keep only the one to use.`)
  const powerCol = powerCols[0] ?? columns.find((i) => i !== windCol)
  if (powerCol === undefined) throw new ImportError('A power curve needs a wind speed and a power column.')
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
