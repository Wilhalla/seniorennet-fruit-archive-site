import type { ImgHTMLAttributes } from 'react'
import { imageFullSrc, imageThumbSrc, type GalleryImageRecord } from '../../lib/imageGallerySession'
import { archiveThumbUrl } from '../../lib/assetUrls'

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
      srcSet={`${imageThumbSrc(image)} 240w, ${archiveThumbUrl(image.src)} 480w`}
      sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 50vw"
      data-fallback-src={fallbackSrc}
      alt={alt ?? (image.caption || image.postTitle)}
      onError={(event) => {
        event.currentTarget.onerror = null
        event.currentTarget.srcset = ''
        event.currentTarget.src = event.currentTarget.dataset.fallbackSrc || image.src
        onError?.(event)
      }}
    />
  )
}
