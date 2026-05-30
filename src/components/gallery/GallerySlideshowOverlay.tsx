import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Calendar, ExternalLink, Maximize2, Minimize2, Pause, Pin, PinOff, Play, Shuffle, Timer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SLIDESHOW_SECONDS_MAX, SLIDESHOW_SECONDS_MIN, type GallerySlideshowImage, type SlideshowMode } from './useGallerySlideshow'

const SLIDESHOW_FADE_MS = 700

type OverlayProps = {
  image: GallerySlideshowImage | null
  imageSrc: string
  imageMeta: string
  preloadSrcs?: string[]
  index: number
  count: number
  mode: SlideshowMode
  seconds: number
  onModeChange: (mode: SlideshowMode) => void
  onSecondsChange: (seconds: number) => void
  paused: boolean
  onTogglePaused: () => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}

function preloadImage(src: string) {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  return image.decode?.().catch(() => undefined) ?? Promise.resolve()
}

type SlideshowSlideSnapshot = {
  id: string
  image: GallerySlideshowImage
  imageSrc: string
  imageMeta: string
  index: number
}

export function GallerySlideshowOverlay({ image, imageSrc, imageMeta, preloadSrcs = [], index, count, mode, seconds, paused, onModeChange, onSecondsChange, onTogglePaused, onPrevious, onNext, onClose }: OverlayProps) {
  const nextSlide = image ? { id: image.id, image, imageSrc, imageMeta, index } satisfies SlideshowSlideSnapshot : null
  const [currentSlide, setCurrentSlide] = useState<SlideshowSlideSnapshot | null>(nextSlide)
  const [previousSlide, setPreviousSlide] = useState<SlideshowSlideSnapshot | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [controlsPinned, setControlsPinned] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const currentSlideRef = useRef<SlideshowSlideSnapshot | null>(nextSlide)

  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement))
    updateFullscreenState()
    document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
      return
    }
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  useEffect(() => {
    preloadSrcs.forEach((preloadSrc) => {
      if (preloadSrc && preloadSrc !== imageSrc) void preloadImage(preloadSrc)
    })
  }, [imageSrc, preloadSrcs])

  useEffect(() => {
    if (!nextSlide) {
      currentSlideRef.current = null
      setCurrentSlide(null)
      setPreviousSlide(null)
      return undefined
    }

    let cancelled = false
    let timeout: number | undefined

    const showNextSlide = () => {
      if (cancelled) return
      const current = currentSlideRef.current
      if (!current) {
        currentSlideRef.current = nextSlide
        setCurrentSlide(nextSlide)
        return
      }

      if (current.id === nextSlide.id && current.imageSrc === nextSlide.imageSrc && current.index === nextSlide.index) {
        currentSlideRef.current = nextSlide
        setCurrentSlide(nextSlide)
        return
      }

      setPreviousSlide(current)
      currentSlideRef.current = nextSlide
      setCurrentSlide(nextSlide)
      timeout = window.setTimeout(() => setPreviousSlide(null), SLIDESHOW_FADE_MS)
    }

    void preloadImage(nextSlide.imageSrc).then(showNextSlide)

    return () => {
      cancelled = true
      if (timeout) window.clearTimeout(timeout)
    }
  }, [image?.id, imageSrc, imageMeta, index])

  useEffect(() => {
    if (controlsPinned) {
      setControlsVisible(true)
      return undefined
    }

    const showControls = () => {
      setControlsVisible(true)
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => setControlsVisible(false), 5000)
    }

    let timeout = window.setTimeout(() => setControlsVisible(false), 5000)
    const events: Array<keyof WindowEventMap> = ['mousemove', 'pointerdown', 'touchstart', 'keydown']
    events.forEach((eventName) => window.addEventListener(eventName, showControls, { passive: true }))
    return () => {
      window.clearTimeout(timeout)
      events.forEach((eventName) => window.removeEventListener(eventName, showControls))
    }
  }, [controlsPinned])

  if (!currentSlide) return null

  const FullscreenIcon = isFullscreen ? Minimize2 : Maximize2
  const PinIcon = controlsPinned ? PinOff : Pin
  const PlaybackIcon = paused ? Play : Pause
  const controlsVisibilityClass = controlsVisible || controlsPinned ? 'opacity-100' : 'pointer-events-none opacity-0'

  return (
    <div className="fixed inset-0 z-[200] bg-black text-eggshell" role="dialog" aria-modal="true" aria-label="Diashow">
      <header className={`absolute inset-x-0 top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-eggshell/15 bg-black/90 px-4 backdrop-blur transition-opacity duration-300 md:px-6 ${controlsVisibilityClass}`}>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="m-0 truncate text-sm font-medium text-eggshell">{currentSlide.image.caption || currentSlide.image.postTitle}</p>
            {currentSlide.image.postSlug && (
              <a className="inline-grid size-7 shrink-0 place-items-center rounded-full border border-eggshell/20 text-eggshell/75 no-underline transition hover:bg-eggshell/10 hover:text-eggshell" href={`/posts/${currentSlide.image.postSlug}/`} target="_blank" rel="noreferrer" aria-label="Open artikel in nieuw tabblad" title="Open artikel in nieuw tabblad">
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
          <p className="m-0 text-xs text-eggshell/65">{currentSlide.imageMeta} · {currentSlide.index + 1}/{count}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon-lg" className="border-eggshell/25 bg-transparent text-eggshell hover:bg-eggshell/10 hover:text-eggshell" type="button" onClick={() => setControlsPinned((current) => !current)} aria-pressed={controlsPinned} aria-label={controlsPinned ? 'Bediening automatisch verbergen' : 'Bediening zichtbaar houden'} title={controlsPinned ? 'Bediening automatisch verbergen' : 'Bediening zichtbaar houden'}>
            <PinIcon className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-lg" className="border-eggshell/25 bg-transparent text-eggshell hover:bg-eggshell/10 hover:text-eggshell" type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Verlaat volledig scherm' : 'Volledig scherm'} title={isFullscreen ? 'Verlaat volledig scherm' : 'Volledig scherm'}>
            <FullscreenIcon className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-lg" className="border-eggshell/25 bg-transparent text-eggshell hover:bg-eggshell/10 hover:text-eggshell" type="button" onClick={onClose} aria-label="Sluit diashow">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="absolute inset-0 z-0 grid place-items-center overflow-hidden bg-black p-0">
        <div className="relative h-full w-full">
          {previousSlide && (
            <img
              key={`previous-${previousSlide.id}-${previousSlide.index}`}
              className="absolute inset-0 h-full w-full animate-out bg-black object-contain shadow-[0_24px_90px_rgba(0,0,0,0.45)] duration-700 ease-in-out fade-out-0"
              src={previousSlide.imageSrc}
              alt=""
              aria-hidden="true"
              decoding="async"
            />
          )}
          <img
            key={`current-${currentSlide.id}-${currentSlide.index}`}
            className="absolute inset-0 h-full w-full animate-in bg-black object-contain shadow-[0_24px_90px_rgba(0,0,0,0.45)] duration-700 ease-in-out fade-in-0"
            src={currentSlide.imageSrc}
            alt={currentSlide.image.caption || currentSlide.image.postTitle}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <Button variant="outline" size="icon-lg" className={`absolute left-4 top-1/2 size-11 -translate-y-1/2 border-eggshell/25 bg-obsidian/55 text-eggshell backdrop-blur transition-opacity duration-300 hover:bg-eggshell/10 hover:text-eggshell disabled:opacity-30 ${controlsVisibilityClass}`} type="button" onClick={onPrevious} disabled={count < 2} aria-label="Vorige dia">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon-lg" className={`absolute right-4 top-1/2 size-11 -translate-y-1/2 border-eggshell/25 bg-obsidian/55 text-eggshell backdrop-blur transition-opacity duration-300 hover:bg-eggshell/10 hover:text-eggshell disabled:opacity-30 ${controlsVisibilityClass}`} type="button" onClick={onNext} disabled={count < 2} aria-label="Volgende dia">
          <ArrowRight className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <footer className={`absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-2 border-t border-eggshell/15 bg-black/90 px-4 py-3 text-sm backdrop-blur transition-opacity duration-300 ${controlsVisibilityClass}`}>
        <Button variant="outline" size="sm" className="h-9 gap-2 border-eggshell/20 bg-transparent px-3 text-xs text-eggshell hover:bg-eggshell/10 hover:text-eggshell" type="button" onClick={onTogglePaused} disabled={count < 2} aria-pressed={paused} aria-label={paused ? 'Diashow hervatten' : 'Diashow pauzeren'} title={paused ? 'Diashow hervatten' : 'Diashow pauzeren'}>
          <PlaybackIcon className="size-4" aria-hidden="true" /> {paused ? 'Hervatten' : 'Pauze'}
        </Button>
        <Select value={mode} onValueChange={(value) => onModeChange(value as SlideshowMode)}>
          <SelectTrigger size="sm" className="h-9 w-40 border border-eggshell/20 px-3 text-xs text-eggshell [&_svg]:text-eggshell">
            <span className="sr-only">Diashow volgorde</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[250]">
            <SelectItem value="chronological"><Calendar className="size-4" aria-hidden="true" /> Chronologisch</SelectItem>
            <SelectItem value="random"><Shuffle className="size-4" aria-hidden="true" /> Willekeurig</SelectItem>
          </SelectContent>
        </Select>
        <label className="inline-flex min-h-9 items-center gap-2 rounded-full border border-eggshell/20 px-3 text-xs text-eggshell">
          <Timer className="size-4" aria-hidden="true" />
          <span className="sr-only">Seconden per beeld</span>
          <Input className="h-8 w-10 border-0 bg-transparent p-0 text-right font-mono text-xs text-eggshell" type="number" min={SLIDESHOW_SECONDS_MIN} max={SLIDESHOW_SECONDS_MAX} step="1" value={seconds} onChange={(event) => onSecondsChange(Number(event.currentTarget.value))} />
          sec/beeld
        </label>
      </footer>
    </div>
  )
}
