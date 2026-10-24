// windgap/core/powercurve.py + energy.py
import type { AnalyzeRequest } from '../contract'
import { STEP_H } from './frame'
import { Z90, type Prediction } from './models/base'

export type PowerCurve = AnalyzeRequest['powerCurve']

export const RHO_CURVE = 1.225
const R_DRY_AIR = 287.05
const MIN_DENSITY_STEPS = 144

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

/** kg/m³ of dry air. */
export const airDensity = (temperatureC: number, pressureHpa: number) => (pressureHpa * 100) / (R_DRY_AIR * (temperatureC + 273.15))

/** ρ at the target for rows [start, end) = ratio · the mean density of the references with one at that row; the ratio
 * is the mean of target / reference density over the rows outside where both are known. Undefined (no correction) with
 * fewer than MIN_DENSITY_STEPS such rows or a row inside without any reference density. */
export function targetDensity(target: Float64Array, refs: Float64Array[], start: number, end: number) {
  const ref = target.map((_, t) => {
    const known = refs.filter((c) => !Number.isNaN(c[t]))
    return known.length ? known.reduce((s, c) => s + c[t], 0) / known.length : NaN
  })
  const pairs = [...target.keys()].filter((t) => (t < start || t >= end) && !Number.isNaN(target[t]) && !Number.isNaN(ref[t]))
  const inside = ref.slice(start, end)
  if (pairs.length < MIN_DENSITY_STEPS || inside.some(Number.isNaN)) return undefined
  const ratio = pairs.reduce((s, t) => s + target[t] / ref[t], 0) / pairs.length
  return { kgM3: inside.map((r) => r * ratio), ratio }
}

/** pMeanKw = E[P(f · v)] and pStdKw = SD[P(f · v)] with v ~ N(mean, std²) via Gauss-Hermite quadrature; not P(mean).
 * f = (ρ / RHO_CURVE)^⅓ per row moves the wind to the density of the curve. */
export function expectedPower(pred: Prediction, curve: PowerCurve, windFactor?: Float64Array): Power {
  const n = pred.mean.length
  const pMeanKw = new Float64Array(n)
  const pStdKw = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let m1 = 0
    let m2 = 0
    const f = windFactor?.[i] ?? 1
    NODES.forEach((node, k) => {
      const p = parkPowerKw(curve, f * (pred.mean[i] + pred.std[i] * node))
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
