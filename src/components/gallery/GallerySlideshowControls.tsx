import { Calendar, Play, Shuffle, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SLIDESHOW_SECONDS_MAX, SLIDESHOW_SECONDS_MIN, type SlideshowMode } from './useGallerySlideshow'

type ControlsProps = {
  mode: SlideshowMode
  seconds: number
  disabled?: boolean
  onModeChange: (mode: SlideshowMode) => void
  onSecondsChange: (seconds: number) => void
  onStart: () => void
}

export function GallerySlideshowControls({ mode, seconds, disabled, onModeChange, onSecondsChange, onStart }: ControlsProps) {
  return (
    <>
      <Select value={mode} onValueChange={(value) => onModeChange(value as SlideshowMode)}>
        <SelectTrigger size="sm" className="hidden h-10 w-44 shrink-0 border border-chalk px-3 text-sm text-obsidian sm:inline-flex [&_svg]:size-4">
          <span className="sr-only">Diashow volgorde</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[250]">
          <SelectItem value="chronological"><Calendar className="size-4" aria-hidden="true" /> Chronologisch</SelectItem>
          <SelectItem value="random"><Shuffle className="size-4" aria-hidden="true" /> Willekeurig</SelectItem>
        </SelectContent>
      </Select>
      <label className="hidden h-10 shrink-0 items-center gap-2 rounded-full border border-chalk px-3 text-sm text-obsidian sm:inline-flex">
        <Timer className="size-4" aria-hidden="true" />
        <span className="sr-only">Seconden per beeld</span>
        <Input className="h-9 w-9 border-0 bg-transparent p-0 text-right font-mono text-sm" type="number" min={SLIDESHOW_SECONDS_MIN} max={SLIDESHOW_SECONDS_MAX} step="1" value={seconds} onChange={(event) => onSecondsChange(Number(event.currentTarget.value))} />
        sec
      </label>
      <Button className="h-10 shrink-0 gap-2 px-4" size="sm" type="button" disabled={disabled} onClick={onStart}>
        <Play className="size-4" aria-hidden="true" /> Diashow
      </Button>
    </>
  )
}
