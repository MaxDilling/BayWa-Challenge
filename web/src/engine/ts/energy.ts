// windgap/core/powercurve.py + energy.py
import type { AnalyzeRequest } from '../contract'
import { STEP_H } from './frame'
import { Z90, type Prediction } from './models/base'

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
  pStdKw: Float64Array
}

/** pMeanKw = E[P(v)] and pStdKw = SD[P(v)] with v ~ N(mean, std²) via Gauss-Hermite quadrature; not P(mean). */
export function expectedPower(pred: Prediction, curve: PowerCurve): Power {
  const n = pred.mean.length
  const pMeanKw = new Float64Array(n)
  const pStdKw = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let m1 = 0
    let m2 = 0
    NODES.forEach((node, k) => {
      const p = parkPowerKw(curve, pred.mean[i] + pred.std[i] * node)
      m1 += p * WEIGHTS[k]
      m2 += p * p * WEIGHTS[k]
    })
    pMeanKw[i] = m1
    pStdKw[i] = Math.sqrt(Math.max(m2 - m1 * m1, 0))
  }
  return { pMeanKw, pStdKw }
}

/** Whole prediction window = the outage. P50 ± Z90 · SD of the sum, power errors k steps apart correlated by acf[k]. */
export function energyLoss(power: Power, acf: number[]) {
  const s = power.pStdKw.map((p) => p * STEP_H)
  let variance = 0
  for (let k = 0; k < Math.min(acf.length, s.length); k++) {
    let d = 0
    for (let i = 0; i + k < s.length; i++) d += s[i] * s[i + k]
    variance += (k ? 2 : 1) * acf[k] * d
  }
  const half = Z90 * Math.sqrt(variance)
  let acc = 0
  const cumulativeKwh = Array.from(power.pMeanKw, (p) => (acc += p * STEP_H))
  const kwhP50 = power.pMeanKw.reduce((sum, p) => sum + p * STEP_H, 0)
  return { kwhP10: Math.max(kwhP50 - half, 0), kwhP50, kwhP90: kwhP50 + half, cumulativeKwh }
}
