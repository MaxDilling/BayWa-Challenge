// windgap/engine.py, ported for the models in ./models/registry.ts.
import type { AnalyzeRequest, AnalyzeResponse, Engine, Grid } from '../contract'
import { backtest, MIN_TRAIN_STEPS, outside, predictWindow } from './backtest'
import { airDensity, energyLoss, expectedPower, RHO_CURVE, targetDensity } from './energy'
import { align, pairs, rows, STEP_MS, type Frame } from './frame'
import type { WindModel } from './models/base'
import { create, info } from './models/registry'

const MAX_SCATTER = 2000

export function analyze(req: AnalyzeRequest): AnalyzeResponse {
  const started = performance.now()
  const all = align([req.target, ...req.references.map((r) => r.grid)])
  const [target] = all.cols
  const refs: Frame = { t0: all.t0, cols: all.cols.slice(1) }
  const extra = directions(req, all)
  const { startMs, endMs } = req.outage
  const start = (startMs - all.t0) / STEP_MS
  const end = start + (endMs - startMs) / STEP_MS
  const refsOut = rows(refs, start, end)
  if (refsOut.cols.some((c) => c.some(Number.isNaN)))
    throw new Error('references must be complete during the outage; gap filling belongs to the import step')

  const params = req.params ?? {}
  const known = outside(target, start, end)
  const nTrain = known.filter((v) => !Number.isNaN(v)).length
  if (nTrain < MIN_TRAIN_STEPS)
    throw new Error(`The target has ${nTrain} values outside the outage; at least ${MIN_TRAIN_STEPS} (one day) are needed to learn from.`)
  const model = create(req.model, params).fit(known, refs, extra)
  const pred = predictWindow(model, refs, start, end, extra)
  const density = densityAt(req, all, start, end)
  const energy = energyLoss(expectedPower(pred, req.powerCurve, density?.kgM3.map((r) => (r / RHO_CURVE) ** (1 / 3))), model.errors.acf)
  const explanation = model.explain()

  return {
    prediction: { t0: startMs, stepS: 600, mean: [...pred.mean], q10: [...pred.q10], q90: [...pred.q90] },
    validation: finite(backtest(req.model, params, known, refs, req.powerCurve, start, end - start, extra)),
    explanation: { ...explanation, params: finite(explanation.params), diagnostics: finite(explanation.diagnostics) },
    energy: {
      ...energy,
      ...(density && {
        airDensity: {
          kgM3: density.kgM3.reduce((s, r) => s + r, 0) / density.kgM3.length,
          ratio: density.ratio,
          kwhP50AtCurveDensity: energyLoss(expectedPower(pred, req.powerCurve), model.errors.acf).kwhP50,
        },
      }),
    },
    scatter: scatter(known, refs, extra, model, explanation.diagnostics),
    engine: { id: 'ts', version: __WINDGAP_VERSION__, ms: performance.now() - started },
  }
}

/** A grid on the frame's rows, NaN where it has no value. */
const column = (frame: Frame, g?: Grid) =>
  Float64Array.from({ length: frame.cols[0].length }, (_, i) => g?.values[(frame.t0 - g.t0) / STEP_MS + i] ?? NaN)

/** windgap.core.grid.directions: each reference's wind direction on the frame's grid, NaN where unknown; undefined
 * when no reference has a direction. */
function directions(req: AnalyzeRequest, frame: Frame): Frame | undefined {
  if (!req.references.some((r) => r.direction)) return undefined
  return { t0: frame.t0, cols: req.references.map((r) => column(frame, r.direction)) }
}

/** windgap.engine._density: air density at the target in the outage (S4). */
function densityAt(req: AnalyzeRequest, frame: Frame, start: number, end: number) {
  const rho = (temperature: Grid, pressure: Grid) => {
    const [t, p] = [column(frame, temperature), column(frame, pressure)]
    return t.map((v, i) => airDensity(v, p[i]))
  }
  if (!req.targetTemperature || !req.targetPressure) return undefined
  const refs = req.references.flatMap((r) => (r.temperature && r.pressure ? [rho(r.temperature, r.pressure)] : []))
  return refs.length ? targetDensity(rho(req.targetTemperature, req.targetPressure), refs, start, end) : undefined
}

/** Training pairs as the model sees them: target(t) against the chosen reference at t − τ, evenly thinned; fit line =
 * in-sample prediction per 1 m/s bin of that shifted reference. */
function scatter(target: Float64Array, refs: Frame, extra: Frame | undefined, model: WindModel, diagnostics: Record<string, number>): AnalyzeResponse['scatter'] {
  const lag = Math.round((diagnostics.lag_min ?? 0) / 10)
  const chosen = refs.cols[diagnostics.reference_index ?? 0]
  const shifted = chosen.map((_, i) => chosen[i - lag] ?? NaN)
  const [ref, tgt] = pairs(shifted, target)
  const k = Math.min(ref.length, MAX_SCATTER)
  const shown = Array.from({ length: k }, (_, i) => Math.floor((i * ref.length) / k))
  const [lineRef, linePred] = pairs(shifted, model.predict(refs, extra).mean)
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
