// Synthetic October 2026 data from `make demo` (harness/demo.py), read through the same import path as uploads.
import powerCurve from '../../../data/synthetic/demo_power_curve.csv?raw'
import reference from '../../../data/synthetic/demo_reference.csv?raw'
import target from '../../../data/synthetic/demo_target.csv?raw'
import { buildDataset } from './dataset'
import { parsePowerCurveCsv } from './powerCurve'
import { parseWindCsv } from './wind'

export const loadDemo = () =>
  buildDataset(parseWindCsv('demo_target', target), [parseWindCsv('demo_reference', reference)], parsePowerCurveCsv(powerCurve), 4)
