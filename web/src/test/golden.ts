import { readdirSync, readFileSync } from 'node:fs'
import type { GoldenCase, ModelInfo } from '@/engine/contract'

const root = new URL('../../../fixtures/golden/', import.meta.url)

export const goldenCases = readdirSync(root).flatMap((model) =>
  readdirSync(new URL(`${model}/`, root)).map((file) => ({
    name: `${model}/${file}`,
    golden: JSON.parse(readFileSync(new URL(`${model}/${file}`, root), 'utf8')) as GoldenCase,
  })),
)

export const goldenModels = JSON.parse(readFileSync(new URL('../models.json', root), 'utf8')) as ModelInfo[]

/** Deep equality with a relative tolerance on numbers; reports the path of the first mismatch. */
export function expectClose(actual: unknown, expected: unknown, rel: number, path = 'response'): void {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > rel * Math.max(1, Math.abs(expected)))
      throw new Error(`${path}: ${actual} != ${expected}`)
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`${path}: length differs`)
    expected.forEach((e, i) => expectClose(actual[i], e, rel, `${path}[${i}]`))
  } else if (expected && typeof expected === 'object') {
    const a = actual as Record<string, unknown>
    const keys = Object.keys(expected).sort()
    if (!a || JSON.stringify(Object.keys(a).sort()) !== JSON.stringify(keys)) throw new Error(`${path}: keys differ`)
    keys.forEach((k) => expectClose(a[k], (expected as Record<string, unknown>)[k], rel, `${path}.${k}`))
  } else if (actual !== expected) throw new Error(`${path}: ${actual} != ${expected}`)
}
