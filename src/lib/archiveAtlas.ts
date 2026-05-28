import type { LucideIcon } from 'lucide-react'
import { Apple, Archive, Flower2, Leaf, Sprout, Users } from 'lucide-react'
import { archiveThumbUrl } from './assetUrls'

export type MapPoint = {
  id: string
  slug: string
  title: string
  date: string
  year: number | null
  month: number | null
  season: string
  topicId: string
  x: number
  y: number
  imageCount: number
  image?: string | null
  excerpt: string
}

export type Topic = {
  id: string
  label: string
  generatedLabel: string
  visualKeywords?: string[]
  textKeywords?: string[]
  postCount: number
  representativePostIds: string[]
}

export type AtlasFilters = {
  topic: string
  year: string
  season: string
  imagesOnly: boolean
  search: string
}

export type AtlasViewMode = 'points' | 'clusters' | 'density'
export type ScreenPoint = { x: number; y: number }
export type RenderCluster = { x: number; y: number; count: number; topicId: string }

export type AtlasCategory = {
  id: string
  label: string
  description: string
  Icon: LucideIcon
  match: RegExp
}

const dateFormatter = new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: 'long', year: 'numeric' })

export const atlasCategories: AtlasCategory[] = [
  { id: 'fruit', label: 'Appels & fruit', description: 'Rassen, oogst, boomgaard en fruitteelt.', Icon: Apple, match: /appel|appels|fruit|peer|peren|pruim|pruimen|kers|kersen|bes|bessen|framboos|druif|druiven|boomgaard/i },
  { id: 'garden', label: 'Tuin & teelt', description: 'Werk in de tuin, bodem, seizoenen en groei.', Icon: Sprout, match: /tuin|teelt|groei|plant|bodem|bloei|oogst|veld|snoei|zaai/i },
  { id: 'people', label: 'Mensen & reizen', description: 'Familie, uitstappen, steden en ontmoetingen.', Icon: Users, match: /mensen|reis|reizen|stad|kerk|museum|familie|bezoek|erfgoed|document/i },
  { id: 'animals', label: 'Dieren & insecten', description: 'Vogels, bijen, rupsen en ander tuinleven.', Icon: Flower2, match: /dier|dieren|insect|bij|bijen|vogel|vogels|koekoek|steenuil|rups|rupsen|vlinder|mees|merel/i },
  { id: 'heritage', label: 'Erfgoed & documenten', description: 'Geschiedenis, archiefsporen en bronnen.', Icon: Archive, match: /erfgoed|document|geschiedenis|archief|kerk|oude|bron/i },
  { id: 'landscape', label: 'Landschap', description: 'Plekken, parken, natuur en omgeving.', Icon: Leaf, match: /park|landschap|natuur|bos|veld|water|wandeling/i },
]

export const atlasCategoryColors: Record<string, string> = {
  fruit: '#8b5a2b',
  garden: '#567a4b',
  people: '#3f6f9f',
  animals: '#b7644a',
  heritage: '#8a7c65',
  landscape: '#c09035',
}

export const atlasTerritories: Record<string, { cx: number; cy: number; width: number; height: number }> = {
  people: { cx: 0.28, cy: 0.28, width: 0.28, height: 0.28 },
  heritage: { cx: 0.50, cy: 0.26, width: 0.24, height: 0.24 },
  animals: { cx: 0.75, cy: 0.34, width: 0.26, height: 0.27 },
  fruit: { cx: 0.36, cy: 0.68, width: 0.30, height: 0.30 },
  garden: { cx: 0.61, cy: 0.58, width: 0.30, height: 0.30 },
  landscape: { cx: 0.78, cy: 0.74, width: 0.24, height: 0.24 },
}

export const ATLAS_X_SPREAD = 0.9
export const ATLAS_Y_SPREAD = 0.82
export const MIN_ATLAS_SCALE = 0.75
export const MAX_ATLAS_SCALE = 18

const broadVisualTopicTerms = new Set(['mensen', 'tuin & teelt', 'dieren & insecten', 'reizen & erfgoed', 'documenten'])

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function shortLabel(value: string, max = 34) {
  const label = String(value || '').replace(/\s+/g, ' ').trim()
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

export function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : dateFormatter.format(date)
}

export function topicSearchText(topic?: Topic) {
  if (!topic) return ''
  return [topic.label, topic.generatedLabel, ...(topic.visualKeywords ?? []), ...(topic.textKeywords ?? [])].join(' ').toLowerCase()
}

export function categoryFor(topic?: Topic) {
  const search = topicSearchText(topic)
  const label = `${topic?.label ?? ''} ${topic?.generatedLabel ?? ''}`.toLowerCase().trim()
  if (/^(appel|appels|fruit|peer|peren|pruim|pruimen|kers|bessen|druif|druiven|boomgaard)/.test(label)) return atlasCategories.find((category) => category.id === 'fruit')
  if (/^(dier|dieren|insect|insecten|koekoek|steenuil|vogel|vlinder|bij)/.test(label)) return atlasCategories.find((category) => category.id === 'animals')
  if (/^(mens|mensen|reis|reizen|familie|stad|bezoek)/.test(label)) return atlasCategories.find((category) => category.id === 'people')
  if (/^(erfgoed|document|geschiedenis|archief)/.test(label)) return atlasCategories.find((category) => category.id === 'heritage')
  if (/^(landschap|natuur|park|bos|wandeling)/.test(label)) return atlasCategories.find((category) => category.id === 'landscape')
  if (/^(tuin|teelt|bodem|snoei|zaai)/.test(label)) return atlasCategories.find((category) => category.id === 'garden')
  if (/appel|fruit|peer|peren|pruim|kers|bes|framboos|druif|boomgaard/.test(search)) return atlasCategories.find((category) => category.id === 'fruit')
  if (/dieren\s*&\s*insecten|dier|insect|vogel|bij|koekoek|steenuil|vlinder/.test(search)) return atlasCategories.find((category) => category.id === 'animals')
  if (/mensen\s*&\s*reizen|reis|reizen|familie|stad|bezoek/.test(search)) return atlasCategories.find((category) => category.id === 'people')
  if (/erfgoed|document|geschiedenis|archief/.test(search)) return atlasCategories.find((category) => category.id === 'heritage')
  if (/landschap|natuur|park|bos|wandeling/.test(search)) return atlasCategories.find((category) => category.id === 'landscape')
  if (/tuin\s*&\s*teelt|tuin|teelt|bodem|snoei|zaai/.test(search)) return atlasCategories.find((category) => category.id === 'garden')
  return atlasCategories.find((category) => category.match.test(search))
}

function titleCaseTopicLabel(value: string) {
  return String(value || '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => term.charAt(0).toUpperCase() + term.slice(1))
    .join(', ')
}

function topicSpecificTerms(topic?: Topic) {
  const words = [...(topic?.textKeywords ?? []), ...(topic?.visualKeywords ?? [])]
  return [...new Set(words.map((word) => word.trim()).filter(Boolean))]
    .filter((word) => !broadVisualTopicTerms.has(word.toLowerCase()))
}

function normalizedTopicLabel(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function topicDisplayLabel(topic?: Topic, max = 30) {
  if (!topic) return 'Onbekend thema'
  const generatedTitle = titleCaseTopicLabel(topic.generatedLabel)
  const hasManualLabel = topic.label && topic.label !== 'Nog te benoemen' && normalizedTopicLabel(topic.label) !== normalizedTopicLabel(topic.generatedLabel)
  if (hasManualLabel) return shortLabel(topic.label, max)
  const specific = topicSpecificTerms(topic).slice(0, 3)
  if (specific.length) return shortLabel(titleCaseTopicLabel(specific.join(', ')), max)
  return shortLabel(generatedTitle || topic.id, max)
}

export function topicKeywords(topic?: Topic, limit = 6) {
  const specific = topicSpecificTerms(topic)
  if (specific.length) return specific.slice(0, limit)
  const words = [...(topic?.textKeywords ?? []), ...(topic?.visualKeywords ?? [])]
  return [...new Set(words.map((word) => word.trim()).filter(Boolean))].slice(0, limit)
}

export function themeValue(token: string) {
  if (typeof window === 'undefined') return 'currentColor'
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || 'currentColor'
}

export function colorMix(color: string, alpha: number) {
  if (color.startsWith('#') && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16)
    const g = Number.parseInt(color.slice(3, 5), 16)
    const b = Number.parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`)
  return response.json() as Promise<T>
}

export function thumbImage(src?: string | null) {
  return src ? archiveThumbUrl(src) : ''
}
