import type { ImageMetadata } from 'astro'

const imageModules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/archive-images/**/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
)

export async function imageMetadata(assetPath: string): Promise<ImageMetadata | undefined> {
  const key = assetPath.replace('/archive-images/', '/src/assets/archive-images/')
  return (await imageModules[key]?.())?.default
}

export async function canOptimize(assetPath: string) {
  return Boolean(await imageMetadata(assetPath))
}
