import { describe, expect, it } from 'vitest'
import { generatedDataUrl, sitePath } from './sitePaths'

describe('sitePath', () => {
  it('keeps root-relative paths at the site root by default', () => {
    expect(sitePath('/generated/map-points.json', '/')).toBe('/generated/map-points.json')
  })

  it('prefixes paths with an Astro base path', () => {
    expect(sitePath('/generated/map-points.json', '/fruit-archive/')).toBe('/fruit-archive/generated/map-points.json')
    expect(sitePath('atlas/', '/fruit-archive')).toBe('/fruit-archive/atlas/')
  })

  it('does not rewrite absolute or data URLs', () => {
    expect(sitePath('https://example.com/image.png', '/fruit-archive/')).toBe('https://example.com/image.png')
    expect(sitePath('data:image/png;base64,abc', '/fruit-archive/')).toBe('data:image/png;base64,abc')
  })
})

describe('generatedDataUrl', () => {
  it('builds generated JSON URLs under the configured base', () => {
    expect(generatedDataUrl('map-points.json', '/fruit-archive/')).toBe('/fruit-archive/generated/map-points.json')
    expect(generatedDataUrl('/topics.json', '/fruit-archive/')).toBe('/fruit-archive/generated/topics.json')
  })
})
