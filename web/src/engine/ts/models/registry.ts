// windgap/models/registry.py: the ported subset, under the same names.
import type { ModelInfo } from '../../contract'
import type { WindModel } from './base'
import { Identity } from './identity'
import { LinearRegression, VarianceRatio } from './linear'

type Params = Record<string, number | string>

const lagMax = (p: Params) => (p.lag_max_min === undefined ? undefined : Number(p.lag_max_min))

const MODELS: Record<string, { label: string; tagline: string; create: (p: Params) => WindModel }> = {
  identity: {
    label: 'Reference as is (baseline)',
    tagline: 'Takes the reference wind unchanged; every other method must beat it.',
    create: () => new Identity(),
  },
  linear_regression: {
    label: 'Linear regression (MCP)',
    tagline: 'Least-squares line through the reference wind, shifted by the delay between the farms.',
    create: (p) => new LinearRegression(lagMax(p)),
  },
  variance_ratio: {
    label: 'Variance ratio (MCP)',
    tagline: "Line that keeps the target's mean and spread, shifted by the delay between the farms.",
    create: (p) => new VarianceRatio(lagMax(p)),
  },
}

const RECOMMENDED = 'linear_regression'

export const names = () => Object.keys(MODELS).sort()

export const info = (): ModelInfo[] =>
  names().map((name) => ({ name, label: MODELS[name].label, tagline: MODELS[name].tagline, recommended: name === RECOMMENDED }))

export function create(name: string, params: Params = {}): WindModel {
  if (!(name in MODELS)) throw new Error(`unknown model '${name}', known: ${names().join(', ')}`)
  return MODELS[name].create(params)
}
