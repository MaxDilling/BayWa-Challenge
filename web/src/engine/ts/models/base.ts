// windgap/models/base.py
import type { Frame } from '../frame'

export const Z90 = 1.2815515655446004

export interface Prediction {
  mean: Float64Array
  std: Float64Array
  q10: Float64Array
  q50: Float64Array
  q90: Float64Array
}

export interface Explanation {
  summary: string
  formula: string
  params: Record<string, number>
  diagnostics: Record<string, number>
}

/** fit sees only data before the outage; predict uses refs only, never the target. */
export interface WindModel {
  fit(target: Float64Array, refs: Frame): WindModel
  predict(refs: Frame): Prediction
  explain(): Explanation
}

/** Prediction from a normal distribution per step, every column floored at 0 m/s. */
export function gaussianPrediction(mean: Float64Array, std: number | Float64Array): Prediction {
  const s = typeof std === 'number' ? new Float64Array(mean.length).fill(std) : std
  const floor = (f: (m: number, s: number) => number) => mean.map((m, i) => Math.max(0, f(m, s[i])))
  return {
    mean: floor((m) => m),
    std: s,
    q10: floor((m, s) => m - Z90 * s),
    q50: floor((m) => m),
    q90: floor((m, s) => m + Z90 * s),
  }
}
