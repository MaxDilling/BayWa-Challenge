import type { AnalyzeRequest, Grid } from '@/engine'
import { STEP_MS } from '@/engine/ts/frame'
import { ImportError } from './csv'
import { detectOutages, type Span } from './outage'
import type { PowerCurve } from './powerCurve'
import type { WindSeries } from './wind'

export interface Dataset {
  target: WindSeries
  references: WindSeries[]
  powerCurve: PowerCurve
  nTurbines: number
  outages: Span[]
  gaps: Span[]
}

export function buildDataset(target: WindSeries, references: WindSeries[], powerCurve: PowerCurve, nTurbines = 1): Dataset {
  if (!references.length) throw new ImportError('At least one reference wind farm is needed.')
  return { target, references, powerCurve, nTurbines, ...detectOutages(target.grid, references.map((r) => r.grid)) }
}

/** Longest reference gap during an outage that is bridged by linear interpolation (1 h). */
export const MAX_REFERENCE_FILL_STEPS = 6

export function toRequest(dataset: Dataset, outage: Span, model: string, params?: AnalyzeRequest['params']): AnalyzeRequest {
  return {
    target: dataset.target.grid,
    references: dataset.references.map((r) => ({ id: r.id, grid: fillDuringOutage(r, outage) })),
    powerCurve: { ...dataset.powerCurve, nTurbines: dataset.nTurbines },
    outage,
    model,
    params,
  }
}

/** The engines need complete references during the outage: bridge short gaps, refuse long ones. */
function fillDuringOutage({ id, grid }: WindSeries, outage: Span): Grid {
  const values = [...grid.values]
  const first = (outage.startMs - grid.t0) / STEP_MS
  const last = (outage.endMs - grid.t0) / STEP_MS - 1
  if (first < 0 || last >= values.length)
    throw new ImportError(`Reference "${id}" does not cover the whole outage.`)
  for (let i = first; i <= last; i++) {
    if (values[i] !== null) continue
    let j = i
    while (j <= last && values[j] === null) j++
    const before = values[i - 1]
    const after = values[j]
    if (j - i > MAX_REFERENCE_FILL_STEPS || before == null || after == null)
      throw new ImportError(`Reference "${id}" misses ${j - i} steps in a row during the outage; at most ${MAX_REFERENCE_FILL_STEPS} are bridged.`)
    for (let k = i; k < j; k++) values[k] = before + ((after - before) * (k - i + 1)) / (j - i + 1)
    i = j
  }
  return { ...grid, values }
}
