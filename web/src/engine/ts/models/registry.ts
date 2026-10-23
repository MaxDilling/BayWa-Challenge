// windgap/models/registry.py: the ported subset, under the same names.
import type { WindModel } from './base'
import { Identity } from './identity'
import { LinearRegression, VarianceRatio } from './linear'

type Params = Record<string, number | string>

const lagMax = (p: Params) => (p.lag_max_min === undefined ? undefined : Number(p.lag_max_min))

const MODELS: Record<string, (p: Params) => WindModel> = {
  identity: () => new Identity(),
  linear_regression: (p) => new LinearRegression(lagMax(p)),
  variance_ratio: (p) => new VarianceRatio(lagMax(p)),
}

export const names = () => Object.keys(MODELS).sort()

export function create(name: string, params: Params = {}): WindModel {
  if (!(name in MODELS)) throw new Error(`unknown model '${name}', known: ${names().join(', ')}`)
  return MODELS[name](params)
}
