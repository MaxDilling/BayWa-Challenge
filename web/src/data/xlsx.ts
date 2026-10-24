// Excel workbooks for the import (SPEC.md S1), twin of windgap/core/xlsx.py: every sheet as the text of a table that
// readTable reads like a CSV. Date cells become wall-clock `YYYY-MM-DD HH:MM[:SS]` without a time zone, numbers their
// shortest form, empty cells stay empty (missing); cells are tab-separated.
import { ImportError } from './csv'

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const BUILTIN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

/** Name and text of dropped files; a workbook gives one entry per sheet, named like a file of its own. */
export async function readFiles(files: File[]): Promise<{ name: string; text: string }[]> {
  const read = async (f: File) =>
    /\.xlsx$/i.test(f.name)
      ? (await xlsxTexts(f.name.replace(/\.xlsx$/i, ''), await f.arrayBuffer())).map(([name, text]) => ({ name: `${name}.xlsx`, text }))
      : [{ name: f.name, text: await f.text() }]
  return (await Promise.all(files.map(read))).flat()
}

/** [name, table text] per sheet: the file's name, or <name>_<sheet> when the workbook has several sheets. */
export async function xlsxTexts(name: string, data: ArrayBuffer): Promise<[string, string][]> {
  const sheets = await readXlsx(data)
  return [...sheets].map(([sheet, rows]) => [sheets.size === 1 ? name : `${name}_${sheet}`, rows.map((r) => r.join('\t')).join('\n')])
}

/** Rows of every sheet by sheet name, cells as text. */
export async function readXlsx(data: ArrayBuffer): Promise<Map<string, string[][]>> {
  const files = await unzip(data)
  const xml = (path: string) => {
    const text = files.get(path)
    if (text === undefined) throw new ImportError(`The workbook has no ${path}; is it an .xlsx file?`)
    return text
  }
  const shared = files.has('xl/sharedStrings.xml') ? elements(xml('xl/sharedStrings.xml'), 'si').map((si) => texts(si.body)) : []
  const dates = files.has('xl/styles.xml') ? dateStyles(xml('xl/styles.xml')) : new Set<number>()
  const targets = new Map(elements(xml('xl/_rels/workbook.xml.rels'), 'Relationship').map((r) => [r.attrs.Id, r.attrs.Target]))
  const sheets = new Map<string, string[][]>()
  for (const s of elements(xml('xl/workbook.xml'), 'sheet')) {
    const target = targets.get(s.attrs['r:id'])!.replace(/^\/xl\//, '').replace(/^\//, '')
    sheets.set(decode(s.attrs.name), rows(xml(target.startsWith('xl/') ? target : `xl/${target}`), shared, dates))
  }
  return sheets
}

/** Indices of the cell styles whose number format shows a date or time. */
function dateStyles(styles: string): Set<number> {
  const custom = new Set(
    elements(styles, 'numFmt')
      .filter((f) => /[ymdhs]/i.test(decode(f.attrs.formatCode).replace(/"[^"]*"|\[[^\]]*]|\\./g, '')))
      .map((f) => Number(f.attrs.numFmtId)),
  )
  const xfs = elements(styles, 'cellXfs')[0]
  const ids = xfs ? elements(xfs.body, 'xf').map((xf) => Number(xf.attrs.numFmtId ?? 0)) : []
  return new Set(ids.flatMap((id, i) => (BUILTIN_DATES.has(id) || custom.has(id) ? [i] : [])))
}

function rows(sheet: string, shared: string[], dates: Set<number>): string[][] {
  const out = elements(sheet, 'row').map((row) => {
    const cells = new Map<number, string>()
    for (const c of elements(row.body, 'c')) {
      const col = [...c.attrs.r.match(/^[A-Z]+/)![0]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
      cells.set(col - 1, cell(c, shared, dates))
    }
    return cells.size ? Array.from({ length: Math.max(...cells.keys()) + 1 }, (_, i) => cells.get(i) ?? '') : []
  })
  while (out.length && !out[out.length - 1].some(Boolean)) out.pop()
  const width = Math.max(0, ...out.map((r) => r.length))
  return out.map((r) => [...r, ...Array<string>(width - r.length).fill('')])
}

function cell({ attrs, body }: Element, shared: string[], dates: Set<number>): string {
  if (attrs.t === 'inlineStr') return texts(body)
  const v = body.match(/<v>([^<]*)<\/v>/)?.[1]
  if (v === undefined) return ''
  if (attrs.t === 's') return shared[Number(v)]
  if (attrs.t === 'b' || attrs.t === 'str' || attrs.t === 'e') return decode(v)
  const x = Number(v)
  if (dates.has(Number(attrs.s ?? 0))) {
    // timedelta(days=x) keeps microseconds; Python then adds 500 ms and drops them, i.e. rounds to the second
    const s = Math.floor((Math.round(x * 86_400e6) + 500_000) / 1e6)
    const iso = new Date(EXCEL_EPOCH_MS + s * 1000).toISOString()
    return `${iso.slice(0, 10)} ${s % 60 ? iso.slice(11, 19) : iso.slice(11, 16)}`
  }
  return String(x)
}

interface Element {
  attrs: Record<string, string>
  body: string
}

/** Every <tag …/> or <tag …>…</tag> in document order, with its attributes and inner XML. */
function elements(xml: string, tag: string): Element[] {
  const re = new RegExp(`<${tag}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g')
  return [...xml.matchAll(re)].map((m) => ({
    attrs: Object.fromEntries([...(m[1] ?? '').matchAll(/([\w:]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
    body: m[2] ?? '',
  }))
}

/** All <t> texts inside, joined, as ElementTree's iter("t") sees them. */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => decode(m[1])).join('')

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, e: string) =>
    e[0] === '#' ? String.fromCodePoint(Number(e[1] === 'x' ? `0${e.slice(1)}` : e.slice(1))) : (ENTITIES[e] ?? all),
  )

/** The XML parts of a zip archive by path (stored or deflated entries). */
async function unzip(data: ArrayBuffer): Promise<Map<string, string>> {
  const view = new DataView(data)
  let end = data.byteLength - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0) throw new ImportError('The file is not an .xlsx workbook (no zip directory found).')
  const files = new Map<string, string>()
  let p = view.getUint32(end + 16, true)
  for (let i = view.getUint16(end + 10, true); i > 0; i--) {
    const method = view.getUint16(p + 10, true)
    const size = view.getUint32(p + 20, true)
    const nameLength = view.getUint16(p + 28, true)
    const local = view.getUint32(p + 42, true)
    const path = new TextDecoder().decode(new Uint8Array(data, p + 46, nameLength))
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true)
    if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const raw = new Uint8Array(data, start, size)
    const bytes = method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
    files.set(path, new TextDecoder().decode(bytes))
  }
  return files
}
