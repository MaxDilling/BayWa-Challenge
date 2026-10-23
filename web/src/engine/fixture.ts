// Stand-in until the ts engine runs identity: answers every request with a golden fixture.
import basic from '../../../fixtures/golden/identity/basic.json'
import type { AnalyzeResponse, Engine, GoldenCase } from './contract'

export const demoCase = basic as unknown as GoldenCase // JSON imports widen tuples and literals

export const fixtureEngine: Engine = {
  id: 'ts',
  init: async (onProgress) => onProgress?.('ready', 100),
  listModels: async () => [{ name: 'identity' }],
  analyze: async (): Promise<AnalyzeResponse> => ({
    ...demoCase.response,
    engine: { id: 'ts', version: 'fixture', ms: 0 },
  }),
}
