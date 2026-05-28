import { describe, expect, it } from 'vitest'
import { categoryFor, colorMix, shortLabel, topicDisplayLabel, topicKeywords } from './archiveAtlas'

describe('archive atlas renderer module', () => {
  it('maps archive topics onto stable atlas categories', () => {
    expect(categoryFor({ id: 't1', label: 'Appels', generatedLabel: 'appel, boomgaard', postCount: 1, representativePostIds: [] })?.id).toBe('fruit')
    expect(categoryFor({ id: 't2', label: 'Nog te benoemen', generatedLabel: 'dieren & insecten, vogel', postCount: 1, representativePostIds: [] })?.id).toBe('animals')
  })

  it('derives compact display labels and keywords without leaking broad visual terms', () => {
    const topic = { id: 't3', label: 'Nog te benoemen', generatedLabel: 'tuin & teelt', textKeywords: ['enten', 'snoei'], visualKeywords: ['mensen'], postCount: 3, representativePostIds: [] }

    expect(topicDisplayLabel(topic)).toBe('Enten, Snoei')
    expect(topicKeywords(topic)).toEqual(['enten', 'snoei'])
    expect(shortLabel('abcdefghijklmnopqrstuvwxyz', 8)).toBe('abcdefg…')
  })

  it('converts hex colors to canvas rgba strings', () => {
    expect(colorMix('#0f172a', 0.5)).toBe('rgba(15, 23, 42, 0.5)')
    expect(colorMix('currentColor', 0.5)).toBe('currentColor')
  })
})
