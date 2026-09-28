import { afterEach, expect, it, vi } from 'vitest'
import { loadGalleryIndexChunks } from './galleryIndexLoader'
import type { GalleryImageRecord } from './imageGallerySession'

afterEach(() => vi.unstubAllGlobals())

it('loads year chunks in bounded batches and merges duplicate initial images', async () => {
  const image = (id: string) => ({ id, src: `/archive-images/${id}.jpg` }) as GalleryImageRecord
  const updates: GalleryImageRecord[][] = []
  let active = 0
  let peakActive = 0

  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('image-index-chunks.json')) {
      return Response.json({ imageCount: 5, chunks: Array.from({ length: 5 }, (_, index) => ({ file: `year-${index}.json`, imageCount: 1 })) })
    }

    active += 1
    peakActive = Math.max(peakActive, active)
    await new Promise((resolve) => setTimeout(resolve, 0))
    active -= 1
    const id = Number(url.match(/year-(\d+)/)?.[1])
    return Response.json([image(String(id))])
  })

  const complete = await loadGalleryIndexChunks({
    initialImages: [image('0')],
    onBatch: (images) => updates.push(images),
    priority: 'low',
    signal: new AbortController().signal,
  })

  expect(complete).toBe(true)
  expect(peakActive).toBe(4)
  expect(updates).toHaveLength(2)
  expect(updates.at(-1)?.map((item) => item.id)).toEqual(['0', '1', '2', '3', '4'])
})
