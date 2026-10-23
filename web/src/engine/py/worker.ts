/// <reference lib="webworker" />
// Runs windgap in Pyodide off the main thread. Files come from public/ (no CDN), base URL from the page.
import type { PyodideAPI } from 'pyodide'

export type Request = { id: number; method: 'init' | 'listModels' | 'analyze'; arg: string }
export type Reply = { id: number; progress: [string, number] } | { id: number; result: string } | { id: number; error: string }

let py: PyodideAPI

const methods = {
  async init(base: string, progress: (msg: string, pct: number) => void) {
    progress('Loading Python runtime', 5)
    const { loadPyodide } = await import(/* @vite-ignore */ `${base}pyodide/pyodide.mjs`)
    py = await loadPyodide({ indexURL: `${base}pyodide/` })
    progress('Loading numpy and pandas', 40)
    await py.loadPackage(['numpy', 'pandas'], { messageCallback: () => {} })
    progress('Loading windgap', 70)
    const wheel = await fetch(`${base}py/windgap.whl`)
    if (!wheel.ok) throw new Error(`windgap.whl: HTTP ${wheel.status}`)
    py.unpackArchive(await wheel.arrayBuffer(), 'wheel')
    py.pyimport('windgap.engine')
    progress('Python engine ready', 100)
    return ''
  },
  listModels: async () => py.pyimport('windgap.engine').list_models() as string,
  analyze: async (json: string) => py.pyimport('windgap.engine').handle(json) as string,
}

self.onmessage = async ({ data: { id, method, arg } }: MessageEvent<Request>) => {
  const post = (reply: Reply) => self.postMessage(reply)
  try {
    post({ id, result: await methods[method](arg, (msg, pct) => post({ id, progress: [msg, pct] })) })
  } catch (e) {
    post({ id, error: e instanceof Error ? e.message : String(e) })
  }
}
