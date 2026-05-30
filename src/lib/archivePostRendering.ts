import type { Post } from './archivePostReading'
import { postGalleryImageEntries } from './galleryImageLinks'
import { imageMetadata } from './imageAssets'
import {
  archivePostPartHtml,
  archivePostPartLabel,
  archivePostSidebarImageSizes,
  archivePostSidebarThumbSizes,
} from './archivePostReading'

export {
  archivePostPartHtml,
  archivePostPartLabel,
  archivePostSidebarImageSizes,
  archivePostSidebarThumbSizes,
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
