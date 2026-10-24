// windgap/models/sector.py
import { correlation, type Frame } from '../frame'
import { calibrate, gaussianPrediction, type Explanation } from './base'
import { MultiRegression, nonnegative } from './multi'

const MIN_SECTOR_STEPS = 288
const SUMMARY =
  'The missing wind speed is a weighted sum of all reference wind speeds, each shifted by its own delay τ. The ' +
  'weights are fitted by least squares outside the outage, separately for each wind direction sector: where a ' +
  "neighbour's wake or the terrain changes how the target follows a reference, that direction gets its own weights. " +
  'A sector with less than two days of values uses the weights of all directions; a reference that would get a ' +
  'negative weight is left out.'

export class SectorRegression extends MultiRegression {
  private coefs: number[][] = []
  private steps: number[] = []

  constructor(lagMaxMin = 60, directionSectors = 8) {
    super(lagMaxMin, directionSectors)
  }

  fit(target: Float64Array, refs: Frame, extra?: Frame) {
    const all = this.delays(refs, target)
    const x = this.used.map((i) => all[i])
    const sector = this.sector(extra, target.length)
    ;[this.coefs, this.steps, this.nTrain] = coefs(x, target, sector, this.sectors)
    this.r = correlation(apply(this.coefs, x, sector), target)
    this.errors = calibrate([...x, sector], target, (tx, ty) => {
      const [c] = coefs(tx.slice(0, -1), ty, tx[tx.length - 1], this.sectors)
      return (v) => apply(c, v.slice(0, -1), v[v.length - 1])
    })
    return this
  }

  /** Beyond the edges of `refs` the edge value stands in; callers pass context (predictWindow). */
  predict(refs: Frame, extra?: Frame) {
    const n = refs.cols[0].length
    const inputs = this.used.map((i) => refs.cols[i].map((_, t) => refs.cols[i][Math.min(Math.max(t - this.lags[i], 0), n - 1)]))
    const m = apply(this.coefs, inputs, this.sector(extra, n))
    return gaussianPrediction(m, this.errors.sigma(m))
  }

  explain(): Explanation {
    const refs = this.rRefs.map((_, i) => i)
    const deg = (s: number) => String((s * 360) / this.sectors)
    const weights = (row: number[], prefix: string) =>
      Object.fromEntries(refs.map((i) => [`${prefix}ref_${i}`, this.used.includes(i) ? row[1 + this.used.indexOf(i)] : 0]))
    const own = this.steps.flatMap((n, s) => (n >= MIN_SECTOR_STEPS ? [s] : []))
    return {
      summary: SUMMARY,
      formula: '\\hat{v}_t = a_{s(t)} + \\sum_i b_{s(t),i} \\cdot v_i(t - \\tau_i)',
      params: {
        a: this.coefs[this.sectors][0],
        ...weights(this.coefs[this.sectors], 'b_'),
        ...Object.fromEntries(own.flatMap((s) => [[`a_${deg(s)}`, this.coefs[s][0]], ...Object.entries(weights(this.coefs[s], `b_${deg(s)}_`))])),
      },
      diagnostics: {
        r: this.r,
        n_train: this.nTrain,
        sigma_0: this.errors.sigma0,
        sigma_slope: this.errors.sigmaSlope,
        error_memory_h: this.errors.memoryH,
        ...Object.fromEntries(refs.map((i) => [`lag_min_ref_${i}`, this.lags[i] * 10])),
        ...(refs.length > 1 ? Object.fromEntries(refs.map((i) => [`r_ref_${i}`, this.rRefs[i]])) : {}),
        ...Object.fromEntries(this.steps.flatMap((n, s) => (n ? [[`sector_steps_${deg(s)}`, n]] : []))),
      },
    }
  }
}

/** [(a, b…) per sector with "all directions" at index n, measured steps per sector, measured steps in all]. The weights
 * of all directions decide which columns are used; a sector refits them on its own rows once it has MIN_SECTOR_STEPS. */
function coefs(x: Float64Array[], y: Float64Array, sector: Float64Array, n: number): [number[][], number[], number] {
  const [a, b, cols, rows] = nonnegative(x, y)
  const row = (a0: number, bs: number[], cs: number[]) => {
    const out = new Array<number>(x.length + 1).fill(0)
    out[0] = a0
    cs.forEach((c, k) => (out[1 + c] = bs[k]))
    return out
  }
  const out = Array.from({ length: n + 1 }, () => row(a, b, cols))
  const steps = new Array<number>(n).fill(0)
  for (const t of rows) if (sector[t] < n) steps[sector[t]]++
  for (let s = 0; s < n; s++) {
    if (steps[s] < MIN_SECTOR_STEPS) continue
    const mine = [...y.keys()].filter((t) => sector[t] === s)
    const [as, bs, cs] = nonnegative(
      cols.map((c) => Float64Array.from(mine, (t) => x[c][t])),
      Float64Array.from(mine, (t) => y[t]),
    )
    out[s] = row(as, bs, cs.map((k) => cols[k]))
  }
  return [out, steps, rows.length]
}

/** a_s + Σᵢ b_{s,i} · xᵢ per row; NaN where an input with a weight is missing, and only there. */
function apply(coefs: number[][], x: Float64Array[], sector: Float64Array): Float64Array {
  return sector.map((s, t) => coefs[s].slice(1).reduce((acc, b, k) => acc + (b === 0 ? 0 : b * x[k][t]), coefs[s][0]))
}
