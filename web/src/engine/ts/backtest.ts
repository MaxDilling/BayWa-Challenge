// windgap/backtest.py
import type { PowerCurve } from './energy'
import { rows, type Frame } from './frame'
import { evaluate, summarize } from './metrics'
import type { Prediction, WindModel } from './models/base'
import { create } from './models/registry'

export const MIN_TRAIN_STEPS = 144
const CONTEXT_STEPS = 36

/** Prediction for rows [start, end) from the window plus up to CONTEXT_STEPS complete reference rows on either side;
 * `extra` goes along with the same rows. */
export function predictWindow(model: WindModel, refs: Frame, start: number, end: number, extra?: Frame) {
  const complete = (i: number) => i >= 0 && i < refs.cols[0].length && refs.cols.every((c) => !Number.isNaN(c[i]))
  let before = 0
  while (before < CONTEXT_STEPS && complete(start - before - 1)) before++
  let after = 0
  while (after < CONTEXT_STEPS && complete(end + after)) after++
  const pred = model.predict(rows(refs, start - before, end + after), extra && rows(extra, start - before, end + after))
  return Object.fromEntries(Object.entries(pred).map(([k, v]) => [k, v.slice(before, before + end - start)])) as Prediction
}

type Params = Record<string, number | string>

/** Fit on everything before row `start`, predict rows [start, end), score against the hidden target. */
export function fold(model: string, params: Params, target: Float64Array, refs: Frame, curve: PowerCurve, start: number, end: number, extra?: Frame) {
  const fitted = create(model, params).fit(target.slice(0, start), rows(refs, 0, start), extra && rows(extra, 0, start))
  const pred = predictWindow(fitted, refs, start, end, extra)
  return { pred, metrics: evaluate(target.slice(start, end), pred, curve, fitted.errors.acf) }
}

/** Summarized metrics over up to `nFolds` outages of `length` steps, tiled backwards from the end of `target`. */
export function backtest(model: string, params: Params, target: Float64Array, refs: Frame, curve: PowerCurve, length: number, extra?: Frame, nFolds = 5) {
  const results: Record<string, number>[] = []
  for (let i = 1; i <= nFolds; i++) {
    const start = target.length - i * length
    if (start < MIN_TRAIN_STEPS) break
    const { metrics } = fold(model, params, target, refs, curve, start, start + length, extra)
    if (Object.keys(metrics).length) results.push(metrics)
  }
  if (!results.length) return {}
  return { ...summarize(results), n_folds: results.length }
}
