import type { Engine, EngineId } from './contract'
import { fixtureEngine } from './fixture'

export type * from './contract'
export { demoCase } from './fixture'

export interface EngineHandle {
  engine: Engine
  /** Set when the requested engine failed to start and the ts engine took over (ADR-4). */
  fallback?: string
}

/** ?engine=py|ts, else py. The single-file build has no py engine. */
export function requestedEngine(): EngineId {
  if (import.meta.env.MODE === 'single') return 'ts'
  return new URLSearchParams(location.search).get('engine') === 'ts' ? 'ts' : 'py'
}

let py: Promise<Engine> | undefined

export async function createEngine(
  id: EngineId = requestedEngine(),
  onProgress?: (msg: string, pct: number) => void,
): Promise<EngineHandle> {
  if (id === 'py' && import.meta.env.MODE !== 'single') {
    try {
      py ??= import('./py/pyEngine').then(async ({ createPyEngine }) => {
        const engine = createPyEngine()
        await engine.init(onProgress)
        return engine
      })
      return { engine: await py }
    } catch (e) {
      await fixtureEngine.init(onProgress)
      return { engine: fixtureEngine, fallback: `Python engine unavailable: ${e instanceof Error ? e.message : e}` }
    }
  }
  await fixtureEngine.init(onProgress)
  return { engine: fixtureEngine }
}
