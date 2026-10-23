import { describe, it } from 'vitest'
import { expectClose, goldenCases } from '@/test/golden'
import { names } from './models/registry'
import { analyze } from './tsEngine'

const ported = goldenCases.filter(({ golden }) => names().includes(golden.request.model))

describe.each(ported)('ts engine $name', ({ golden }) => {
  it('matches windgap within 1e-6', () => {
    const { engine: _, ...response } = analyze(golden.request)
    expectClose(response, golden.response, 1e-6)
  })
})
