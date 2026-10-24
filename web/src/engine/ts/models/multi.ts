// windgap/models/multi.py
import { correlation, mean, type Frame } from '../frame'
import { bestLag, calibrate, gaussianPrediction, type Errors, type Explanation, type WindModel } from './base'

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

  constructor(lagMaxMin = 60) {
    this.lagMax = Math.floor(lagMaxMin / 10)
  }

  fit(target: Float64Array, refs: Frame) {
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
    this.r = correlation(combine(this.a, this.b, inputs), target)
    this.errors = calibrate(inputs, target, (tx, ty) => {
      const [a, b] = leastSquares(tx, ty)
      return (v) => combine(a, b, v)
    })
    return this
  }

  /** Beyond the edges of `refs` the edge value stands in; callers pass context (predictWindow). */
  predict(refs: Frame) {
    const n = refs.cols[0].length
    const inputs = this.used.map((i) => refs.cols[i].map((_, t) => refs.cols[i][Math.min(Math.max(t - this.lags[i], 0), n - 1)]))
    const m = combine(this.a, this.b, inputs)
    return gaussianPrediction(m, this.errors.sigma(m))
  }

  explain(): Explanation {
    const refs = this.rRefs.map((_, i) => i)
    return {
      summary:
        'The missing wind speed is a weighted sum of all reference wind speeds, each shifted by its own delay τ; the ' +
        'weights are fitted by least squares on the time all farms measured, so references that agree with the target ' +
        'count more and their independent errors partly cancel. A reference that would get a negative weight is left out.',
      formula: '\\hat{v}_t = a + \\sum_i b_i \\cdot v_i(t - \\tau_i)',
      params: { a: this.a, ...Object.fromEntries(refs.map((i) => [`b_ref_${i}`, this.used.includes(i) ? this.b[this.used.indexOf(i)] : 0])) },
      diagnostics: {
        r: this.r,
        n_train: this.nTrain,
        sigma_0: this.errors.sigma0,
        sigma_slope: this.errors.sigmaSlope,
        error_memory_h: this.errors.memoryH,
        ...Object.fromEntries(refs.map((i) => [`lag_min_ref_${i}`, this.lags[i] * 10])),
        ...(refs.length > 1 ? Object.fromEntries(refs.map((i) => [`r_ref_${i}`, this.rRefs[i]])) : {}),
      },
    }
  }
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
