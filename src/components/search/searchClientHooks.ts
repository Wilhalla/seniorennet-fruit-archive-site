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

export type SearchManifest = {
  blockCount: number
  postCount: number
  algorithm: string
  fuzzy: number
}

export type SearchResultDoc = SearchResult & SearchDoc

type SerializedMiniSearch = Parameters<typeof MiniSearch.loadJS<SearchDoc>>[0]

const searchOptions = {
  boost: { title: 5, excerpt: 2.5, block: 1 },
  prefix: true,
  fuzzy: 0.18,
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

export function useLazySearchIndex(query: string) {
  const [index, setIndex] = useState<MiniSearch<SearchDoc> | null>(null)
  const [loading, setLoading] = useState(false)
  const shouldLoad = !index && query.trim().length >= 2

  useEffect(() => {
    if (!shouldLoad) return undefined

    const controller = new AbortController()
    setLoading(true)
    fetchJson<SerializedMiniSearch>('/generated/search-index.json', { signal: controller.signal })
      .then((serializedIndex) => {
        setIndex(MiniSearch.loadJS<SearchDoc>(serializedIndex, {
          fields: ['title', 'excerpt', 'block'],
          storeFields: ['postId', 'slug', 'url', 'title', 'date', 'isoDate', 'excerpt', 'block', 'blockIndex', 'imageCount', 'topicId'],
          searchOptions,
        }))
      })
      .catch((error) => {
        if (!isAbortError(error)) console.error(error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [shouldLoad])

  return { index, loading }
}

export function useSearchResults(index: MiniSearch<SearchDoc> | null, query: string) {
  return useMemo(() => {
    const q = query.trim()
    if (!index || q.length < 2) return []
    const strict = index.search(q, searchOptions) as SearchResultDoc[]
    const loose = strict.length ? strict : index.search(q, { ...searchOptions, boost: { title: 5, excerpt: 2, block: 1 }, fuzzy: 0.24, combineWith: 'OR' }) as SearchResultDoc[]
    const bestByPost = new Map<string, SearchResultDoc>()
    for (const result of loose) {
      const previous = bestByPost.get(result.postId)
      if (!previous || result.score > previous.score) bestByPost.set(result.postId, result)
    }
    return [...bestByPost.values()].slice(0, 40)
  }, [index, query])
}
