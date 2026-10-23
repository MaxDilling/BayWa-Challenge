// Words for the engine's numbers: validation keys, the backtest verdict and the energy headline, shared by Method, Results and Export.
import { fmtAmount, fmtDuration, fmtNum, fmtPct } from '@/components/format'
import type { Dataset } from '@/data'
import type { AnalyzeResponse } from '@/engine'

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
