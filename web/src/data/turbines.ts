// Power curves of the turbine types the challenge farms likely use; source and gaps in data/power_curves/*.csv.
import enercon from '../../../data/power_curves/enercon_e40_6.44.csv?raw'
import nordex from '../../../data/power_curves/nordex_n149_4.0-4.5.csv?raw'
import vestas from '../../../data/power_curves/vestas_v47.csv?raw'
import { parsePowerCurveCsv, type PowerCurve } from './powerCurve'

export type CurveOption = { name: string; curve: PowerCurve }

const NORDEX = { name: 'Nordex N149/4.0-4.5', curve: parsePowerCurveCsv(nordex) }

/** `sites`: the challenge ids whose type the team assigned (knowledge/turbinen.md). */
export const KNOWN_CURVES: (CurveOption & { sites?: RegExp })[] = [
  { name: 'Vestas V47', curve: parsePowerCurveCsv(vestas) },
  { name: 'Enercon E-40/6.44', curve: parsePowerCurveCsv(enercon), sites: /^O\d/i },
  { ...NORDEX, sites: /^T\d/i },
]

/** The site a file or series belongs to: its first word, "t1" for T1_data and T1_power_curve.xlsx. */
export const site = (name: string) => name.split(/[_\s.-]/)[0].toLowerCase()

/** A target's curve unless the user picks one: the uploaded curve of its site, else the one uploaded curve that belongs to
 * no series (power_curve.csv), else the type the team assigned to its site, else Nordex. */
export function defaultCurve(target: string, uploaded: CurveOption[], series: string[]): CurveOption {
  const generic = uploaded.filter((c) => !series.some((s) => site(s) === site(c.name)))
  return (
    uploaded.find((c) => site(c.name) === site(target)) ??
    (generic.length === 1 ? generic[0] : undefined) ??
    KNOWN_CURVES.find((c) => c.sites?.test(target)) ??
    NORDEX
  )
}
