// Power curves of the turbine types the challenge farms likely use; source and gaps in data/power_curves/*.csv.
import enercon from '../../../data/power_curves/enercon_e40_6.44.csv?raw'
import vestas from '../../../data/power_curves/vestas_v47.csv?raw'
import { parsePowerCurveCsv } from './powerCurve'

export const KNOWN_CURVES = [
  { name: 'Vestas V47', curve: parsePowerCurveCsv(vestas) },
  { name: 'Enercon E-40/6.44', curve: parsePowerCurveCsv(enercon) },
]
