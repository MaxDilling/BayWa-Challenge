import type { Engine } from '../contract'
import type { Reply, Request } from './worker'

type Pending = { resolve: (result: string) => void; reject: (e: Error) => void; onProgress?: (msg: string, pct: number) => void }

export function createPyEngine(): Engine {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, Pending>()
  let nextId = 0

  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const call = pending.get(data.id)!
    if ('progress' in data) return call.onProgress?.(...data.progress)
    pending.delete(data.id)
    if ('error' in data) call.reject(new Error(data.error))
    else call.resolve(data.result)
  }
  worker.onerror = (e) => {
    for (const call of pending.values()) call.reject(new Error(e.message || 'Python worker failed to start'))
    pending.clear()
  }

  const call = (method: Request['method'], arg = '', onProgress?: Pending['onProgress']) =>
    new Promise<string>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject, onProgress })
      worker.postMessage({ id, method, arg } satisfies Request)
    })

  return {
    id: 'py',
    init: async (onProgress) => void (await call('init', new URL('./', document.baseURI).href, onProgress)),
    listModels: async () => JSON.parse(await call('listModels')),
    analyze: async (req) => JSON.parse(await call('analyze', JSON.stringify(req))),
  }
}
