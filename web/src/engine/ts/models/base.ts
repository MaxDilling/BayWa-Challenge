// windgap/models/base.py
import { correlation, mean, STEP_H, sum, type Frame } from '../frame'

export const Z90 = 1.2815515655446004
const N_BLOCKS = 5
const MAX_MEMORY_STEPS = 432

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

/** fit sees only data before the outage; predict uses refs and extra only, never the target. fit sets `errors`.
 * extra: the references' wind directions in degrees, one column per reference (S3). */
export interface WindModel {
  errors: Errors
  fit(target: Float64Array, refs: Frame, extra?: Frame): WindModel
  predict(refs: Frame, extra?: Frame): Prediction
  explain(): Explanation
}

/** Out-of-sample errors in training: σ_t = sigma0 + sigmaSlope · v̂_t, and the autocorrelation of err_t / σ_t. */
export class Errors {
  readonly sigma0: number
  readonly sigmaSlope: number
  acf = [1]

  constructor(sigma0: number, sigmaSlope: number) {
    this.sigma0 = sigma0
    this.sigmaSlope = sigmaSlope
  }

  sigma(mean: Float64Array): Float64Array {
    return mean.map((m) => this.sigma0 + this.sigmaSlope * Math.max(m, 0))
  }

  /** Integral time scale (1 + 2 Σ_{k≥1} acf(k)) · 10 min. */
  get memoryH(): number {
    return (2 * this.acf.reduce((s, c) => s + c, 0) - 1) * STEP_H
  }
}

/** Inputs as one array per column, rows aligned with y. */
export type Fit = (x: Float64Array[], y: Float64Array) => (x: Float64Array[]) => Float64Array

/** Leave-one-block-out: the measured rows (every input and y present) are cut into N_BLOCKS contiguous blocks of equal
 * count; each block is predicted by `fit` on the other blocks. */
export function calibrate(x: Float64Array[], y: Float64Array, fit: Fit): Errors {
  const measured = [...y.keys()].filter((i) => !Number.isNaN(y[i]) && x.every((c) => !Number.isNaN(c[i])))
  const take = (idx: number[]) => x.map((c) => Float64Array.from(idx, (i) => c[i]))
  const n = measured.length
  const pred = new Float64Array(y.length).fill(NaN)
  let start = 0
  for (let b = 0; b < N_BLOCKS; b++) {
    const end = start + Math.floor(n / N_BLOCKS) + (b < n % N_BLOCKS ? 1 : 0)
    const train = [...measured.slice(0, start), ...measured.slice(end)]
    const block = measured.slice(start, end)
    const line = fit(take(train), Float64Array.from(train, (i) => y[i]))
    line(take(block)).forEach((p, k) => (pred[block[k]] = p))
    start = end
  }
  const err = pred.map((p, i) => p - y[i])
  const valid = [...err.keys()].filter((i) => !Number.isNaN(err[i]))
  const v = valid.map((i) => Math.max(pred[i], 0))
  const e = valid.map((i) => Math.abs(err[i]))
  const vm = mean(v)
  const em = mean(e)
  let slope = Math.max(0, sum(v.map((vi, i) => (vi - vm) * (e[i] - em))) / sum(v.map((vi) => (vi - vm) ** 2)))
  let base = em - slope * vm
  if (base < 0) {
    base = 0
    slope = sum(v.map((vi, i) => vi * e[i])) / sum(v.map((vi) => vi * vi))
  }
  const scale = quantile(e.map((ei, i) => ei / (base + slope * v[i])), 0.8) / Z90
  const errors = new Errors(scale * base, scale * slope)
  const sigma = errors.sigma(pred)
  errors.acf = acf(err.map((x, i) => x / sigma[i]))
  return errors
}

/** Autocorrelation about 0, skipping pairs with a missing value; stops before the first lag with acf ≤ 0. */
function acf(err: Float64Array): number[] {
  const valid = err.map((e) => Number(!Number.isNaN(e)))
  const z = err.map((e) => (Number.isNaN(e) ? 0 : e))
  const variance = sum(z.map((v) => v * v)) / sum(valid)
  const out = [1]
  for (let k = 1; k <= Math.min(MAX_MEMORY_STEPS, z.length - 1); k++) {
    let n = 0
    let s = 0
    for (let i = 0; i + k < z.length; i++) {
      n += valid[i] * valid[i + k]
      s += z[i] * z[i + k]
    }
    const c = n ? s / n / variance : 0
    if (c <= 0) break
    out.push(c)
  }
  return out
}

/** numpy.quantile with linear interpolation. */
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b)
  const h = (s.length - 1) * q
  const lo = Math.floor(h)
  return s[lo] + (h - lo) * (s[Math.min(lo + 1, s.length - 1)] - s[lo])
}

/** Prediction from a normal distribution per step, every column floored at 0 m/s. */
export function gaussianPrediction(mean: Float64Array, std: Float64Array): Prediction {
  const floor = (f: (m: number, s: number) => number) => mean.map((m, i) => Math.max(0, f(m, std[i])))
  return {
    mean: floor((m) => m),
    std,
    q10: floor((m, s) => m - Z90 * s),
    q50: floor((m) => m),
    q90: floor((m, s) => m + Z90 * s),
  }
}

/** The reference column and delay τ (|τ| ≤ lagMax steps) at which the target correlates best on the training data:
 * [column, τ, r, best r of every column]. */
export function pickReference(refs: Frame, y: Float64Array, lagMax: number): [number, number, number, number[]] {
  let best: [number, number, number] = [0, 0, -Infinity]
  const rs = refs.cols.map((x, col) => {
    const [r, lag] = bestLag(x, y, lagMax)
    if (r > best[2]) best = [col, lag, r]
    return r
  })
  return [...best, rs]
}

/** [r, τ] at the delay |τ| ≤ lagMax steps where x(t − τ) correlates best with y(t). */
export function bestLag(x: Float64Array, y: Float64Array, lagMax: number): [number, number] {
  let [r, lag] = [-Infinity, 0]
  for (let l = -lagMax; l <= lagMax; l++) {
    const c = correlation(...laggedPairs(x, y, l))
    if (c >= r) [r, lag] = [c, l]
  }
  return [r, lag]
}

/** Which reference the model uses and how well each tracked the target; only when there was a choice. */
export const choiceDiagnostics = (col: number, rs: number[]): Record<string, number> =>
  rs.length > 1 ? { reference_index: col, ...Object.fromEntries(rs.map((r, i) => [`r_ref_${i}`, r])) } : {}

/** (x(t − lag), y(t)) over the steps where both exist on the grid. */
export function laggedPairs(x: Float64Array, y: Float64Array, lag: number): [Float64Array, Float64Array] {
  const n = x.length
  return [x.slice(Math.max(0, -lag), n - Math.max(0, lag)), y.slice(Math.max(0, lag), n - Math.max(0, -lag))]
}
