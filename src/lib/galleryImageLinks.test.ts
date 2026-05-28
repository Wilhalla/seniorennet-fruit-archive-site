import { describe, expect, it } from 'vitest'
import imageIndex from '../data/generated/image-index.client.json'
import posts from '../data/posts.json'
import { galleryImageViewerId, galleryImageViewerUrl, postGalleryImageEntries } from './galleryImageLinks'

type ImageIndexRecord = { id: string; src: string; postSlug: string }
type PostRecord = { id: string; slug: string; images: string[] }

const indexedImages = imageIndex as ImageIndexRecord[]
const indexedByPostAndSrc = new Map(indexedImages.map((image) => [`${image.postSlug}:${image.src}`, image]))
const postRecords = posts as PostRecord[]

describe('gallery image links', () => {
  it('builds gallery viewer ids that match the generated image index', () => {
    const post = postRecords.find((item) => item.slug === 'fruit2-2289164')!
    const firstImage = post.images[0]!
    const indexed = indexedByPostAndSrc.get(`${post.slug}:${firstImage}`)!

    expect(galleryImageViewerId(post.id, 0, firstImage)).toBe(indexed.id)
    expect(galleryImageViewerUrl(post.id, 0, firstImage)).toBe(`/gallery/view/?img=${indexed.id}`)
  })

  it('keeps series image links tied to the original archive post image index', () => {
    const seriesParts = ['fruit2-2289167', 'fruit2-2289166', 'fruit2-2289164', 'fruit2-2289162']
      .map((slug) => postRecords.find((item) => item.slug === slug)!)
    const entries = postGalleryImageEntries(seriesParts)

    expect(entries[0]!.viewerHref).toBe(`/gallery/view/?img=${indexedByPostAndSrc.get(`fruit2-2289167:${seriesParts[0]!.images[0]!}`)!.id}`)
    expect(entries[17]!.viewerHref).toBe(`/gallery/view/?img=${indexedByPostAndSrc.get(`fruit2-2289164:${seriesParts[2]!.images[0]!}`)!.id}`)
  })
})
