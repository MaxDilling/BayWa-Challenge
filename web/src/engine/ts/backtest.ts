// windgap/backtest.py
import type { PowerCurve } from './energy'
import { rows, type Frame } from './frame'
import { evaluate } from './metrics'
import { create } from './models/registry'

const MIN_TRAIN_STEPS = 144

type Params = Record<string, number | string>

/** Fit on everything before row `start`, predict rows [start, end), score against the hidden target. */
export function fold(model: string, params: Params, target: Float64Array, refs: Frame, curve: PowerCurve, start: number, end: number) {
  const fitted = create(model, params).fit(target.slice(0, start), rows(refs, 0, start))
  const pred = fitted.predict(rows(refs, start, end))
  return { pred, metrics: evaluate(target.slice(start, end), pred, curve) }
}

/** Mean metrics over up to `nFolds` outages of `length` steps, tiled backwards from the end of `target`. */
export function backtest(model: string, params: Params, target: Float64Array, refs: Frame, curve: PowerCurve, length: number, nFolds = 5) {
  const results: Record<string, number>[] = []
  for (let i = 1; i <= nFolds; i++) {
    const start = target.length - i * length
    if (start < MIN_TRAIN_STEPS) break
    const { metrics } = fold(model, params, target, refs, curve, start, start + length)
    if (Object.keys(metrics).length) results.push(metrics)
  }
  if (!results.length) return {}
  const summary: Record<string, number> = {}
  for (const key of Object.keys(results[0])) {
    const values = results.map((r) => (key === 'energy_dev_pct' ? Math.abs(r[key]) : r[key])).filter((v) => !Number.isNaN(v))
    summary[key] = values.length ? values.reduce((s, x) => s + x, 0) / values.length : NaN
  }
  summary.n_folds = results.length
  return summary
}
