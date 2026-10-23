// windgap/models/registry.py: the ported subset, under the same names.
import type { WindModel } from './base'
import { Identity } from './identity'

type Params = Record<string, number | string>

const MODELS: Record<string, (p: Params) => WindModel> = {
  identity: (p) => new Identity(p.sigma === undefined ? undefined : Number(p.sigma)),
}

export const names = () => Object.keys(MODELS).sort()

export function create(name: string, params: Params = {}): WindModel {
  if (!(name in MODELS)) throw new Error(`unknown model '${name}', known: ${names().join(', ')}`)
  return MODELS[name](params)
}
