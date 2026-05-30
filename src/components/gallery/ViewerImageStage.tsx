import type { CSSProperties, MouseEvent, PointerEvent, RefObject, WheelEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, Download, ExternalLink, Maximize2, Minimize2, RotateCcw, Scaling, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { GallerySlideshowControls } from './GallerySlideshow'
import { IMAGE_ZOOM_MAX, IMAGE_ZOOM_MIN, IMAGE_ZOOM_STEP, ZOOM_LENS_SIZE, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, type ImageScaleMode } from './useImageZoomPan'
import { formatImagePostDateTime, imageNumberLabel, type GalleryImageRecord as ImageRecord } from '../../lib/imageGallerySession'
import type { SlideshowMode } from './useGallerySlideshow'

export const IMAGE_SCALE_OPTIONS: Array<{ value: ImageScaleMode; label: string; description: string }> = [
  { value: 'fit', label: 'Passend', description: 'Toon de volledige foto binnen het venster.' },
  { value: 'width', label: 'Breedte passend', description: 'Maak de foto zo breed als het kijkvlak; verticaal scrollen kan.' },
  { value: 'height', label: 'Hoogte passend', description: 'Gebruik de beschikbare hoogte, handig voor panorama’s.' },
  { value: 'cover', label: 'Vullen', description: 'Vul het hele kijkvlak zoals CSS cover; randen kunnen wegvallen.' },
  { value: 'original', label: 'Origineel formaat', description: 'Gebruik de echte pixelgrootte en scroll indien nodig.' },
]

export function isImageScaleMode(value: string | null): value is ImageScaleMode {
  return IMAGE_SCALE_OPTIONS.some((option) => option.value === value)
}

function imageViewportClassName(scaleMode: ImageScaleMode, imageZoom: number) {
  if (scaleMode === 'cover') return 'absolute inset-0 grid place-items-center overflow-hidden'
  if (imageZoom > IMAGE_ZOOM_MIN) return 'absolute inset-0 grid place-items-center overflow-hidden p-4 lg:p-8'
  if (scaleMode === 'width' || scaleMode === 'original') return 'absolute inset-0 overflow-auto p-4 lg:p-8'
  return 'absolute inset-0 grid place-items-center overflow-hidden p-4 lg:p-8'
}

function imageElementClassName(scaleMode: ImageScaleMode, zoomEnabled: boolean, imageZoom: number) {
  const interaction = zoomEnabled ? ' cursor-none select-none' : imageZoom > IMAGE_ZOOM_MIN || scaleMode === 'cover' ? ' cursor-grab select-none touch-none active:cursor-grabbing' : ''
  if (scaleMode === 'cover') return `block h-full w-full max-w-none object-cover${interaction}`
  if (scaleMode === 'width') return `block h-auto w-full max-w-none object-contain${interaction}`
  if (scaleMode === 'height') return `block h-full w-auto max-w-none object-contain${interaction}`
  if (scaleMode === 'original') return `block h-auto w-auto max-w-none object-contain${interaction}`
  return `block h-auto w-auto max-h-full max-w-full object-contain${interaction}`
}

type Props = {
  filteredCount: number
  imageScaleMode: ImageScaleMode
  imageStyle?: CSSProperties
  imageZoom: number
  imageZoomChanged: boolean
  imageZoomLabel: string
  nextImage: ImageRecord | null
  previousImage: ImageRecord | null
  slideshowMode: SlideshowMode
  slideshowSeconds: number
  viewerFullscreen: boolean
  viewerImage: ImageRecord
  viewerImageFullSrc: string
  viewerImageRef: RefObject<HTMLImageElement | null>
  viewerImageStageRef: RefObject<HTMLDivElement | null>
  zoomEnabled: boolean
  zoomLensRef: RefObject<HTMLDivElement | null>
  zoomValue: number
  zoomValueLabel: string
  onCaptureZoomRects: (image: HTMLImageElement) => void
  onDownload: () => void
  onFinishPan: (event: PointerEvent<HTMLImageElement>) => void
  onImageDoubleClick: (event: MouseEvent<HTMLImageElement>) => void
  onImageLoad: (size: { width: number; height: number }) => void
  onImagePointerDown: (event: PointerEvent<HTMLImageElement>) => void
  onImagePointerMove: (event: PointerEvent<HTMLImageElement>) => void
  onImageWheel: (event: WheelEvent<HTMLImageElement>) => void
  onOpenImage: (imageId: string) => void
  onResetZoom: () => void
  onScaleModeChange: (mode: ImageScaleMode) => void
  onSetImageZoomAt: (zoom: number) => void
  onSetZoomEnabled: (updater: (current: boolean) => boolean) => void
  onSetZoomValue: (value: number) => void
  onSlideshowModeChange: (mode: SlideshowMode) => void
  onSlideshowSecondsChange: (seconds: number) => void
  onStartSlideshow: () => void
  onToggleFullscreen: () => void
  onHideZoomLens: () => void
}

export default function ViewerImageStage({
  filteredCount,
  imageScaleMode,
  imageStyle,
  imageZoom,
  imageZoomChanged,
  imageZoomLabel,
  nextImage,
  previousImage,
  slideshowMode,
  slideshowSeconds,
  viewerFullscreen,
  viewerImage,
  viewerImageFullSrc,
  viewerImageRef,
  viewerImageStageRef,
  zoomEnabled,
  zoomLensRef,
  zoomValue,
  zoomValueLabel,
  onCaptureZoomRects,
  onDownload,
  onFinishPan,
  onHideZoomLens,
  onImageDoubleClick,
  onImageLoad,
  onImagePointerDown,
  onImagePointerMove,
  onImageWheel,
  onOpenImage,
  onResetZoom,
  onScaleModeChange,
  onSetImageZoomAt,
  onSetZoomEnabled,
  onSetZoomValue,
  onSlideshowModeChange,
  onSlideshowSecondsChange,
  onStartSlideshow,
  onToggleFullscreen,
}: Props) {
  const currentScaleOption = IMAGE_SCALE_OPTIONS.find((option) => option.value === imageScaleMode) ?? IMAGE_SCALE_OPTIONS[0]

  return (
    <div ref={viewerImageStageRef} className="relative min-h-[72svh] w-full min-w-0 overflow-hidden border-b border-chalk bg-powder/40 lg:min-h-0 lg:border-b-0 lg:border-r">
      <div className={imageViewportClassName(imageScaleMode, imageZoom)} onScroll={onHideZoomLens}>
        <img
          ref={viewerImageRef}
          className={`${imageElementClassName(imageScaleMode, zoomEnabled, imageZoom)} touch-none`}
          style={imageStyle}
          src={viewerImageFullSrc}
          alt={viewerImage.caption || viewerImage.postTitle}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          draggable={false}
          onLoad={(event) => onImageLoad({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onWheel={onImageWheel}
          onPointerEnter={(event) => { if (zoomEnabled) onCaptureZoomRects(event.currentTarget) }}
          onDoubleClick={onImageDoubleClick}
          onPointerDown={onImagePointerDown}
          onPointerMove={onImagePointerMove}
          onPointerUp={onFinishPan}
          onPointerLeave={(event) => { onFinishPan(event); onHideZoomLens() }}
          onPointerCancel={(event) => { onFinishPan(event); onHideZoomLens() }}
        />
      </div>
      {zoomEnabled && (
        <div
          ref={zoomLensRef}
          className="pointer-events-none absolute left-0 top-0 z-20 rounded-full border border-eggshell/95 bg-no-repeat opacity-0 shadow-[0_18px_60px_rgba(19,24,32,0.34),inset_0_0_0_1px_rgba(19,24,32,0.25)] ring-1 ring-obsidian/20 will-change-transform"
          style={{ width: ZOOM_LENS_SIZE, height: ZOOM_LENS_SIZE, backgroundImage: `url(\"${viewerImageFullSrc.replace(/\"/g, '\\\"')}\")` }}
          aria-hidden="true"
        />
      )}
      {viewerFullscreen && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-[min(34rem,calc(100%-2rem))] rounded-2xl border border-eggshell/20 bg-obsidian/75 px-4 py-3 text-eggshell shadow-soft backdrop-blur">
          <p className="m-0 line-clamp-2 text-sm font-medium leading-5">{viewerImage.caption || viewerImage.postTitle}</p>
          <p className="m-0 mt-1 text-xs text-eggshell/70">{formatImagePostDateTime(viewerImage)}{imageNumberLabel(viewerImage)}</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex min-w-0 justify-center lg:inset-x-4 lg:top-4">
        <div className="pointer-events-auto flex max-w-full flex-nowrap items-center justify-start gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-full border border-chalk bg-eggshell/95 px-3 py-2 text-sm text-obsidian shadow-soft [scrollbar-width:none] backdrop-blur [&::-webkit-scrollbar]:hidden lg:max-w-[min(calc(100vw-12rem),80rem)] [&_svg]:size-4" role="toolbar" aria-label="Beeldviewer acties">
          <GallerySlideshowControls mode={slideshowMode} seconds={slideshowSeconds} disabled={filteredCount === 0} onModeChange={onSlideshowModeChange} onSecondsChange={onSlideshowSecondsChange} onStart={onStartSlideshow} />
          <Button className="h-10 w-10 shrink-0 px-0" variant="outline" size="icon" type="button" onClick={onToggleFullscreen} aria-label={viewerFullscreen ? 'Verlaat volledig scherm' : 'Volledig scherm'} title={viewerFullscreen ? 'Verlaat volledig scherm' : 'Volledig scherm'}>
            {viewerFullscreen ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10 shrink-0 gap-2 px-4 max-sm:hidden" variant="outline" size="sm" type="button" title={`Schaal: ${currentScaleOption.label}`}>
                <Scaling className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">{currentScaleOption.label}</span><ChevronDown className="size-3" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-72 border border-chalk bg-eggshell text-obsidian">
              <DropdownMenuLabel>Afbeelding schalen</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={imageScaleMode} onValueChange={(value) => { if (isImageScaleMode(value)) onScaleModeChange(value) }}>
                {IMAGE_SCALE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem className="items-start gap-2 px-2 py-2 pr-8" key={option.value} value={option.value}>
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium leading-4">{option.label}</span>
                      <span className="text-xs leading-4 text-gravel">{option.description}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-chalk bg-pure-surface px-2" role="group" aria-label="Afbeelding in- en uitzoomen">
            <Button className="size-8 px-0" variant="ghost" size="icon" type="button" onClick={() => onSetImageZoomAt(imageZoom - IMAGE_ZOOM_STEP)} disabled={imageZoom <= IMAGE_ZOOM_MIN} aria-label="Zoom uit" title="Zoom uit">
              <ZoomOut className="size-4" aria-hidden="true" />
            </Button>
            <span className="min-w-12 text-center font-mono text-sm text-gravel" aria-live="polite">{imageZoomLabel}</span>
            <Button className="size-8 px-0" variant="ghost" size="icon" type="button" onClick={() => onSetImageZoomAt(imageZoom + IMAGE_ZOOM_STEP)} disabled={imageZoom >= IMAGE_ZOOM_MAX} aria-label="Zoom in" title="Zoom in">
              <ZoomIn className="size-4" aria-hidden="true" />
            </Button>
            {imageZoomChanged && (
              <Button className="size-8 px-0" variant="ghost" size="icon" type="button" onClick={onResetZoom} aria-label="Reset zoom" title="Reset zoom">
                <RotateCcw className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <Button className="h-10 shrink-0 gap-2 px-4 max-sm:hidden" variant={zoomEnabled ? 'default' : 'outline'} size="sm" type="button" aria-pressed={zoomEnabled} aria-label="Vergrootglas" title="Vergrootglas" onClick={() => onSetZoomEnabled((current) => { if (!current) onResetZoom(); return !current })}>
            <ZoomIn className="size-4" aria-hidden="true" /> <span className="hidden 2xl:inline">Vergrootglas</span>
          </Button>
          <Button className="h-10 w-10 shrink-0 px-0" variant="outline" size="icon" type="button" onClick={onDownload} aria-label="Download originele afbeelding" title="Download originele afbeelding">
            <Download className="size-4" aria-hidden="true" />
          </Button>
          <Button className="h-10 w-10 shrink-0 px-0" variant="outline" size="icon" asChild>
            <a href={viewerImageFullSrc} target="_blank" rel="noreferrer" aria-label="Open afbeelding in nieuw tabblad" title="Open afbeelding in nieuw tabblad">
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
          {zoomEnabled && (
            <label className="flex shrink-0 items-center gap-2 pl-1">
              <span className="sr-only">Zoomwaarde</span>
              <input className="h-1 w-32 accent-obsidian md:w-44" type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} value={zoomValue} onChange={(event) => onSetZoomValue(Number(event.currentTarget.value))} />
              <span className="w-10 text-right font-mono text-xs">{zoomValueLabel}×</span>
            </label>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-30 flex items-center justify-between px-3 lg:px-5">
        <button className="pointer-events-auto inline-grid size-11 place-items-center rounded-full border border-chalk bg-eggshell/90 text-obsidian shadow-soft backdrop-blur transition hover:border-slate hover:bg-eggshell disabled:opacity-30" type="button" disabled={!previousImage} onClick={() => previousImage && onOpenImage(previousImage.id)} aria-label="Vorige afbeelding">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <button className="pointer-events-auto inline-grid size-11 place-items-center rounded-full border border-chalk bg-eggshell/90 text-obsidian shadow-soft backdrop-blur transition hover:border-slate hover:bg-eggshell disabled:opacity-30" type="button" disabled={!nextImage} onClick={() => nextImage && onOpenImage(nextImage.id)} aria-label="Volgende afbeelding">
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
