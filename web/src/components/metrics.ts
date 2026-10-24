// Words for the engine's numbers: validation keys, parameters, references, the backtest verdict and the energy headline,
// shared by Method, Results, Export and the report.
import { fmtAmount, fmtDuration, fmtNum, fmtPct } from '@/components/format'
import type { Dataset, Span, WindSeries } from '@/data'
import type { AnalyzeResponse } from '@/engine'

type Explanation = AnalyzeResponse['explanation']

export interface MetricInfo {
  key: string
  label: string
  format: (v: number) => string
  hint: string
}

export const METRICS: Record<string, MetricInfo> = {
  energy_wape_pct: {
    key: 'energy_wape_pct',
    label: 'Energy error',
    format: (v) => `${fmtNum(v, 1)} %`,
    hint: 'How far the lost-energy estimate missed the measured energy: the absolute errors of all simulated outages summed, divided by their summed measured energy. Calm outages with almost no energy cannot inflate it.',
  },
  wind_rmse: {
    key: 'wind_rmse',
    label: 'Wind RMSE',
    format: (v) => `${fmtNum(v, 2)} m/s`,
    hint: 'Typical error of the 10-minute wind speed (root mean square, so large errors count more).',
  },
  wind_mae: { key: 'wind_mae', label: 'Wind MAE', format: (v) => `${fmtNum(v, 2)} m/s`, hint: 'Average absolute error of the 10-minute wind speed.' },
  power_rmse: {
    key: 'power_rmse',
    label: 'Power RMSE',
    format: (v) => `${fmtAmount(v)} kW`,
    hint: 'Typical error of the farm power per 10 minutes, after the power curve (root mean square).',
  },
  coverage_80: {
    key: 'coverage_80',
    label: '80 % band coverage',
    format: (v) => fmtPct(v, 0),
    hint: 'Share of measured wind values inside the 80 % band. Ideally 80 %: lower means the band is too narrow, higher too wide.',
  },
  bias: {
    key: 'bias',
    label: 'Bias',
    format: (v) => `${v > 0 ? '+' : ''}${fmtNum(v, 2)} m/s`,
    hint: 'Average wind error with its sign. Unlike random errors, a bias does not cancel out over an outage, so it drives the energy sum.',
  },
}

/** The accuracy figures of Results and the report, in this order. */
export const ACCURACY = ['energy_wape_pct', 'wind_rmse', 'wind_mae', 'power_rmse', 'coverage_80', 'bias'].map((key) => METRICS[key])

/** Plain names, units and explanations for the keys of `params` and `diagnostics`; other keys are shown as they come. */
export const KEYS: Record<string, { label: string; unit?: string; digits: number; hint: string }> = {
  a: { label: 'Intercept a', unit: 'm/s', digits: 2, hint: 'Where the line starts: the predicted target wind when the reference is calm.' },
  b: { label: 'Slope b', digits: 3, hint: 'How much the target wind changes per 1 m/s of reference wind.' },
  r: { label: 'Correlation r', digits: 3, hint: 'How closely target and reference move together before the outage; 1 is perfect, below 0.7 is weak.' },
  lag_min: {
    label: 'Delay τ',
    unit: 'min',
    digits: 0,
    hint: 'How long the weather takes from one farm to the other. The model reads the reference this much earlier (later if negative).',
  },
  n_train: { label: 'Training values', unit: '× 10 min', digits: 0, hint: '10-minute values before the outage where both farms measured.' },
  sigma_0: {
    label: 'Uncertainty in calm wind',
    unit: 'm/s',
    digits: 2,
    hint: 'Width σ of the uncertainty at 0 m/s, measured on training data the model had not seen. The 80 % band is ±1.28 σ.',
  },
  sigma_slope: {
    label: 'Uncertainty growth',
    unit: 'm/s per m/s',
    digits: 3,
    hint: 'How much σ grows per 1 m/s of predicted wind: errors are larger in strong wind.',
  },
  error_memory_h: {
    label: 'How long errors persist',
    unit: 'h',
    digits: 1,
    hint: 'If the model is too high now, it tends to stay too high for about this long. The longer, the less errors cancel over an outage and the wider the energy range.',
  },
}

/** A parameter or diagnostic with its unit, or as it comes for keys without a name. */
export const keyValue = (key: string, value: number) => `${fmtNum(value, KEYS[key]?.digits ?? 3)}${KEYS[key]?.unit ? ` ${KEYS[key].unit}` : ''}`

/** What the model made of each reference: weight and delay (multi_regression), chosen by r, or the only one. */
export function referenceRoles(references: WindSeries[], { params: p, diagnostics: d }: Explanation) {
  return references.map((ref, i) => {
    const r = d[`r_ref_${i}`] === undefined ? 'r n/a' : `r = ${fmtNum(d[`r_ref_${i}`], 3)}`
    if (`b_ref_${i}` in p) {
      const used = p[`b_ref_${i}`] > 0
      return { id: ref.id, used, role: used ? `weight b = ${fmtNum(p[`b_ref_${i}`], 3)}, delay τ = ${fmtNum(d[`lag_min_ref_${i}`])} min` : 'weight 0, not used' }
    }
    if (d.reference_index === undefined) return { id: ref.id, used: true, role: 'used' }
    const used = i === d.reference_index
    return { id: ref.id, used, role: used ? `chosen, ${r}` : `not used, ${r}` }
  })
}

/** "the neighbouring reference farm H1. It was chosen from …": the references the prediction rests on, without the final full stop. */
export function referenceText(references: WindSeries[], explanation: Explanation) {
  const roles = referenceRoles(references, explanation)
  const used = roles.filter((x) => x.used)
  const others = roles.filter((x) => !x.used).map((x) => x.id)
  if ('b_ref_0' in explanation.params)
    return `the reference farm${used.length > 1 ? 's' : ''} ${used.map((x) => `${x.id} (${x.role})`).join(', ')}, weighted by least squares${others.length ? `; ${others.join(', ')} got weight 0` : ''}`
  if (!others.length) return `the neighbouring reference farm ${used[0].id}`
  const d = explanation.diagnostics
  return `the neighbouring reference farm ${used[0].id} ${'.'} It was chosen from ${roles.length} farms because it tracked the target best before the outage (r = ${fmtNum(d[`r_ref_${d.reference_index}`], 3)}); not used: ${others.join(', ')}`
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compass = (deg: number) => `${COMPASS[Math.round(deg / 22.5) % 16]} ${fmtNum(deg)}°`

/** The factor per wind direction sector (multi_regression): what the references cannot see, such as a neighbour's wake. */
export function wakeSectors({ params, diagnostics }: Explanation) {
  return Object.keys(params)
    .filter((k) => k.startsWith('wake_factor_'))
    .map((k) => {
      const deg = k.slice('wake_factor_'.length)
      return { deg: Number(deg), factor: params[k], steps: diagnostics[`wake_steps_${deg}`] }
    })
    .sort((a, b) => a.deg - b.deg)
}

/** The wake factors in plain words, led by the strongest sector. */
export function wakeText(sectors: ReturnType<typeof wakeSectors>) {
  const strongest = sectors.reduce((a, b) => (Math.abs(b.factor - 1) > Math.abs(a.factor - 1) ? b : a))
  const change = strongest.factor - 1
  return (
    'From each direction, the target gets this much more or less wind than its references suggest; the model multiplies its prediction ' +
    `by that factor. Strongest: with wind from ${compass(strongest.deg)} the target measures ${fmtNum(Math.abs(change) * 100, 1)} % ` +
    `${change < 0 ? 'less' : 'more'} (${fmtNum(strongest.steps)} values before the outage)` +
    `${change < 0 ? ', typical for the wake of a neighbouring turbine or terrain in that direction' : ''}. Directions with few values ` +
    'are pulled towards 0 %.'
  )
}

/** Days of target data before the outage that the model could learn from. */
export const trainingDays = ({ target }: Dataset, outage: Span) => (outage.startMs - target.grid.t0) / 86_400_000

/** "Wind Outage Tool, windgap 0.4.0 (TypeScript engine)" */
export const toolText = ({ engine }: AnalyzeResponse) =>
  `Wind Outage Tool, windgap ${engine.version} (${engine.id === 'py' ? 'Python' : 'TypeScript'} engine)`

/** One plain sentence about the backtest, built from the validation numbers only. */
export function verdict(v: Record<string, number>, outageMs: number): string | undefined {
  if (!v.n_folds) return undefined
  const folds = fmtNum(v.n_folds)
  const parts = [
    v.energy_wape_pct !== undefined && `the energy estimate was off by ${fmtNum(v.energy_wape_pct, 0)} % overall`,
    v.coverage_80 !== undefined && `the 80 % band held ${fmtPct(v.coverage_80, 0)} of the measured wind values`,
    v.energy_coverage_80 !== undefined &&
      `the energy range contained the measured energy in ${fmtNum(v.energy_coverage_80 * v.n_folds)} of ${folds}`,
  ].filter(Boolean)
  if (!parts.length) return undefined
  return `In ${folds} simulated ${fmtDuration(outageMs)} outages on your data, ${parts.join('; ')}.`
}

/** How the energy range is made, in one sentence for insurers (SPEC.md S4). */
export const BAND_HINT =
  'The range assumes that the model’s errors persist as long as they did in the backtest on your data: over a short outage they add up almost fully, over a long one they partly cancel.'

/** The farm the energy is for: "4 turbines × 3,000 kW". */
export const farmText = ({ nTurbines, powerCurve }: Dataset) =>
  `${fmtNum(nTurbines)} turbine${nTurbines === 1 ? '' : 's'} × ${fmtAmount(Math.max(...powerCurve.powerKw))} kW`

/** "with 80 % probability between 13.1 and 20.9 kWh" */
export const rangeText = ({ kwhP10, kwhP90 }: AnalyzeResponse['energy']) =>
  `with 80 % probability between ${fmtAmount(kwhP10)} and ${fmtAmount(kwhP90)} kWh`

/** The lost energy in one sentence for insurers. */
export const headline = (energy: AnalyzeResponse['energy']) => `Most likely ${fmtAmount(energy.kwhP50)} kWh; ${rangeText(energy)}.`
