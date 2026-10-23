// windgap/core/powercurve.py + energy.py
import type { AnalyzeRequest } from '../contract'
import { STEP_H } from './frame'
import type { Prediction } from './models/base'

export type PowerCurve = AnalyzeRequest['powerCurve']

// numpy.polynomial.hermite_e.hermegauss(20), weights divided by sqrt(2π)
const NODES = [-7.619048541679758, -6.510590157013654, -5.5787388058932015, -4.734581334046055, -3.9439673506573163, -3.1890148165533896, -2.458663611172368, -1.7452473208141268, -1.042945348802751, -0.346964157081356, 0.346964157081356, 1.042945348802751, 1.7452473208141268, 2.458663611172368, 3.1890148165533896, 3.9439673506573163, 4.734581334046055, 5.5787388058932015, 6.510590157013654, 7.619048541679758]
const WEIGHTS = [1.2578006724379264e-13, 2.4820623623151797e-10, 6.127490259982928e-8, 4.4021210902308646e-6, 0.00012882627996192942, 0.0018301031310804924, 0.013997837447100996, 0.06150637206397696, 0.16173933398400003, 0.2607930634495548, 0.2607930634495548, 0.16173933398400003, 0.06150637206397696, 0.013997837447100996, 0.0018301031310804924, 0.00012882627996192942, 4.4021210902308646e-6, 6.127490259982928e-8, 2.4820623623151797e-10, 1.2578006724379264e-13]

/** np.interp with left = right = 0 (cut-out), times nTurbines. NaN stays NaN. */
export function parkPowerKw(curve: PowerCurve, v: number): number {
  const { windMs: x, powerKw: y } = curve
  if (Number.isNaN(v)) return NaN
  if (v < x[0] || v > x[x.length - 1]) return 0
  if (v === x[x.length - 1]) return y[y.length - 1] * curve.nTurbines
  let j = 0
  while (v >= x[j + 1]) j++
  return (((y[j + 1] - y[j]) / (x[j + 1] - x[j])) * (v - x[j]) + y[j]) * curve.nTurbines
}

export interface Power {
  pMeanKw: Float64Array
  pQ10Kw: Float64Array
  pQ90Kw: Float64Array
}

/** pMeanKw = E[P(v)] with v ~ N(mean, std²) via Gauss-Hermite quadrature, not P(mean). */
export function expectedPower(pred: Prediction, curve: PowerCurve): Power {
  return {
    pMeanKw: pred.mean.map((m, i) =>
      NODES.reduce((acc, node, k) => acc + parkPowerKw(curve, m + pred.std[i] * node) * WEIGHTS[k], 0),
    ),
    pQ10Kw: pred.q10.map((v) => parkPowerKw(curve, v)),
    pQ90Kw: pred.q90.map((v) => parkPowerKw(curve, v)),
  }
}

/** Whole prediction window = the outage. P10/P90 sum the per-step quantiles (fully correlated errors). */
export function energyLoss(power: Power) {
  const kwh = (p: Float64Array) => p.reduce((s, x) => s + x * STEP_H, 0)
  let acc = 0
  return {
    kwhP10: kwh(power.pQ10Kw),
    kwhP50: kwh(power.pMeanKw),
    kwhP90: kwh(power.pQ90Kw),
    cumulativeKwh: Array.from(power.pMeanKw, (p) => (acc += p * STEP_H)),
  }
}
