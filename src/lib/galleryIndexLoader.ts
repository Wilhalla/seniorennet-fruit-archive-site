import { fetchGalleryJson, type GalleryImageRecord } from './imageGallerySession'
import type { FetchPriority } from './clientFetch'

type ImageIndexChunkManifest = {
  imageCount: number
  chunks: Array<{ file: string; imageCount: number }>
}

// Fetch a few years at once, then commit one batch to React instead of
// rebuilding and sorting the full gallery after every individual year.
export async function loadGalleryIndexChunks({
  initialImages,
  onBatch,
  priority,
  signal,
}: {
  initialImages: GalleryImageRecord[]
  onBatch: (images: GalleryImageRecord[]) => void
  priority: FetchPriority
  signal: AbortSignal
}) {
  const manifest = await fetchGalleryJson<ImageIndexChunkManifest>('/generated/image-index-chunks.json', priority, signal)
  if (!manifest.chunks?.length) throw new Error('Geen beeldarchief-chunks gevonden')

  const imagesById = new Map(initialImages.map((image) => [image.id, image]))
  let loadedCount = 0
  const batchSize = 4

  for (let index = 0; index < manifest.chunks.length; index += batchSize) {
    const chunks = manifest.chunks.slice(index, index + batchSize)
    const batches = await Promise.all(chunks.map((chunk) => fetchGalleryJson<GalleryImageRecord[]>(`/generated/${chunk.file}`, priority, signal)))
    if (signal.aborted) return false

    for (const images of batches) {
      loadedCount += images.length
      for (const image of images) imagesById.set(image.id, image)
    }
    onBatch([...imagesById.values()])
  }

  return loadedCount >= manifest.imageCount
}
