// windgap/engine.py, ported for the models in ./models/registry.ts.
import type { AnalyzeRequest, AnalyzeResponse, Engine } from '../contract'
import { backtest, predictWindow } from './backtest'
import { energyLoss, expectedPower } from './energy'
import { align, pairs, rows, STEP_MS, type Frame } from './frame'
import type { WindModel } from './models/base'
import { create, info } from './models/registry'

const MAX_SCATTER = 2000

export function analyze(req: AnalyzeRequest): AnalyzeResponse {
  const started = performance.now()
  const all = align([req.target, ...req.references.map((r) => r.grid)])
  const [target] = all.cols
  const refs: Frame = { t0: all.t0, cols: all.cols.slice(1) }
  const { startMs, endMs } = req.outage
  const start = (startMs - all.t0) / STEP_MS
  const end = start + (endMs - startMs) / STEP_MS
  const refsOut = rows(refs, start, end)
  if (refsOut.cols.some((c) => c.some(Number.isNaN)))
    throw new Error('references must be complete during the outage; gap filling belongs to the import step')

  const params = req.params ?? {}
  const train = Math.max(0, Math.min(start, target.length))
  const trainTarget = target.slice(0, train)
  const trainRefs = rows(refs, 0, train)
  const model = create(req.model, params).fit(trainTarget, trainRefs)
  const pred = predictWindow(model, refs, start, end)
  const energy = energyLoss(expectedPower(pred, req.powerCurve), model.errors.acf)
  const explanation = model.explain()

  return {
    prediction: { t0: startMs, stepS: 600, mean: [...pred.mean], q10: [...pred.q10], q90: [...pred.q90] },
    validation: finite(backtest(req.model, params, trainTarget, trainRefs, req.powerCurve, refsOut.cols[0].length)),
    explanation: { ...explanation, params: finite(explanation.params), diagnostics: finite(explanation.diagnostics) },
    energy,
    scatter: scatter(trainTarget, trainRefs, model, explanation.diagnostics.lag_min ?? 0),
    engine: { id: 'ts', version: __WINDGAP_VERSION__, ms: performance.now() - started },
  }
}

/** Training pairs as the model sees them: target(t) against the first reference at t − τ, evenly thinned; fit line =
 * in-sample prediction per 1 m/s bin of that shifted reference. */
function scatter(target: Float64Array, refs: Frame, model: WindModel, lagMin: number): AnalyzeResponse['scatter'] {
  const lag = Math.round(lagMin / 10)
  const shifted = refs.cols[0].map((_, i) => refs.cols[0][i - lag] ?? NaN)
  const [ref, tgt] = pairs(shifted, target)
  const k = Math.min(ref.length, MAX_SCATTER)
  const shown = Array.from({ length: k }, (_, i) => Math.floor((i * ref.length) / k))
  const [lineRef, linePred] = pairs(shifted, model.predict(refs).mean)
  const bins = new Map<number, [number, number, number]>()
  lineRef.forEach((r, i) => {
    const b = bins.get(Math.floor(r)) ?? [0, 0, 0]
    bins.set(Math.floor(r), [b[0] + r, b[1] + linePred[i], b[2] + 1])
  })
  return {
    ref: shown.map((i) => ref[i]),
    target: shown.map((i) => tgt[i]),
    fitLine: [...bins.keys()].sort((a, b) => a - b).map((key) => {
      const [r, p, n] = bins.get(key)!
      return [r / n, p / n]
    }),
  }
}

/** A metric that cannot be computed is absent, never NaN. */
const finite = (d: Record<string, number>) => Object.fromEntries(Object.entries(d).filter(([, v]) => Number.isFinite(v)))

export const tsEngine: Engine = {
  id: 'ts',
  init: async (onProgress) => onProgress?.('TypeScript engine ready', 100),
  listModels: async () => info(),
  analyze: async (req) => analyze(req),
}
