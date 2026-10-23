import type { Engine, EngineId } from './contract'
import { tsEngine } from './ts/tsEngine'

export type * from './contract'

export interface EngineHandle {
  engine: Engine
  /** Set when the py engine failed to start and the ts engine took over (ADR-4). */
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
      await tsEngine.init(onProgress)
      return { engine: tsEngine, fallback: `Python engine unavailable: ${e instanceof Error ? e.message : e}` }
    }
  }
  await tsEngine.init(onProgress)
  return { engine: tsEngine }
}
