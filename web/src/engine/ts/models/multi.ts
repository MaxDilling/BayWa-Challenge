// windgap/models/multi.py
import { correlation, mean, type Frame } from '../frame'
import { bestLag, calibrate, gaussianPrediction, type Errors, type Explanation, type WindModel } from './base'

const WAKE_PRIOR_STEPS = 144
const SUMMARY =
  'The missing wind speed is a weighted sum of all reference wind speeds, each shifted by its own delay τ; the ' +
  'weights are fitted by least squares on the time all farms measured, so references that agree with the target ' +
  'count more and their independent errors partly cancel. A reference that would get a negative weight is left out.'
const WAKE_SUMMARY =
  ' A factor per wind direction sector then corrects what the references cannot see, such as the wake of a ' +
  'neighbouring turbine: it is the measured over the predicted wind in that sector before the outage, pulled towards ' +
  '1 where the sector has few values.'

export class MultiRegression implements WindModel {
  errors!: Errors
  private lagMax: number
  private lags: number[] = []
  private rRefs: number[] = []
  private used: number[] = []
  private a = NaN
  private b: number[] = []
  private r = NaN
  private nTrain = 0
  private sectors: number
  private factors: number[] = [1]
  private sectorSteps: number[] = []

  constructor(lagMaxMin = 60, directionSectors = 12) {
    this.lagMax = Math.floor(lagMaxMin / 10)
    this.sectors = Math.trunc(directionSectors)
  }

  fit(target: Float64Array, refs: Frame, extra?: Frame) {
    const best = refs.cols.map((x) => bestLag(x, target, this.lagMax))
    this.rRefs = best.map(([r]) => r)
    this.lags = best.map(([, lag]) => lag)
    const x = refs.cols.map((c, i) => shifted(c, this.lags[i]))
    this.used = this.rRefs.flatMap((r, i) => (Number.isFinite(r) ? [i] : []))
    let rows: number[]
    for (;;) {
      rows = [...target.keys()].filter((t) => !Number.isNaN(target[t]) && this.used.every((i) => !Number.isNaN(x[i][t])))
      ;[this.a, this.b] = leastSquares(
        this.used.map((i) => Float64Array.from(rows, (t) => x[i][t])),
        Float64Array.from(rows, (t) => target[t]),
      )
      if (this.used.length === 1 || this.b.every((b) => b >= 0)) break
      this.used.splice(this.b.indexOf(Math.min(...this.b)), 1)
    }
    this.nTrain = rows.length
    const inputs = this.used.map((i) => x[i])
    const plain = combine(this.a, this.b, inputs)
    const sector = this.sector(extra, target.length)
    ;[this.factors, this.sectorSteps] = sectorFactors(plain, target, sector, this.sectors)
    this.r = correlation(plain.map((p, t) => p * this.factors[sector[t]]), target)
    this.errors = calibrate([...inputs, sector], target, (tx, ty) => {
      const s = tx[tx.length - 1]
      const [a, b] = leastSquares(tx.slice(0, -1), ty)
      const [factors] = sectorFactors(combine(a, b, tx.slice(0, -1)), ty, s, this.sectors)
      return (v) => combine(a, b, v.slice(0, -1)).map((p, t) => p * factors[v[v.length - 1][t]])
    })
    return this
  }

  /** Direction sector per step (0 = centred on north) from the circular mean of the references' directions;
   * `sectors` where no reference has a direction. */
  private sector(extra: Frame | undefined, n: number): Float64Array {
    const out = new Float64Array(n).fill(this.sectors)
    if (!extra || !this.sectors) return out
    const width = 360 / this.sectors
    for (let t = 0; t < n; t++) {
      let s = 0
      let c = 0
      const known = extra.cols.filter((col) => !Number.isNaN(col[t]))
      for (const col of known) {
        s += Math.sin(col[t] * (Math.PI / 180))
        c += Math.cos(col[t] * (Math.PI / 180))
      }
      const mean = (((Math.atan2(s, c) * (180 / Math.PI)) % 360) + 360) % 360
      if (known.length) out[t] = Math.floor((mean + width / 2) / width) % this.sectors
    }
    return out
  }

  /** Beyond the edges of `refs` the edge value stands in; callers pass context (predictWindow). */
  predict(refs: Frame, extra?: Frame) {
    const n = refs.cols[0].length
    const inputs = this.used.map((i) => refs.cols[i].map((_, t) => refs.cols[i][Math.min(Math.max(t - this.lags[i], 0), n - 1)]))
    const sector = this.sector(extra, n)
    const m = combine(this.a, this.b, inputs).map((p, t) => p * this.factors[sector[t]])
    return gaussianPrediction(m, this.errors.sigma(m))
  }

  explain(): Explanation {
    const refs = this.rRefs.map((_, i) => i)
    const sectors = this.sectorSteps.flatMap((n, s) => (n ? [[String((s * 360) / this.sectors), s] as const] : []))
    return {
      summary: SUMMARY + (sectors.length ? WAKE_SUMMARY : ''),
      formula: sectors.length
        ? '\\hat{v}_t = f_{s(t)} \\cdot \\Big(a + \\sum_i b_i \\cdot v_i(t - \\tau_i)\\Big)'
        : '\\hat{v}_t = a + \\sum_i b_i \\cdot v_i(t - \\tau_i)',
      params: {
        a: this.a,
        ...Object.fromEntries(refs.map((i) => [`b_ref_${i}`, this.used.includes(i) ? this.b[this.used.indexOf(i)] : 0])),
        ...Object.fromEntries(sectors.map(([deg, s]) => [`wake_factor_${deg}`, this.factors[s]])),
      },
      diagnostics: {
        r: this.r,
        n_train: this.nTrain,
        sigma_0: this.errors.sigma0,
        sigma_slope: this.errors.sigmaSlope,
        error_memory_h: this.errors.memoryH,
        ...Object.fromEntries(refs.map((i) => [`lag_min_ref_${i}`, this.lags[i] * 10])),
        ...(refs.length > 1 ? Object.fromEntries(refs.map((i) => [`r_ref_${i}`, this.rRefs[i]])) : {}),
        ...Object.fromEntries(sectors.map(([deg, s]) => [`wake_steps_${deg}`, this.sectorSteps[s]])),
      },
    }
  }
}

/** [f per sector plus 1 for "no direction" at index n, measured steps per sector]:
 * f_s = (Σ_s y + k · m) / (Σ_s ŷ + k · m) with k = WAKE_PRIOR_STEPS and m the mean prediction. */
function sectorFactors(pred: Float64Array, y: Float64Array, sector: Float64Array, n: number): [number[], number[]] {
  const factors = new Array<number>(n + 1).fill(1)
  const steps = new Array<number>(n).fill(0)
  const ok = [...pred.keys()].filter((t) => !Number.isNaN(pred[t]) && !Number.isNaN(y[t]) && sector[t] < n)
  if (!ok.length) return [factors, steps]
  const prior = WAKE_PRIOR_STEPS * mean(Float64Array.from(ok, (t) => pred[t]))
  const sumY = new Array<number>(n).fill(0)
  const sumPred = new Array<number>(n).fill(0)
  for (const t of ok) {
    sumY[sector[t]] += y[t]
    sumPred[sector[t]] += pred[t]
    steps[sector[t]]++
  }
  for (let s = 0; s < n; s++) factors[s] = (sumY[s] + prior) / (sumPred[s] + prior)
  return [factors, steps]
}

/** a + Σ b_k · x_k per row; NaN where an input is missing. */
function combine(a: number, b: number[], x: Float64Array[]): Float64Array {
  return x[0].map((_, t) => a + b.reduce((s, bk, k) => s + bk * x[k][t], 0))
}

/** [a, b] of y ≈ a + Σ b_k · x_k from the normal equations of the centered data (numpy.linalg.solve in windgap). */
function leastSquares(x: Float64Array[], y: Float64Array): [number, number[]] {
  const mx = x.map(mean)
  const my = mean(y)
  const xc = x.map((c, k) => c.map((v) => v - mx[k]))
  const yc = y.map((v) => v - my)
  const dot = (u: Float64Array, v: Float64Array) => u.reduce((s, ui, i) => s + ui * v[i], 0)
  const b = solve(
    xc.map((u) => xc.map((v) => dot(u, v))),
    xc.map((u) => dot(u, yc)),
  )
  return [my - b.reduce((s, bk, k) => s + bk * mx[k], 0), b]
}

/** Gaussian elimination with partial pivoting. */
function solve(m: number[][], rhs: number[]): number[] {
  const n = rhs.length
  const a = m.map((row, i) => [...row, rhs[i]])
  for (let c = 0; c < n; c++) {
    const p = a.reduce((best, row, i) => (i >= c && Math.abs(row[c]) > Math.abs(a[best][c]) ? i : best), c)
    ;[a[c], a[p]] = [a[p], a[c]]
    for (let i = c + 1; i < n; i++) {
      const f = a[i][c] / a[c][c]
      for (let j = c; j <= n; j++) a[i][j] -= f * a[c][j]
    }
  }
  const out = new Array<number>(n)
  for (let i = n - 1; i >= 0; i--) out[i] = (a[i][n] - a[i].slice(i + 1, n).reduce((s, v, k) => s + v * out[i + 1 + k], 0)) / a[i][i]
  return out
}

/** x(t − lag) on the same grid, NaN where it lies outside. */
function shifted(x: Float64Array, lag: number): Float64Array {
  return x.map((_, t) => (t - lag >= 0 && t - lag < x.length ? x[t - lag] : NaN))
}
