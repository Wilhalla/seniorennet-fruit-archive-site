import { RotateCcw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GalleryGroups } from '../../lib/imageGallerySession'

type GalleryHeaderProps = {
  filteredCount: number
  plantCount: number
  peopleCount: number
  sortNewest: boolean
  onSortNewestChange: (sortNewest: boolean) => void
}

type GalleryFilterControlsProps = {
  groups: GalleryGroups
  hasActiveFilters: boolean
  query: string
  season: string
  theme: string
  onQueryChange: (query: string) => void
  onReset: () => void
  onSeasonChange: (season: string) => void
  onThemeChange: (theme: string) => void
}

export function GalleryHeader({ filteredCount, peopleCount, plantCount, sortNewest, onSortNewestChange }: GalleryHeaderProps) {
  return (
    <header className="grid gap-6 border-b border-chalk pb-7 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="eyebrow mb-3">Beeldarchief</p>
        <h1 className="display-title max-w-3xl break-words">Beeldarchief</h1>
        <p className="m-0 mt-3 max-w-2xl text-sm leading-6 text-gravel">
          {filteredCount.toLocaleString('nl-BE')} foto’s · {peopleCount} met personen · {plantCount.toLocaleString('nl-BE')} met planten
        </p>
      </div>
      <label className="flex items-center gap-2 self-end text-sm text-gravel">
        Sorteer
        <select
          className="min-h-9 rounded-full border border-chalk bg-transparent px-3 text-sm text-obsidian outline-none"
          value={sortNewest ? 'new' : 'old'}
          onChange={(event) => onSortNewestChange(event.target.value === 'new')}
        >
          <option value="new">Nieuw → Oud</option>
          <option value="old">Oud → Nieuw</option>
        </select>
      </label>
    </header>
  )
}

export function GalleryFilterControls({
  groups,
  hasActiveFilters,
  query,
  season,
  theme,
  onQueryChange,
  onReset,
  onSeasonChange,
  onThemeChange,
}: GalleryFilterControlsProps) {
  return (
    <section className="border-b border-chalk py-5" aria-label="Beeldarchief filters">
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1.5fr)_repeat(2,minmax(10rem,1fr))_2.5rem]">
        <label className="flex min-h-10 min-w-0 items-center gap-2 border-b border-chalk px-0 lg:border-b-0 lg:border-r lg:pr-4">
          <Search className="size-4 shrink-0 text-gravel" aria-hidden="true" />
          <Input
            className="h-10 border-0 bg-transparent px-0 text-sm shadow-none outline-none placeholder:text-gravel/70 focus-visible:ring-0"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Zoek plaats, persoon, onderwerp…"
          />
        </label>
        <Select value={theme} onValueChange={onThemeChange}>
          <SelectTrigger className="h-10 rounded-none border-b border-chalk px-0 lg:border-b-0 lg:border-r lg:px-3">
            <SelectValue placeholder="Thema" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle thema’s</SelectItem>
            {groups.themes.map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={season} onValueChange={onSeasonChange}>
          <SelectTrigger className="h-10 rounded-none border-b border-chalk px-0 lg:border-b-0 lg:px-3">
            <SelectValue placeholder="Seizoen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle seizoenen</SelectItem>
            <SelectItem value="lente">Voorjaar</SelectItem>
            <SelectItem value="zomer">Zomer</SelectItem>
            <SelectItem value="herfst">Herfst</SelectItem>
            <SelectItem value="winter">Winter</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <button className="inline-grid size-10 place-items-center rounded-full text-gravel hover:bg-powder hover:text-obsidian" type="button" onClick={onReset} aria-label="Filters resetten" title="Filters resetten">
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}
