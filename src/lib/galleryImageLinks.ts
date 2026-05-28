import { createHash } from 'node:crypto'
import { galleryViewerPageUrl } from './imageGallerySession'

type PostImageSource = {
  id: string
  images: string[]
}

export type PostGalleryImageEntry = {
  src: string
  viewerId: string
  viewerHref: string
}

export function galleryImageViewerId(postId: string, imageIndex: number, src: string) {
  const hash = createHash('sha1').update(`${postId}:${imageIndex}:${src}`, 'utf8').digest('hex')
  return `img-${hash.slice(0, 16)}`
}

export function galleryImageViewerUrl(postId: string, imageIndex: number, src: string) {
  return galleryViewerPageUrl({
    query: '',
    theme: 'all',
    speciesFilter: 'all',
    selectedYear: '',
    season: 'all',
    peoplePlantsOnly: false,
    sortNewest: true,
    viewerId: galleryImageViewerId(postId, imageIndex, src),
  })
}

export function postGalleryImageEntries(parts: readonly PostImageSource[]): PostGalleryImageEntry[] {
  const seen = new Set<string>()
  const entries: PostGalleryImageEntry[] = []

  for (const part of parts) {
    part.images.forEach((src, imageIndex) => {
      if (seen.has(src)) return
      seen.add(src)
      entries.push({
        src,
        viewerId: galleryImageViewerId(part.id, imageIndex, src),
        viewerHref: galleryImageViewerUrl(part.id, imageIndex, src),
      })
    })
  }

  return entries
}
