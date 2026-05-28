import type { ImgHTMLAttributes } from 'react'
import { imageFullSrc, imageThumbSrc, type GalleryImageRecord } from '../../lib/imageGallerySession'

type GalleryThumbnailImage = Pick<GalleryImageRecord, 'src' | 'caption' | 'postTitle'>

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  image: GalleryThumbnailImage
}

export default function GalleryThumbnail({ image, alt, onError, ...props }: Props) {
  const fallbackSrc = imageFullSrc(image)

  return (
    <img
      {...props}
      src={imageThumbSrc(image)}
      data-fallback-src={fallbackSrc}
      alt={alt ?? (image.caption || image.postTitle)}
      onError={(event) => {
        event.currentTarget.onerror = null
        event.currentTarget.src = event.currentTarget.dataset.fallbackSrc || image.src
        onError?.(event)
      }}
    />
  )
}
