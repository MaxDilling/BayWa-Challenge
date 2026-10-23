// Fills public/pyodide/ so the py engine runs without a CDN: Pyodide core from node_modules, plus the wheels
// of PACKAGES and their dependencies (checked against the lock's sha256). Keep PACKAGES = windgap's dependencies.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const PACKAGES = ['numpy', 'pandas']
const CORE = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']

const src = new URL('../node_modules/pyodide/', import.meta.url)
const out = new URL('../public/pyodide/', import.meta.url)
const { version } = JSON.parse(readFileSync(new URL('package.json', src)))
const lock = JSON.parse(readFileSync(new URL('pyodide-lock.json', src))).packages

mkdirSync(out, { recursive: true })
for (const file of CORE) copyFileSync(new URL(file, src), new URL(file, out))

const needed = new Set()
const visit = (name) => needed.has(name) || (needed.add(name), lock[name].depends.forEach(visit))
PACKAGES.forEach(visit)

for (const name of needed) {
  const { file_name, sha256 } = lock[name]
  const target = new URL(file_name, out)
  if (existsSync(target)) continue
  const res = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/${file_name}`)
  if (!res.ok) throw new Error(`${file_name}: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`${file_name}: sha256 mismatch`)
  writeFileSync(target, bytes)
  console.log(`fetched ${file_name}`)
}
console.log(`pyodide ${version}: core + ${[...needed].sort().join(', ')}`)
