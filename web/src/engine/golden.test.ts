import { describe, expect, it } from 'vitest'
import { goldenCases } from '@/test/golden'

describe.each(goldenCases)('$name', ({ golden }) => {
  it('predicts every step of the outage', () => {
    const { startMs, endMs } = golden.request.outage
    const steps = (endMs - startMs) / 600_000
    expect(golden.response.prediction.t0).toBe(startMs)
    expect(golden.response.prediction.mean).toHaveLength(steps)
    expect(golden.response.energy.cumulativeKwh).toHaveLength(steps)
  })
})
