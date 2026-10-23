import { fmtAmount, fmtNum } from '@/components/format'
import { STEP_MS } from '@/engine/ts/frame'
import type { Dataset } from './dataset'
import type { Span } from './outage'

/** A plausibility finding; `step` is where it matters (Results and Export list all). */
export interface Warning {
  step: 'upload' | 'outage' | 'method'
  title: string
  detail: string
}

const MIN_CORRELATION = 0.7
const MIN_TRAIN_STEPS = 5 * 144
const MIN_RATED_KW = 100
const MAX_RATED_KW = 20_000

/** Data-quality checks the engine does not make. `r` is the model's correlation from the engine's diagnostics. */
export function plausibility(dataset: Dataset, outage?: Span, r?: number): Warning[] {
  const { target, references, powerCurve } = dataset
  const warnings: Warning[] = []
  const rated = Math.max(...powerCurve.powerKw)
  if (rated <= 0)
    warnings.push({ step: 'upload', title: 'The power curve never produces power', detail: 'Every power value is 0 or less, so no energy can be lost. Check the power column.' })
  else if (rated < MIN_RATED_KW || rated > MAX_RATED_KW)
    warnings.push({
      step: 'upload',
      title: 'Unusual rated power',
      detail: `The curve peaks at ${fmtAmount(rated)} kW per turbine; real turbines have ${fmtNum(MIN_RATED_KW)} kW to ${fmtNum(MAX_RATED_KW / 1000)} MW. Check the unit (kW, MW or W) and that the curve is for one turbine.`,
    })

  for (const ref of references) {
    const offset = (ref.grid.t0 - target.grid.t0) / STEP_MS
    const both = target.grid.values.flatMap((v, i) => {
      const w = ref.grid.values[i - offset]
      return v == null || w == null ? [] : [v - w]
    })
    if (both.length && both.every((d) => d === 0))
      warnings.push({ step: 'upload', title: `Target and ${ref.id} are identical`, detail: 'Every common value is the same. The same file was probably loaded twice.' })
  }

  if (r !== undefined && r < MIN_CORRELATION)
    warnings.push({
      step: 'method',
      title: `Low correlation r = ${fmtNum(r, 2)}`,
      detail: `Target and reference agree less than usual for this method (r below ${MIN_CORRELATION}), so the prediction and its range are less reliable. A closer reference farm would help.`,
    })

  if (!outage) return warnings
  const bridged = references.reduce((n, ref) => {
    const first = (outage.startMs - ref.grid.t0) / STEP_MS
    return n + ref.grid.values.slice(Math.max(first, 0), first + (outage.endMs - outage.startMs) / STEP_MS).filter((v) => v == null).length
  }, 0)
  if (bridged)
    warnings.push({
      step: 'outage',
      title: `${fmtNum(bridged)} reference value${bridged === 1 ? '' : 's'} bridged`,
      detail: 'The reference misses these 10-minute values during the outage; they are interpolated linearly from their neighbours.',
    })

  const before = target.grid.values.slice(0, Math.max(0, (outage.startMs - target.grid.t0) / STEP_MS)).filter((v) => v != null).length
  if (before < MIN_TRAIN_STEPS)
    warnings.push({
      step: 'outage',
      title: 'Little data before the outage',
      detail: `The model learns from ${fmtNum(before / 144, 1)} days of target data before the outage; 5 days or more make the fit and the backtest reliable.`,
    })

  const targetEnd = target.grid.t0 + target.grid.values.length * STEP_MS
  if (outage.endMs >= targetEnd)
    warnings.push({
      step: 'outage',
      title: 'The outage runs to the end of the target data',
      detail: 'Its end is where the reference data ends, not a measured restart of the farm. Check the end time.',
    })
  return warnings
}
