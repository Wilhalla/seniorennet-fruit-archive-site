import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

export type ArchiveViewMode = 'aggregated' | 'all'

interface Props {
  mode: ArchiveViewMode
  aggregatedCount: number
  allCount: number
  onChange: (mode: ArchiveViewMode) => void
}

const modes = [
  {
    value: 'aggregated',
    label: 'Samengevoegd',
    description: 'Bundelt vervolg-, aanvulling- en deelberichten tot één reeks, zodat lange verhalen als één bericht verschijnen.',
  },
  {
    value: 'all',
    label: 'Losse berichten',
    description: 'Toont elk oorspronkelijk geïmporteerd blogbericht apart, ook vervolg-, aanvulling- en deelberichten.',
  },
] as const

export default function ArchiveViewToggle({ mode, aggregatedCount, allCount, onChange }: Props) {
  return (
    <TooltipProvider>
      <div className="inline-flex rounded-full bg-pure-surface p-1 shadow-soft" role="group" aria-label="Kies archiefweergave">
        {modes.map((item) => (
          <Tooltip key={item.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm text-slate-ink transition-colors hover:bg-powder hover:text-obsidian aria-pressed:bg-obsidian aria-pressed:text-eggshell aria-pressed:hover:bg-obsidian aria-pressed:hover:text-eggshell"
                aria-pressed={mode === item.value}
                onClick={() => onChange(item.value)}
              >
                {item.label} <span className="font-mono">{(item.value === 'aggregated' ? aggregatedCount : allCount).toLocaleString('nl-BE')}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} className="max-w-72 text-center leading-snug">
              {item.description}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}
