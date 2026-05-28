import type { Post } from './postDetails'
import { postGalleryImageEntries } from './galleryImageLinks'
import { stripDuplicateTitleFromArchiveHtml } from './archivePostHtml'
import { imageMetadata } from './imageAssets'

export const archivePostSidebarImageSizes = [
  '(max-width: 1023px) calc(100vw - 2rem)',
  '(min-width: 1280px) 14rem',
  '12rem',
].join(', ')

export const archivePostSidebarThumbSizes = [
  '(max-width: 767px) calc((100vw - 2.5rem) / 2)',
  '(max-width: 1023px) calc((100vw - 3.5rem) / 3)',
  '(min-width: 1280px) 6.5rem',
  '7rem',
].join(', ')

export function archivePostPartLabel(index: number, total: number) {
  return total > 1 ? `Deel ${index + 1} van ${total}` : 'Bericht'
}

export function archivePostPartHtml(part: Pick<Post, 'html' | 'title'>) {
  return stripDuplicateTitleFromArchiveHtml(part.html, part.title)
}

export async function buildArchivePostRendering(post: Post, seriesPosts?: Post[]) {
  const isSeries = Boolean(seriesPosts?.length && seriesPosts.length > 1)
  const parts = isSeries ? seriesPosts! : [post]
  const imageEntries = postGalleryImageEntries(parts)
  const sidebarImages = await Promise.all(
    imageEntries.map(async (image) => ({
      ...image,
      metadata: await imageMetadata(image.src),
    })),
  )

  return {
    isSeries,
    parts,
    imageEntries,
    hasImages: imageEntries.length > 0,
    sidebarImages,
  }
}
