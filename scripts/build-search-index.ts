import fs from 'node:fs/promises'
import path from 'node:path'
import MiniSearch from 'minisearch'

// ... existing types

type Post = {
  id: string
  slug: string
  title: string
  date: string
  isoDate: string
  excerpt: string
  cleanedText: string
  images: string[]
  imageCount: number
  topicId: string
}

type SearchDoc = {
  id: string
  postId: string
  slug: string
  url: string
  title: string
  date: string
  isoDate: string
  excerpt: string
  block: string
  blockIndex: number
  imageCount: number
  topicId: string
}

type SearchChunkManifestEntry = {
  id: string
  year: string
  file: string
  postCount: number
  blockCount: number
}

const ROOT = process.cwd()
const INPUT = path.join(ROOT, 'src/data/generated/posts-index.json')
const PUBLIC_OUT = path.join(ROOT, 'public/generated')
const DATA_OUT = path.join(ROOT, 'src/data/generated')
const CHUNK_DIR = 'search-index-chunks'
const MAX_BLOCK_CHARS = 950
const OVERLAP_SENTENCES = 1

const DUTCH_STOP_WORDS = new Set([
  'aan', 'al', 'als', 'bij', 'dan', 'dat', 'de', 'deze', 'die', 'dit', 'door', 'een', 'en', 'er',
  'geen', 'had', 'heb', 'hebben', 'heeft', 'het', 'hier', 'hij', 'hoe', 'hun', 'ik', 'in', 'is',
  'je', 'kan', 'maar', 'me', 'men', 'met', 'mijn', 'naar', 'niet', 'nog', 'nu', 'of', 'om', 'ons',
  'ook', 'op', 'over', 'te', 'tot', 'uit', 'uw', 'van', 'voor', 'was', 'wat', 'we', 'wel', 'werd',
  'wij', 'worden', 'wordt', 'ze', 'zijn', 'zo', 'zal', 'zou', 'www', 'http', 'https', 'html',
])

const searchOptions = {
  boost: { title: 5, excerpt: 2.5, block: 1 },
  prefix: true,
  fuzzy: 0.18,
  combineWith: 'AND' as const,
}

const storeFields = ['postId', 'slug', 'url', 'title', 'date', 'isoDate', 'excerpt', 'block', 'blockIndex', 'imageCount', 'topicId']
const fields = ['title', 'excerpt', 'block']

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function authorText(text: string) {
  return text
    .split(/\bReacties\b\s+\d{2}[-/]\d{2}[-/]\d{4}/i)[0]
    .split(/\bComments\b\s+\d{2}[-/]\d{2}[-/]\d{4}/i)[0]
    .replace(/\b(outlet|shoes|nike|jordan|kors|coach|sunglasses|replica|cheap|wholesale)\b[\s\S]*$/i, '')
}

function splitSentences(text: string) {
  const cleaned = normalizeWhitespace(authorText(text))
  if (!cleaned) return []
  return cleaned
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function chunkPost(post: Post): SearchDoc[] {
  const text = normalizeWhitespace(authorText(post.cleanedText || post.excerpt || post.title))
  const sentences = splitSentences(text)
  const chunks: string[] = []
  let current: string[] = []

  for (const sentence of sentences.length ? sentences : [text]) {
    const next = normalizeWhitespace([...current, sentence].join(' '))
    if (current.length && next.length > MAX_BLOCK_CHARS) {
      chunks.push(normalizeWhitespace(current.join(' ')))
      current = current.slice(-OVERLAP_SENTENCES)
    }
    current.push(sentence)
  }
  if (current.length) chunks.push(normalizeWhitespace(current.join(' ')))

  return chunks
    .filter((block, _index, all) => block.length > 40 || all.length === 1)
    .map((block, blockIndex) => ({
      id: `${post.id}:${blockIndex}`,
      postId: String(post.id),
      slug: post.slug,
      url: `/posts/${post.slug}/`,
      title: post.title,
      date: post.date,
      isoDate: post.isoDate,
      excerpt: post.excerpt,
      block,
      blockIndex,
      imageCount: post.imageCount,
      topicId: post.topicId,
    }))
}

function createMiniSearch(docs: SearchDoc[]) {
  const miniSearch = new MiniSearch<SearchDoc>({
    fields,
    storeFields,
    searchOptions,
    processTerm: (term) => {
      const normalized = term.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      if (normalized.length < 2 || DUTCH_STOP_WORDS.has(normalized)) return null
      return normalized
    },
  })
  miniSearch.addAll(docs)
  return miniSearch
}

function archiveYear(value: string) {
  const match = value.match(/^(\d{4})/)
  return match?.[1] ?? 'unknown'
}

async function writeJson(outDir: string, filename: string, data: unknown) {
  await fs.mkdir(path.dirname(path.join(outDir, filename)), { recursive: true })
  await fs.writeFile(path.join(outDir, filename), `${JSON.stringify(data)}\n`, 'utf8')
}

async function resetChunkDir(outDir: string) {
  await fs.rm(path.join(outDir, CHUNK_DIR), { recursive: true, force: true })
  await fs.mkdir(path.join(outDir, CHUNK_DIR), { recursive: true })
}

const posts = JSON.parse(await fs.readFile(INPUT, 'utf8')) as Post[]
const docs = posts.flatMap(chunkPost)
const docsByYear = new Map<string, SearchDoc[]>()
for (const doc of docs) {
  const year = archiveYear(doc.isoDate || doc.date)
  const yearDocs = docsByYear.get(year) ?? []
  yearDocs.push(doc)
  docsByYear.set(year, yearDocs)
}

const chunks: SearchChunkManifestEntry[] = [...docsByYear.entries()]
  .sort(([a], [b]) => b.localeCompare(a))
  .map(([year, yearDocs]) => ({
    id: year,
    year,
    file: `${CHUNK_DIR}/${year}.json`,
    postCount: new Set(yearDocs.map((doc) => doc.postId)).size,
    blockCount: yearDocs.length,
  }))

const manifest = {
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  postCount: posts.length,
  blockCount: docs.length,
  algorithm: 'Chunked MiniSearch BM25-like full-text index with prefix + fuzzy matching',
  fuzzy: 0.18,
  contractVersion: 2,
  chunks,
}

await writeJson(DATA_OUT, 'search-docs.json', docs)

for (const outDir of [PUBLIC_OUT, DATA_OUT]) {
  await resetChunkDir(outDir)
  for (const chunk of chunks) {
    const yearDocs = docsByYear.get(chunk.year) ?? []
    await writeJson(outDir, chunk.file, createMiniSearch(yearDocs).toJSON())
  }
  // Keep the legacy monolithic index available for compatibility/manual downloads, but the app uses chunks.
  await writeJson(outDir, 'search-index.json', createMiniSearch(docs).toJSON())
  await writeJson(outDir, 'search-manifest.json', manifest)
}

console.log(`[search-index] indexed ${docs.length} content blocks from ${posts.length} posts into ${chunks.length} chunks`)
