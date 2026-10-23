// windgap/models/linear.py
import { mean, pairs, type Frame } from '../frame'
import { calibrate, choiceDiagnostics, gaussianPrediction, laggedPairs, pickReference, type Errors, type Explanation, type WindModel } from './base'

type Coefficients = (x: Float64Array, y: Float64Array) => [number, number]

abstract class Linear implements WindModel {
  errors!: Errors
  private lagMax: number
  private lag = 0
  private ref = 0
  private rRefs: number[] = []
  private r = NaN
  private a = NaN
  private b = NaN
  private nTrain = 0
  protected abstract summary: string
  protected abstract coefficients: Coefficients

  constructor(lagMaxMin = 60) {
    this.lagMax = Math.floor(lagMaxMin / 10)
  }

  fit(target: Float64Array, refs: Frame) {
    ;[this.ref, this.lag, this.r, this.rRefs] = pickReference(refs, target, this.lagMax)
    const [x, y] = laggedPairs(refs.cols[this.ref], target, this.lag)
    const [px, py] = pairs(x, y)
    ;[this.a, this.b] = this.coefficients(Float64Array.from(px), Float64Array.from(py))
    this.nTrain = px.length
    this.errors = calibrate(x, y, (tx, ty) => {
      const [a, b] = this.coefficients(tx, ty)
      return (v) => v.map((vi) => a + b * vi)
    })
    return this
  }

  /** Beyond the edges of `refs` the edge value stands in; callers pass context (predictWindow). */
  predict(refs: Frame) {
    const x = refs.cols[this.ref]
    const n = x.length
    const m = x.map((_, i) => this.a + this.b * x[Math.min(Math.max(i - this.lag, 0), n - 1)])
    return gaussianPrediction(m, this.errors.sigma(m))
  }

  explain(): Explanation {
    return {
      summary: this.summary,
      formula: '\\hat{v}_t = a + b \\cdot v_r(t - \\tau)',
      params: { a: this.a, b: this.b },
      diagnostics: {
        r: this.r,
        lag_min: this.lag * 10,
        n_train: this.nTrain,
        sigma_0: this.errors.sigma0,
        sigma_slope: this.errors.sigmaSlope,
        error_memory_h: this.errors.memoryH,
        ...choiceDiagnostics(this.ref, this.rRefs),
      },
    }
  }
}

const centered = (x: Float64Array) => {
  const m = mean(x)
  return x.map((v) => v - m)
}
const dot = (a: Float64Array, b: Float64Array) => a.reduce((s, v, i) => s + v * b[i], 0)

export class LinearRegression extends Linear {
  protected summary =
    'The missing wind speed follows a straight line through the reference wind speed, fitted by least squares on the ' +
    'time both parks measured. The reference is shifted by the delay τ at which both parks agree best, because ' +
    'weather reaches them one after the other.'
  protected coefficients: Coefficients = (x, y) => {
    const [cx, cy] = [centered(x), centered(y)]
    const b = dot(cx, cy) / dot(cx, cx)
    return [mean(y) - b * mean(x), b]
  }
}

export class VarianceRatio extends Linear {
  protected summary =
    "The missing wind speed follows a straight line through the reference wind speed that keeps the target's " +
    'average and spread from the training period: b is the ratio of their standard deviations. The reference is ' +
    'shifted by the delay τ at which both parks agree best.'
  protected coefficients: Coefficients = (x, y) => {
    const [cx, cy] = [centered(x), centered(y)]
    const b = Math.sqrt(dot(cy, cy) / dot(cx, cx))
    return [mean(y) - b * mean(x), b]
  }
}
