// windgap inside Pyodide must answer like native windgap (wasm float math differs in the last bits). Needs `make wheel pyodide`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { expectClose, goldenCases } from '@/test/golden'

const pub = new URL('../../../public/', import.meta.url)
let handle: (json: string) => string

beforeAll(async () => {
  const { loadPyodide } = await import(fileURLToPath(new URL('pyodide/pyodide.mjs', pub)))
  const py = await loadPyodide({ indexURL: fileURLToPath(new URL('pyodide/', pub)) })
  await py.loadPackage(['numpy', 'pandas'], { messageCallback: () => {} })
  py.unpackArchive(new Uint8Array(readFileSync(new URL('py/windgap.whl', pub))), 'wheel')
  handle = py.pyimport('windgap.engine').handle
}, 60_000)

describe.each(goldenCases)('py engine $name', ({ golden }) => {
  it('matches native windgap', () => {
    const { engine, ...response } = JSON.parse(handle(JSON.stringify(golden.request)))
    expect(engine.id).toBe('py')
    expectClose(response, golden.response, 1e-12)
  })
})
