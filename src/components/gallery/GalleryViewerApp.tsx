import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowLeft, ExternalLink, X } from 'lucide-react'
import { GallerySlideshowOverlay, useGallerySlideshow } from './GallerySlideshow'
import ViewerSidebar from './ViewerSidebar'
import { useGallerySpeciesTags } from './galleryClientHooks'
import { useCenteredVirtualItem, useElementSize, useFullscreenState, useGalleryViewerData, useGalleryViewerUrlState, useImageNeighborPrefetch, useRelatedGalleryImages, useSlideshowRouteSync, useStoredPreference, useViewerKeyboardNavigation, type ImageSize } from './galleryViewerHooks'
import ViewerImageStage, { isImageScaleMode } from './ViewerImageStage'
import { useDismissHydrationLoader } from './useGracefulLoader'
import { useImageZoomPan } from './useImageZoomPan'
import { sameOriginReferrer, writeBrowserPath } from '../../lib/browserHistory'
import { buildImageGallerySession, formatImagePostDateTime, gallerySlideshowPageUrl, galleryUrlFromState, galleryViewerPageUrl, imageDownloadFilename, imageFullSrc, imageNumberLabel, type GalleryImageRecord as ImageRecord } from '../../lib/imageGallerySession'

type Props = {
  initialImages?: ImageRecord[]
}

const IMAGE_SCALE_STORAGE_KEY = 'fruit-gallery-viewer-scale-mode'

export default function GalleryViewerApp({ initialImages = [] }: Props) {
  const { filters, slideshowRequestedId, setSlideshowRequestedId, slideshowRouteRef, urlStateReady, viewerId, setViewerId } = useGalleryViewerUrlState()
  const hasRequestedImage = Boolean(viewerId)
  const { fullIndexLoaded, images, imagesLoading } = useGalleryViewerData(initialImages, hasRequestedImage)
  const { related, relatedLoading } = useRelatedGalleryImages(hasRequestedImage)
  const { speciesByImage } = useGallerySpeciesTags(filters)
  const [viewerNaturalSize, setViewerNaturalSize] = useState<(ImageSize & { imageId: string }) | null>(null)
  const { value: imageScaleMode, setValue: setImageScaleMode } = useStoredPreference(IMAGE_SCALE_STORAGE_KEY, 'fit', isImageScaleMode)
  const viewerImageStageRef = useRef<HTMLDivElement>(null)
  const viewerImageRef = useRef<HTMLImageElement>(null)
  const viewerTimelineRef = useRef<HTMLDivElement>(null)
  const viewerFullscreen = useFullscreenState(viewerImageStageRef)
  const viewerStageSize = useElementSize(viewerImageStageRef, viewerId)

  const gallerySession = useMemo(() => buildImageGallerySession({ images, filters, speciesByImage, viewerId, related }), [images, filters, speciesByImage, viewerId, related])
  const imageById = gallerySession.imageById
  const filtered = gallerySession.filtered
  const viewerImage = gallerySession.viewerImage
  const viewerImageFullSrc = viewerImage ? imageFullSrc(viewerImage) : ''
  const naturalSizeForViewer = viewerNaturalSize?.imageId === viewerImage?.id ? viewerNaturalSize : null
  const viewerImageSize = viewerImage ? { width: viewerImage.width || naturalSizeForViewer?.width || 0, height: viewerImage.height || naturalSizeForViewer?.height || 0 } : { width: 0, height: 0 }
  const {
    captureZoomRects,
    finishViewerImagePan,
    handleViewerImageDoubleClick,
    handleViewerImagePointerDown,
    handleViewerImagePointerMove,
    handleViewerImageWheel,
    hideZoomLens,
    imageStyle: viewerImageStyle,
    imageZoom,
    imageZoomChanged,
    imageZoomLabel,
    resetImageZoom,
    setImageZoomAt,
    setZoomEnabled,
    setZoomValue,
    zoomEnabled,
    zoomLensRef,
    zoomValue,
    zoomValueLabel,
  } = useImageZoomPan({
    imageId: viewerImage?.id,
    imageScaleMode,
    imageSize: viewerImageSize,
    imageRef: viewerImageRef,
    stageRef: viewerImageStageRef,
    stageSize: viewerStageSize,
  })
  const viewerIndex = gallerySession.viewerIndex
  const previousImage = gallerySession.previousImage
  const nextImage = gallerySession.nextImage
  const similarImages = gallerySession.relatedImages
  const viewerLoading = !urlStateReady || (hasRequestedImage && !viewerImage && !fullIndexLoaded)
  const viewerTimelineVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => viewerTimelineRef.current,
    estimateSize: () => 188,
    horizontal: true,
    overscan: 12,
    getItemKey: (index) => filtered[index]?.id ?? index,
  })
  const slideshow = useGallerySlideshow(filtered, imageById, viewerImage, { onEscape: exitSlideshowToGallery })
  const slideshowImageFullSrc = slideshow.image ? imageFullSrc(slideshow.image) : ''
  const slideshowImageMeta = slideshow.image ? formatImagePostDateTime(slideshow.image) : ''
  const slideshowPreloadSrcs = slideshow.preloadImages.map(imageFullSrc)

  function hrefFor(imageId: string) {
    return galleryViewerPageUrl({ ...filters, viewerId: imageId })
  }

  function galleryHref() {
    return galleryUrlFromState('/gallery/', { ...filters, viewerId: null })
  }

  function slideshowHrefFor(imageId: string) {
    return gallerySlideshowPageUrl({ ...filters, viewerId: imageId })
  }

  function replaceViewerImage(imageId: string) {
    setViewerId(imageId)
    hideZoomLens()
    const nextUrl = hrefFor(imageId)
    writeBrowserPath(nextUrl, 'replace')
  }

  function goBackToGallery() {
    if (sameOriginReferrer()) {
      window.history.back()
      return
    }
    window.location.href = '/gallery/'
  }

  function startSlideshow() {
    if (!viewerImage) return
    setZoomEnabled(false)
    hideZoomLens()
    const nextUrl = slideshowHrefFor(viewerImage.id)
    writeBrowserPath(nextUrl, 'push')
    slideshowRouteRef.current = true
    setSlideshowRequestedId(viewerImage.id)
    slideshow.start(viewerImage.id)
  }

  function closeSlideshow() {
    const imageId = slideshow.image?.id ?? viewerImage?.id
    slideshowRouteRef.current = false
    setSlideshowRequestedId(null)
    slideshow.stop()
    if (imageId) {
      setViewerId(imageId)
      writeBrowserPath(hrefFor(imageId), 'replace')
    }
  }

  function toggleViewerFullscreen() {
    const stage = viewerImageStageRef.current
    if (!stage) return
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
      return
    }
    void stage.requestFullscreen?.().catch(() => {})
  }

  function exitSlideshowToGallery() {
    slideshowRouteRef.current = false
    setSlideshowRequestedId(null)
    slideshow.stop()
    window.location.href = galleryHref()
  }

  useSlideshowRouteSync({
    filteredCount: filtered.length,
    filters,
    imageById,
    requestedId: slideshowRequestedId,
    routeRef: slideshowRouteRef,
    setRequestedId: setSlideshowRequestedId,
    slideshowActive: slideshow.active,
    slideshowImageId: slideshow.image?.id,
    slideshowMode: slideshow.mode,
    showImage: slideshow.showImage,
    stop: slideshow.stop,
    slideshowHrefFor,
  })

  async function downloadViewerImage() {
    if (!viewerImage) return

    const filename = imageDownloadFilename(viewerImage)
    try {
      const response = await fetch(imageFullSrc(viewerImage))
      if (!response.ok) throw new Error(`Download failed: ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      console.error(error)
      const link = document.createElement('a')
      link.href = imageFullSrc(viewerImage)
      link.download = filename
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
  }

  useViewerKeyboardNavigation({
    enabled: Boolean(viewerImage && !slideshow.active),
    onEscape: goBackToGallery,
    onPrevious: previousImage ? () => replaceViewerImage(previousImage.id) : undefined,
    onNext: nextImage ? () => replaceViewerImage(nextImage.id) : undefined,
  })

  useCenteredVirtualItem({
    enabled: Boolean(viewerImage),
    index: viewerIndex,
    itemSize: 188,
    scrollerRef: viewerTimelineRef,
    virtualizer: viewerTimelineVirtualizer,
  })

  useImageNeighborPrefetch(viewerImage, previousImage, nextImage)
  useDismissHydrationLoader('gallery-viewer-hydration-loader', viewerLoading)

  if (viewerLoading) {
    return <main className="min-h-[calc(100svh-4rem)] bg-eggshell" aria-hidden="true" />
  }

  if (!viewerId) {
    return (
      <main className="site-shell py-16 text-midnight-navy">
        <h1 className="display-title">Geen beeld gekozen</h1>
        <a className="mt-6 inline-flex min-h-10 items-center rounded-full border border-obsidian px-4 text-sm font-medium no-underline" href="/gallery/">Naar het beeldarchief</a>
      </main>
    )
  }

  if (!viewerImage) {
    if (slideshowRequestedId) {
      return (
        <main className="grid min-h-[100svh] place-items-center bg-black text-eggshell">
          <p className="m-0 text-sm text-eggshell/70">Diashow laden…</p>
        </main>
      )
    }

    return (
      <main className="site-shell py-16 text-midnight-navy">
        <h1 className="display-title">{imagesLoading ? 'Beeld laden…' : 'Beeld niet gevonden'}</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-gravel">{imagesLoading ? 'We zoeken de foto in het beeldarchief.' : 'Deze link verwijst naar een beeld dat niet in de index staat.'}</p>
        <a className="mt-6 inline-flex min-h-10 items-center rounded-full border border-obsidian px-4 text-sm font-medium no-underline" href="/gallery/">Naar het beeldarchief</a>
      </main>
    )
  }

  if (slideshowRequestedId && !slideshow.active) {
    return (
      <main className="grid min-h-[100svh] place-items-center bg-black text-eggshell">
        <p className="m-0 text-sm text-eggshell/70">Diashow laden…</p>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100svh-4rem)] w-full overflow-x-hidden bg-eggshell text-midnight-navy lg:flex lg:h-[calc(100svh-4rem)] lg:max-h-[calc(100svh-4rem)] lg:flex-col lg:overflow-hidden">
      <header className="sticky top-14 z-40 flex h-14 shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-chalk bg-eggshell/95 px-4 backdrop-blur md:px-6 lg:static">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-medium text-obsidian">{viewerImage.postTitle}</p>
          <p className="m-0 text-xs text-gravel">{formatImagePostDateTime(viewerImage)}{imageNumberLabel(viewerImage)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="hidden min-h-9 items-center gap-2 rounded-full border border-chalk px-3 text-sm text-obsidian hover:border-slate md:inline-flex" type="button" onClick={goBackToGallery}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Terug
          </button>
          <a className="inline-flex min-h-9 items-center gap-2 rounded-full border border-obsidian bg-obsidian px-3 text-sm font-medium text-eggshell no-underline hover:text-eggshell" href={`/posts/${viewerImage.postSlug}/`}>
            Lees artikel <ExternalLink className="size-4" aria-hidden="true" />
          </a>
          <button className="inline-grid size-9 place-items-center rounded-full border border-chalk text-obsidian hover:border-slate" type="button" onClick={goBackToGallery} aria-label="Sluit beeldviewer"><X className="size-4" aria-hidden="true" /></button>
        </div>
      </header>

      <div className="block w-full min-w-0 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1 lg:overflow-hidden">
        <ViewerImageStage
          filteredCount={filtered.length}
          imageScaleMode={imageScaleMode}
          imageStyle={viewerImageStyle}
          imageZoom={imageZoom}
          imageZoomChanged={imageZoomChanged}
          imageZoomLabel={imageZoomLabel}
          nextImage={nextImage}
          previousImage={previousImage}
          slideshowMode={slideshow.mode}
          slideshowSeconds={slideshow.seconds}
          viewerFullscreen={viewerFullscreen}
          viewerImage={viewerImage}
          viewerImageFullSrc={viewerImageFullSrc}
          viewerImageRef={viewerImageRef}
          viewerImageStageRef={viewerImageStageRef}
          zoomEnabled={zoomEnabled}
          zoomLensRef={zoomLensRef}
          zoomValue={zoomValue}
          zoomValueLabel={zoomValueLabel}
          onCaptureZoomRects={captureZoomRects}
          onDownload={downloadViewerImage}
          onFinishPan={finishViewerImagePan}
          onHideZoomLens={hideZoomLens}
          onImageDoubleClick={handleViewerImageDoubleClick}
          onImageLoad={(size) => setViewerNaturalSize({ imageId: viewerImage.id, ...size })}
          onImagePointerDown={handleViewerImagePointerDown}
          onImagePointerMove={handleViewerImagePointerMove}
          onImageWheel={handleViewerImageWheel}
          onOpenImage={replaceViewerImage}
          onResetZoom={resetImageZoom}
          onScaleModeChange={setImageScaleMode}
          onSetImageZoomAt={setImageZoomAt}
          onSetZoomEnabled={setZoomEnabled}
          onSetZoomValue={setZoomValue}
          onSlideshowModeChange={slideshow.setMode}
          onSlideshowSecondsChange={slideshow.setSeconds}
          onStartSlideshow={startSlideshow}
          onToggleFullscreen={toggleViewerFullscreen}
        />

        <ViewerSidebar
          filtered={filtered}
          relatedLoading={relatedLoading}
          similarImages={similarImages}
          timelineRef={viewerTimelineRef}
          timelineVirtualizer={viewerTimelineVirtualizer}
          viewerImage={viewerImage}
          viewerIndex={viewerIndex}
          onSelectImage={replaceViewerImage}
        />
      </div>

      {slideshow.active && (
        <GallerySlideshowOverlay
          image={slideshow.image}
          imageSrc={slideshowImageFullSrc}
          imageMeta={slideshowImageMeta}
          preloadSrcs={slideshowPreloadSrcs}
          index={slideshow.index}
          count={slideshow.count}
          mode={slideshow.mode}
          seconds={slideshow.seconds}
          paused={slideshow.paused}
          onModeChange={slideshow.setMode}
          onSecondsChange={slideshow.setSeconds}
          onTogglePaused={slideshow.togglePaused}
          onPrevious={slideshow.previous}
          onNext={slideshow.next}
          onClose={closeSlideshow}
        />
      )}
    </main>
  )
}
