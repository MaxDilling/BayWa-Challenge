// windgap/core/metrics.py
import { expectedPower, parkPowerKw, type PowerCurve } from './energy'
import type { Prediction } from './models/base'

const pick = (a: Float64Array, idx: number[]) => Float64Array.from(idx, (i) => a[i])
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** Metrics over steps with both truth and prediction. energy_dev_pct is signed; aggregate |·| across scenarios. */
export function evaluate(truth: Float64Array, pred: Prediction, curve: PowerCurve): Record<string, number> {
  const idx = [...truth.keys()].filter((i) => !Number.isNaN(truth[i]) && !Number.isNaN(pred.mean[i]))
  if (!idx.length) return {}
  const p: Prediction = {
    mean: pick(pred.mean, idx),
    std: pick(pred.std, idx),
    q10: pick(pred.q10, idx),
    q50: pick(pred.q50, idx),
    q90: pick(pred.q90, idx),
  }
  const t = idx.map((i) => truth[i])
  const err = t.map((v, i) => p.mean[i] - v)
  const pTrue = t.map((v) => parkPowerKw(curve, v))
  const pMean = expectedPower(p, curve).pMeanKw
  const pErr = pTrue.map((v, i) => pMean[i] - v)
  const trueEnergy = pTrue.reduce((s, x) => s + x, 0)
  return {
    wind_rmse: Math.sqrt(avg(err.map((e) => e * e))),
    wind_mae: avg(err.map(Math.abs)),
    bias: avg(err),
    power_rmse: Math.sqrt(avg(pErr.map((e) => e * e))),
    power_mae: avg(pErr.map(Math.abs)),
    energy_dev_pct: trueEnergy > 0 ? (100 * pErr.reduce((s, x) => s + x, 0)) / trueEnergy : NaN,
    coverage_80: avg(t.map((v, i) => Number(v >= p.q10[i] && v <= p.q90[i]))),
  }
}
