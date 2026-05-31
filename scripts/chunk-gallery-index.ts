import fs from 'node:fs/promises'
import path from 'node:path'

type GalleryImageRecord = {
  id: string
  year: number | null
  date: string
  isoDate?: string
}

const ROOT = process.cwd()
const OUT_DIRS = [path.join(ROOT, 'public/generated'), path.join(ROOT, 'src/data/generated')]
const CHUNK_DIR = 'image-index-years'
const SOURCE = path.join(ROOT, 'src/data/generated/image-index.client.json')

function yearFor(image: GalleryImageRecord) {
  if (typeof image.year === 'number' && Number.isFinite(image.year)) return String(image.year)
  const match = (image.isoDate || image.date || '').match(/^(\d{4})/)
  return match?.[1] ?? 'unknown'
}

async function writeJson(outDir: string, filename: string, value: unknown) {
  const target = path.join(outDir, filename)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${JSON.stringify(value)}\n`, 'utf8')
}

const images = JSON.parse(await fs.readFile(SOURCE, 'utf8')) as GalleryImageRecord[]
const byYear = new Map<string, GalleryImageRecord[]>()
for (const image of images) {
  const year = yearFor(image)
  const bucket = byYear.get(year) ?? []
  bucket.push(image)
  byYear.set(year, bucket)
}

const chunks = [...byYear.entries()]
  .sort(([a], [b]) => b.localeCompare(a))
  .map(([year, records]) => ({
    id: year,
    year,
    file: `${CHUNK_DIR}/${year}.json`,
    imageCount: records.length,
  }))

const manifest = {
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  imageCount: images.length,
  contractVersion: 1,
  chunks,
}

for (const outDir of OUT_DIRS) {
  await fs.rm(path.join(outDir, CHUNK_DIR), { recursive: true, force: true })
  await fs.mkdir(path.join(outDir, CHUNK_DIR), { recursive: true })
  for (const chunk of chunks) await writeJson(outDir, chunk.file, byYear.get(chunk.year) ?? [])
  await writeJson(outDir, 'image-index-chunks.json', manifest)
}

console.log(`[gallery-chunks] wrote ${images.length} images into ${chunks.length} chunks`)
