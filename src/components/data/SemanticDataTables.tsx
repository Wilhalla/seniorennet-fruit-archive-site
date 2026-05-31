import { useEffect, useMemo, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'

import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type RawRow = Record<string, unknown>

type RawDataset = {
  id: string
  title: string
  file: string
  columns: string[]
  rows: RawRow[]
}

type DatasetDefinition = {
  id: string
  title: string
  file: string
  url: string
  preferredColumns: string[]
  rowsFromData: (value: unknown) => RawRow[]
  autoLoad?: boolean
}

const isRecord = (value: unknown): value is RawRow => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const rowsFromArray = (value: unknown): RawRow[] => {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => isRecord(item) ? item : { index, value: item })
}

const keyValueRows = (value: unknown, skipKeys: string[] = []): RawRow[] => {
  if (!isRecord(value)) return []
  const skipped = new Set(skipKeys)
  return Object.entries(value)
    .filter(([key]) => !skipped.has(key))
    .map(([key, rawValue]) => ({ key, value: rawValue }))
}

const collectColumns = (rows: RawRow[], preferred: string[] = []): string[] => {
  const columns = new Set<string>(preferred)
  for (const row of rows) {
    for (const key of Object.keys(row)) columns.add(key)
  }
  return Array.from(columns)
}

const stringifyCell = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

const summarizeCell = (value: string): string => {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= 120) return singleLine || 'lege waarde'
  return `${singleLine.slice(0, 120)}…`
}

const downloadDataset = (dataset: RawDataset) => {
  const payload = JSON.stringify(
    {
      file: dataset.file,
      title: dataset.title,
      columns: dataset.columns,
      rows: dataset.rows,
    },
    null,
    2,
  )
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${dataset.id}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const generated = (file: string) => `/generated/${file}`

const datasetDefinitions: DatasetDefinition[] = [
  {
    id: 'manifest',
    title: 'Pipeline manifest',
    file: 'manifest.json',
    url: generated('manifest.json'),
    preferredColumns: ['key', 'value'],
    rowsFromData: keyValueRows,
    autoLoad: true,
  },
  {
    id: 'topics',
    title: 'Topics',
    file: 'topics.json',
    url: generated('topics.json'),
    preferredColumns: ['id', 'label', 'generatedLabel', 'postCount', 'visualKeywords', 'textKeywords', 'representativePostIds'],
    rowsFromData: rowsFromArray,
  },
  {
    id: 'map-points',
    title: 'Map points',
    file: 'map-points.json',
    url: generated('map-points.json'),
    preferredColumns: ['id', 'slug', 'title', 'date', 'year', 'month', 'season', 'topicId', 'x', 'y', 'imageCount', 'image', 'excerpt'],
    rowsFromData: rowsFromArray,
  },
  {
    id: 'posts-index',
    title: 'Posts index',
    file: 'posts-index.json',
    url: generated('posts-index.json'),
    preferredColumns: ['id', 'slug', 'title', 'date', 'isoDate', 'year', 'month', 'season', 'topicId', 'imageCount', 'url', 'excerpt', 'cleanedText', 'images', 'tags'],
    rowsFromData: rowsFromArray,
  },
  {
    id: 'related-posts',
    title: 'Related posts',
    file: 'related-posts.json',
    url: generated('related-posts.json'),
    preferredColumns: ['postId', 'relatedPostIds'],
    rowsFromData: (value) => Object.entries(value as Record<string, string[]>).map(([postId, relatedPostIds]) => ({ postId, relatedPostIds })),
  },
  {
    id: 'topic-calendar-summary',
    title: 'Topic calendar summary',
    file: 'topic-calendar.json',
    url: generated('topic-calendar.json'),
    preferredColumns: ['key', 'value'],
    rowsFromData: (value) => keyValueRows(value, ['topics']),
  },
  {
    id: 'topic-calendar-topics',
    title: 'Topic calendar by topic',
    file: 'topic-calendar.json · topics[]',
    url: generated('topic-calendar.json'),
    preferredColumns: ['topicId', 'label', 'generatedLabel', 'postCount', 'total', 'monthsAllYears', 'seasonsAllYears', 'years'],
    rowsFromData: (value) => isRecord(value) && Array.isArray(value.topics) ? rowsFromArray(value.topics) : [],
  },
  {
    id: 'entities',
    title: 'Entities',
    file: 'entities.json',
    url: generated('entities.json'),
    preferredColumns: ['index', 'value'],
    rowsFromData: rowsFromArray,
  },
]

function RawCell({ value }: { value: unknown }) {
  const text = stringifyCell(value)
  const isLong = text.length > 180 || text.includes('\n')

  if (isLong) {
    return (
      <details className="w-[32rem] max-w-[72vw]">
        <summary className="cursor-pointer whitespace-normal break-words font-mono text-xs leading-relaxed text-obsidian marker:text-slate">
          {summarizeCell(text)}
        </summary>
        <pre className="mt-3 max-h-80 max-w-full overflow-auto border-l border-chalk bg-transparent pl-3 font-mono text-xs leading-relaxed text-obsidian whitespace-pre-wrap">
          {text}
        </pre>
      </details>
    )
  }

  return <code className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-obsidian">{text}</code>
}

const compactColumnIds = new Set(['__row', 'id', 'postId', 'topicId', 'year', 'month', 'x', 'y', 'imageCount', 'postCount', 'total'])
const mediumColumnIds = new Set(['slug', 'date', 'isoDate', 'season', 'key', 'url'])

const columnWidthClass = (columnId: string) => {
  if (compactColumnIds.has(columnId)) return 'w-20 min-w-20 max-w-28'
  if (mediumColumnIds.has(columnId)) return 'w-40 min-w-32 max-w-52'
  return 'min-w-44 max-w-[32rem]'
}

declare global {
  interface Window {
    __semanticDataTablesReady?: boolean
  }
}

function RawDataTable({ definition }: { definition: DatasetDefinition }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rows, setRows] = useState<RawRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const sectionRef = useRef<HTMLElement | null>(null)

  const columnsList = useMemo(
    () => collectColumns(rows ?? [], definition.preferredColumns),
    [definition.preferredColumns, rows],
  )

  const dataset = useMemo<RawDataset>(() => ({
    id: definition.id,
    title: definition.title,
    file: definition.file,
    columns: columnsList,
    rows: rows ?? [],
  }), [columnsList, definition.file, definition.id, definition.title, rows])

  const loadDataset = async () => {
    if (rows || loading) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(definition.url, { priority: 'low' as RequestInit['priority'] })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const value = await response.json()
      setRows(definition.rowsFromData(value))
    } catch (loadError) {
      console.error(loadError)
      setError(loadError instanceof Error ? loadError.message : 'Dataset kon niet geladen worden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const element = sectionRef.current
    if (!definition.autoLoad || !element || rows || loading) return undefined
    if (!('IntersectionObserver' in window)) {
      loadDataset()
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        loadDataset()
      }
    }, { rootMargin: '700px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [definition.autoLoad, loading, rows])

  const columns = useMemo<ColumnDef<RawRow>[]>(() => [
    {
      id: '__row',
      header: '#',
      cell: ({ row }) => row.index + 1,
      enableSorting: false,
    },
    ...columnsList.map((column) => ({
      id: column,
      accessorFn: (row: RawRow) => stringifyCell(row[column]),
      header: column,
      cell: ({ row }: { row: { original: RawRow } }) => <RawCell value={row.original[column]} />,
      sortingFn: 'alphanumeric' as const,
    })),
  ], [columnsList])

  const table = useReactTable({
    data: rows ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <section ref={sectionRef} id={definition.id} className="min-w-0 border-t border-chalk py-8" aria-labelledby={`${definition.id}-title`}>
      <div className="grid min-w-0 gap-4 pb-5 md:grid-cols-[minmax(12rem,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-xs text-slate">{definition.file}</p>
          <h2 id={`${definition.id}-title`} className="m-0 font-heading text-[clamp(1.7rem,3vw,2.45rem)] font-light leading-none tracking-[-0.04em] text-obsidian">
            {definition.title}
          </h2>
          {!rows && !error && <p className="mt-2 text-sm text-gravel">Deze dataset wordt pas geladen wanneer je dit blok opent.</p>}
          {error && <p className="mt-2 text-sm text-destructive">Kon niet laden: {error}</p>}
        </div>
        <div className="flex flex-wrap gap-3 md:justify-end">
          {!rows && (
            <Button
              className="h-auto justify-self-start rounded-none px-0 py-0 text-sm font-medium text-obsidian hover:bg-transparent hover:text-gravel md:justify-self-end"
              type="button"
              variant="ghost"
              onClick={loadDataset}
              disabled={loading}
            >
              {loading ? 'laden…' : 'laad tabel'}
            </Button>
          )}
          {rows && (
            <Button
              className="h-auto justify-self-start rounded-none px-0 py-0 text-sm font-medium text-obsidian hover:bg-transparent hover:text-gravel md:justify-self-end"
              type="button"
              variant="ghost"
              onClick={() => downloadDataset(dataset)}
              aria-label={`Download ${definition.title} als JSON`}
            >
              <Download className="size-4" aria-hidden="true" />
              <span>download</span>
            </Button>
          )}
        </div>
      </div>

      {loading && !rows ? (
        <div className="grid gap-2 py-5" aria-live="polite">
          {Array.from({ length: 4 }).map((_, index) => <div className="h-9 animate-pulse rounded bg-powder/60" key={index} />)}
        </div>
      ) : rows && rows.length === 0 ? (
        <p className="py-5 text-gravel">Geen rijen in deze dataset.</p>
      ) : rows ? (
        <div className="min-w-0 max-w-full overflow-hidden">
          <Table
            containerClassName="max-h-[78vh] min-w-0 max-w-full overflow-auto"
            className="w-max min-w-full border-separate border-spacing-0"
            aria-label={`${definition.title} tabel`}
          >
            <TableHeader className="sticky top-0 z-20 bg-eggshell/95 backdrop-blur [&_tr]:border-b-0">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-chalk hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={`${columnWidthClass(header.column.id)} border-b border-chalk bg-eggshell/95 px-3 text-xs font-medium uppercase tracking-[0.08em] text-slate`}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          className="inline-flex items-center gap-1 text-left disabled:cursor-default"
                          type="button"
                          disabled={!header.column.getCanSort()}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? null}
                        </button>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="border-b border-chalk/80 hover:bg-powder/20">
                  {row.getVisibleCells().map((cell, cellIndex) => (
                    <TableCell
                      key={cell.id}
                      className={`${columnWidthClass(cell.column.id)} px-3 py-2 align-top whitespace-normal ${cellIndex === 0 ? 'sticky left-0 z-10 bg-eggshell font-mono text-xs text-slate' : ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  )
}

export default function SemanticDataTables() {
  useEffect(() => {
    window.__semanticDataTablesReady = true
    window.dispatchEvent(new CustomEvent('semantic-data-tables-ready'))
  }, [])

  return (
    <section className="site-shell grid min-w-0 gap-0 pb-20" aria-label="Ruwe semantische preprocessing data">
      {datasetDefinitions.map((definition) => (
        <RawDataTable key={definition.id} definition={definition} />
      ))}
    </section>
  )
}
