import { useEffect, useMemo, useState } from 'react'

const monthLabels = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const seasonLabels = ['winter', 'winter', 'lente', 'lente', 'lente', 'zomer', 'zomer', 'zomer', 'herfst', 'herfst', 'herfst', 'winter']

type TopicCalendarRow = {
  topicId: string
  label: string
  generatedLabel: string
  postCount: number
  monthsAllYears: number[]
}

type TopicCalendar = {
  maxMonthCount: number
  topics: TopicCalendarRow[]
}

function shortTopic(label: string, fallback: string) {
  const source = label && label !== 'Nog te benoemen' ? label : fallback
  return source.split(',').slice(0, 2).join(' · ').toLowerCase()
}

function cellClass(value: number, max: number) {
  if (!value) return 'bg-data-chip text-transparent'
  const ratio = value / max
  if (ratio > 0.7) return 'bg-obsidian text-eggshell'
  if (ratio > 0.4) return 'bg-gravel text-eggshell'
  if (ratio > 0.2) return 'bg-powder text-obsidian'
  return 'bg-pure-surface text-obsidian'
}

type Props = { initialData?: TopicCalendar }

export default function TopicSeasonHeatmap({ initialData }: Props) {
  const [data, setData] = useState<TopicCalendar | null>(initialData ?? null)

  useEffect(() => {
    if (initialData) return
    fetch('/generated/topic-calendar.json')
      .then((response) => response.json())
      .then(setData)
      .catch(console.error)
  }, [initialData])

  const rows = useMemo(() => {
    if (!data) return []
    return data.topics
      .slice()
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, 14)
      .map((topic) => ({
        ...topic,
        displayLabel: shortTopic(topic.label, topic.generatedLabel),
        totalInView: topic.monthsAllYears.reduce((sum, value) => sum + value, 0),
      }))
  }, [data])

  const max = Math.max(1, data?.maxMonthCount ?? 1, ...rows.flatMap((row) => row.monthsAllYears))
  const grid = 'grid grid-cols-[minmax(10rem,14rem)_repeat(12,minmax(0,1.65rem))_3rem] items-center gap-2'

  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,1fr)]" aria-labelledby="topic-season-title">
      <div>
        <h2 id="topic-season-title" className="m-0 font-heading text-heading-sm font-light leading-heading-sm tracking-heading text-obsidian">Seizoensritme</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-gravel">Elke rij is een veelvoorkomend onderwerp. Elk vakje is een maand; het cijfer is het aantal berichten, donkerder betekent vaker.</p>
        <div className="mt-4 flex items-center gap-2 text-sm text-gravel" aria-hidden="true"><span className="size-4 rounded-md bg-data-chip" /> minder <i className="size-4 rounded-md bg-obsidian" /> meer</div>
      </div>

      <div className="min-w-0 overflow-x-auto py-2" role="img" aria-label="Mini heatmap van de grootste onderwerpen per maand">
        <div className={`${grid} text-xs font-medium text-slate-ink`} aria-hidden="true">
          <span />
          {seasonLabels.map((label, index) => <i className="not-italic" key={`${label}-${index}`}>{label.slice(0, 1)}</i>)}
          <span />
        </div>
        <div className={`${grid} my-3 text-xs font-medium text-ash-medium`} aria-hidden="true">
          <span>onderwerp</span>
          {monthLabels.map((month) => <b className="rotate-180 font-medium [writing-mode:vertical-rl]" key={month}>{month}</b>)}
          <strong className="justify-self-end font-medium">totaal</strong>
        </div>
        {data ? rows.map((row) => (
          <div className={`${grid} min-h-8`} key={row.topicId}>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-slate-ink" title={row.label}>{row.displayLabel}</span>
            {row.monthsAllYears.map((value, index) => (
              <span
                className={`grid size-7 place-items-center rounded-md font-mono text-xs transition-transform hover:scale-110 ${cellClass(value, max)}`}
                key={`${row.topicId}-${index}`}
                title={`${row.displayLabel} · ${monthLabels[index]} · ${value} berichten`}
              >
                {value || ''}
              </span>
            ))}
            <strong className="justify-self-end font-mono text-xs text-midnight-navy">{row.totalInView}</strong>
          </div>
        )) : (
          Array.from({ length: 12 }).map((_, row) => (
            <div className={`${grid} min-h-8`} key={row}>
              <span className="h-4 rounded bg-data-chip" />
              {monthLabels.map((month) => <span className="size-7 rounded-md bg-data-chip" key={month} />)}
              <strong className="justify-self-end font-mono text-xs text-midnight-navy">—</strong>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
