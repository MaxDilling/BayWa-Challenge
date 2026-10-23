// windgap/core/metrics.py
import { energyLoss, expectedPower, parkPowerKw, type PowerCurve } from './energy'
import { STEP_H } from './frame'
import type { Prediction } from './models/base'

const pick = (a: Float64Array, idx: number[]) => Float64Array.from(idx, (i) => a[i])
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** Metrics of one scenario over steps with both truth and prediction. energy_dev_pct is signed. */
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
  const power = expectedPower(p, curve)
  const pTrue = t.map((v) => parkPowerKw(curve, v))
  const pErr = pTrue.map((v, i) => power.pMeanKw[i] - v)
  const energy = energyLoss(power)
  const trueKwh = pTrue.reduce((s, x) => s + x, 0) * STEP_H
  const metrics: Record<string, number> = {
    wind_rmse: Math.sqrt(avg(err.map((e) => e * e))),
    wind_mae: avg(err.map(Math.abs)),
    bias: avg(err),
    power_rmse: Math.sqrt(avg(pErr.map((e) => e * e))),
    power_mae: avg(pErr.map(Math.abs)),
    coverage_80: avg(t.map((v, i) => Number(v >= p.q10[i] && v <= p.q90[i]))),
    energy_coverage_80: Number(energy.kwhP10 <= trueKwh && trueKwh <= energy.kwhP90),
    energy_true_kwh: trueKwh,
    energy_err_kwh: energy.kwhP50 - trueKwh,
  }
  if (trueKwh > 0) {
    metrics.energy_dev_pct = (100 * (energy.kwhP50 - trueKwh)) / trueKwh
    metrics.energy_band_pct = (100 * (energy.kwhP90 - energy.kwhP10)) / trueKwh
  }
  return metrics
}

/** Mean of each metric over scenarios that have it; energy_dev_pct as mean of |·|; energy_wape_pct = Σ|err| / Σ true. */
export function summarize(results: Record<string, number>[]): Record<string, number> {
  const keys = [...new Set(results.flatMap(Object.keys))]
  const summary: Record<string, number> = Object.fromEntries(
    keys.map((key) => {
      const values = results.filter((r) => key in r).map((r) => (key === 'energy_dev_pct' ? Math.abs(r[key]) : r[key]))
      return [key, avg(values)]
    }),
  )
  const trueKwh = results.reduce((s, r) => s + r.energy_true_kwh, 0)
  if (trueKwh > 0) summary.energy_wape_pct = (100 * results.reduce((s, r) => s + Math.abs(r.energy_err_kwh), 0)) / trueKwh
  return summary
}
