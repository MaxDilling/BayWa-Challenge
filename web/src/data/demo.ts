// Synthetic October 2026 data from `make demo` (harness/demo.py); the GUI takes them as if dropped together.
import powerCurve from '../../../data/synthetic/demo_power_curve.csv?raw'
import reference from '../../../data/synthetic/demo_reference.csv?raw'
import target from '../../../data/synthetic/demo_target.csv?raw'

export const DEMO_FILES = [
  { name: 'demo_target.csv', text: target },
  { name: 'demo_reference.csv', text: reference },
  { name: 'demo_power_curve.csv', text: powerCurve },
]
