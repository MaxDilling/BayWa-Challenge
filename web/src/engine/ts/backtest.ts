// windgap/backtest.py
import type { PowerCurve } from './energy'
import { rows, type Frame } from './frame'
import { evaluate, summarize } from './metrics'
import { create } from './models/registry'

const MIN_TRAIN_STEPS = 144

type Params = Record<string, number | string>

/** Fit on everything before row `start`, predict rows [start, end), score against the hidden target. */
export function fold(model: string, params: Params, target: Float64Array, refs: Frame, curve: PowerCurve, start: number, end: number) {
  const fitted = create(model, params).fit(target.slice(0, start), rows(refs, 0, start))
  const pred = fitted.predict(rows(refs, start, end))
  return { pred, metrics: evaluate(target.slice(start, end), pred, curve) }
}

/** Summarized metrics over up to `nFolds` outages of `length` steps, tiled backwards from the end of `target`. */
export function backtest(model: string, params: Params, target: Float64Array, refs: Frame, curve: PowerCurve, length: number, nFolds = 5) {
  const results: Record<string, number>[] = []
  for (let i = 1; i <= nFolds; i++) {
    const start = target.length - i * length
    if (start < MIN_TRAIN_STEPS) break
    const { metrics } = fold(model, params, target, refs, curve, start, start + length)
    if (Object.keys(metrics).length) results.push(metrics)
  }
  if (!results.length) return {}
  return { ...summarize(results), n_folds: results.length }
}
