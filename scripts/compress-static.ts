import { brotliCompress, gzip } from 'node:zlib'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const COMPRESS_EXTENSIONS = new Set(['.json', '.js', '.css', '.html', '.svg'])
const MIN_BYTES = 1024

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

let files = 0
let rawBytes = 0
let gzipBytes = 0
let brotliBytes = 0

try {
  await fs.access(DIST)
} catch {
  throw new Error('dist/ does not exist. Run astro build first.')
}

for await (const file of walk(DIST)) {
  const ext = path.extname(file)
  if (!COMPRESS_EXTENSIONS.has(ext)) continue
  const raw = await fs.readFile(file)
  if (raw.length < MIN_BYTES) continue

  const [gz, br] = await Promise.all([
    gzipAsync(raw, { level: 9 }),
    brotliAsync(raw, { params: { 1: 11 } }),
  ])
  await Promise.all([
    fs.writeFile(`${file}.gz`, gz),
    fs.writeFile(`${file}.br`, br),
  ])
  files += 1
  rawBytes += raw.length
  gzipBytes += gz.length
  brotliBytes += br.length
}

function mb(value: number) {
  return `${(value / 1024 / 1024).toFixed(2)}MB`
}

console.log(`[compress-static] ${files} files: raw ${mb(rawBytes)}, gzip ${mb(gzipBytes)}, brotli ${mb(brotliBytes)}`)
