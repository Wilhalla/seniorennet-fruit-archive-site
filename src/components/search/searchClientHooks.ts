import { useEffect, useMemo, useState } from 'react'
import MiniSearch, { type SearchResult } from 'minisearch'
import { currentBrowserPath, writeBrowserPath } from '../../lib/browserHistory'
import { fetchJson, isAbortError } from '../../lib/clientFetch'

export type SearchDoc = {
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

export type SearchChunkManifestEntry = {
  id: string
  year: string
  file: string
  postCount: number
  blockCount: number
}

export type SearchManifest = {
  blockCount: number
  postCount: number
  algorithm: string
  fuzzy: number
  chunks?: SearchChunkManifestEntry[]
}

export type SearchResultDoc = SearchResult & SearchDoc
export type SearchListResult = Partial<SearchResult> & Pick<SearchDoc, 'id' | 'postId' | 'slug' | 'url' | 'title' | 'date' | 'isoDate' | 'excerpt' | 'imageCount' | 'topicId'> & {
  block?: string
  blockIndex?: number
  terms?: string[]
}

type SerializedMiniSearch = Parameters<typeof MiniSearch.loadJS<SearchDoc>>[0]
type LoadedSearchChunk = { id: string; index: MiniSearch<SearchDoc> }
type TitleSearchPost = {
  id: string
  slug: string
  title: string
  date: string
  isoDate: string
  imageCount: number
  topicIds?: string[]
}
type ArchiveClientPayload = { aggregated: TitleSearchPost[]; all?: TitleSearchPost[] }

const searchOptions = {
  boost: { title: 5, excerpt: 2.5, block: 1 },
  prefix: true,
  fuzzy: 0.18,
  combineWith: 'AND' as const,
}

const titleSearchOptions = {
  boost: { title: 5 },
  prefix: true,
  fuzzy: 0.15,
  combineWith: 'AND' as const,
}

function queryFromLocation() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('q') ?? ''
}

function searchUrlForQuery(query: string) {
  const url = new URL(window.location.href)
  const nextQuery = query.trim()
  if (nextQuery) url.searchParams.set('q', nextQuery)
  else url.searchParams.delete('q')
  return `${url.pathname}${url.search}${url.hash}`
}

export function useUrlBackedSearchQuery() {
  const [query, setQuery] = useState('')
  const [urlStateLoaded, setUrlStateLoaded] = useState(false)

  useEffect(() => {
    const applyLocationQuery = () => {
      setQuery(queryFromLocation())
      setUrlStateLoaded(true)
    }

    applyLocationQuery()
    window.addEventListener('popstate', applyLocationQuery)
    return () => window.removeEventListener('popstate', applyLocationQuery)
  }, [])

  useEffect(() => {
    if (!urlStateLoaded) return
    const next = searchUrlForQuery(query)
    if (next !== currentBrowserPath()) writeBrowserPath(next, 'replace')
  }, [query, urlStateLoaded])

  return { query, setQuery }
}

export function useSearchManifest() {
  const [manifest, setManifest] = useState<SearchManifest | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchJson<SearchManifest>('/generated/search-manifest.json', { signal: controller.signal })
      .then(setManifest)
      .catch((error) => {
        if (!isAbortError(error)) console.error(error)
      })
    return () => controller.abort()
  }, [])

  return manifest
}

export function useTitleSearchResults(query: string) {
  const [index, setIndex] = useState<MiniSearch<SearchListResult> | null>(null)
  const [loading, setLoading] = useState(false)
  const shouldLoad = !index && query.trim().length >= 2

  useEffect(() => {
    if (!shouldLoad) return undefined

    const controller = new AbortController()
    setLoading(true)
    fetchJson<ArchiveClientPayload>('/generated/archive-posts.client.json', { signal: controller.signal })
      .then((payload) => {
        const docs: SearchListResult[] = (payload.aggregated ?? []).map((post) => ({
          id: post.id,
          postId: post.id,
          slug: post.slug,
          url: `/posts/${post.slug}/`,
          title: post.title,
          date: post.date,
          isoDate: post.isoDate,
          excerpt: '',
          imageCount: post.imageCount,
          topicId: post.topicIds?.[0] ?? '',
        }))
        const nextIndex = new MiniSearch<SearchListResult>({
          fields: ['title'],
          storeFields: ['postId', 'slug', 'url', 'title', 'date', 'isoDate', 'excerpt', 'imageCount', 'topicId'],
          searchOptions: titleSearchOptions,
        })
        nextIndex.addAll(docs)
        setIndex(nextIndex)
      })
      .catch((error) => {
        if (!isAbortError(error)) console.error(error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [shouldLoad])

  return useMemo(() => {
    const q = query.trim()
    if (!index || q.length < 2) return { results: [] as SearchListResult[], loading }
    const strict = index.search(q, titleSearchOptions) as SearchListResult[]
    const loose = strict.length ? strict : index.search(q, { ...titleSearchOptions, fuzzy: 0.24, combineWith: 'OR' }) as SearchListResult[]
    return { results: loose.slice(0, 40), loading }
  }, [index, loading, query])
}

export function useLazySearchIndex(query: string, enabled: boolean, manifest: SearchManifest | null) {
  const [chunks, setChunks] = useState<LoadedSearchChunk[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedChunkIds, setLoadedChunkIds] = useState<Set<string>>(() => new Set())
  const chunkManifest = manifest?.chunks ?? []
  const loaded = chunks.length > 0
  const allLoaded = chunkManifest.length > 0 && loadedChunkIds.size >= chunkManifest.length
  const shouldLoad = enabled && Boolean(manifest) && !allLoaded && query.trim().length >= 2

  useEffect(() => {
    if (!shouldLoad) return undefined

    const controller = new AbortController()
    let cancelled = false
    setLoading(true)

    async function loadChunks() {
      try {
        const entries = chunkManifest.length ? chunkManifest : [{ id: 'all', file: 'search-index.json' }]
        for (const entry of entries) {
          if (controller.signal.aborted || cancelled) return
          if (loadedChunkIds.has(entry.id)) continue
          const serializedIndex = await fetchJson<SerializedMiniSearch>(`/generated/${entry.file}`, { signal: controller.signal, priority: 'low' })
          if (controller.signal.aborted || cancelled) return
          const index = MiniSearch.loadJS<SearchDoc>(serializedIndex, {
            fields: ['title', 'excerpt', 'block'],
            storeFields: ['postId', 'slug', 'url', 'title', 'date', 'isoDate', 'excerpt', 'block', 'blockIndex', 'imageCount', 'topicId'],
            searchOptions,
          })
          setChunks((current) => current.some((chunk) => chunk.id === entry.id) ? current : [...current, { id: entry.id, index }])
          setLoadedChunkIds((current) => new Set(current).add(entry.id))
          await new Promise((resolve) => window.setTimeout(resolve, 0))
        }
      } catch (error) {
        if (!isAbortError(error)) console.error(error)
      } finally {
        if (!controller.signal.aborted && !cancelled) setLoading(false)
      }
    }

    loadChunks()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [chunkManifest, shouldLoad])

  return { chunks, loading, loaded, allLoaded }
}

export function useSearchResults(chunks: LoadedSearchChunk[], query: string) {
  return useMemo(() => {
    const q = query.trim()
    if (!chunks.length || q.length < 2) return [] as SearchListResult[]
    const bestByPost = new Map<string, SearchResultDoc>()
    for (const chunk of chunks) {
      const strict = chunk.index.search(q, searchOptions) as SearchResultDoc[]
      const loose = strict.length ? strict : chunk.index.search(q, { ...searchOptions, boost: { title: 5, excerpt: 2, block: 1 }, fuzzy: 0.24, combineWith: 'OR' }) as SearchResultDoc[]
      for (const result of loose) {
        const previous = bestByPost.get(result.postId)
        if (!previous || result.score > previous.score) bestByPost.set(result.postId, result)
      }
    }
    return [...bestByPost.values()].sort((a, b) => b.score - a.score).slice(0, 40)
  }, [chunks, query])
}
