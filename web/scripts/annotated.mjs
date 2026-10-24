// The screenshots the team changed after they were taken (drawn on, cropped, or saved next to them), per version.
// Usage: node web/scripts/annotated.mjs [v<n>]. Reads screenshots/v<n>/taken.json from screenshots.mjs.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '../../screenshots')
const versions = process.argv[2] ? [process.argv[2]] : readdirSync(shots).filter((d) => /^v\d+$/.test(d)).sort((a, b) => a.slice(1) - b.slice(1))

for (const version of versions) {
  const dir = join(shots, version)
  if (!existsSync(join(dir, 'taken.json'))) throw new Error(`${dir} has no taken.json; was it written by screenshots.mjs?`)
  const { taken, sha256 } = JSON.parse(readFileSync(join(dir, 'taken.json'), 'utf8'))
  const changed = readdirSync(dir)
    .filter((f) => f !== 'taken.json' && !f.startsWith('.'))
    .filter((f) => sha256[f] !== createHash('sha256').update(readFileSync(join(dir, f))).digest('hex'))
    .map((f) => ({ f, at: statSync(join(dir, f)).mtime }))
    .sort((a, b) => a.at - b.at)
  const gone = Object.keys(sha256).filter((f) => !existsSync(join(dir, f)))
  console.log(`${version} (taken ${new Date(taken).toLocaleString('de-DE')}): ${changed.length ? '' : 'nothing changed'}`)
  for (const { f, at } of changed) console.log(`  ${at.toLocaleString('de-DE')}  ${f}${f in sha256 ? '' : ' (new)'}`)
  for (const f of gone) console.log(`  deleted  ${f}`)
}
