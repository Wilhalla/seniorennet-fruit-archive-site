import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import type { ArchiveStatsData, DistributionBucket } from '@/lib/archiveStats'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { postChartConfig, valueChartConfig } from './statsChartConfig'
import { formatLabelCompact, formatLabelMetric, WEEKDAY_LABELS } from './statsFormat'

export type BarDatum = {
  label: string
  value: number
  detail?: string
}

export function DistributionChart({ data }: { data: DistributionBucket[] }) {
  return (
    <ChartContainer config={postChartConfig} className="h-[210px] w-full aspect-auto">
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-chalk)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent className="border-chalk bg-pure-surface shadow-none" />} />
        <Bar dataKey="posts" fill="var(--color-posts)" radius={[2, 2, 0, 0]}>
          <LabelList dataKey="posts" position="top" className="fill-gravel text-[11px]" formatter={formatLabelCompact} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function ValueBarChart({ data, height = 280, labelWidth = 96, formatter = formatLabelMetric }: {
  data: BarDatum[]
  height?: number
  labelWidth?: number
  formatter?: (value: unknown) => string
}) {
  return (
    <ChartContainer config={valueChartConfig} className="w-full aspect-auto" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 42, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-chalk)" />
        <XAxis type="number" hide />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={labelWidth} className="text-xs" />
        <ChartTooltip content={<ChartTooltipContent className="border-chalk bg-pure-surface shadow-none" />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 2, 2, 0]}>
          <LabelList dataKey="value" position="right" className="fill-gravel text-[11px]" formatter={formatter} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function WeekHeatmap({ data }: { data: ArchiveStatsData['weekdayHour'] }) {
  const max = Math.max(...data.map((cell) => cell.posts), 1)
  const byKey = new Map(data.map((cell) => [`${cell.day}-${cell.hour}`, cell.posts]))

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[760px] grid-cols-[2rem_repeat(24,minmax(1.4rem,1fr))] gap-px text-xs">
        <div />
        {Array.from({ length: 24 }, (_, hour) => (
          <div className="pb-2 text-center font-mono text-[10px] text-slate" key={hour}>{hour % 3 === 0 ? hour : ''}</div>
        ))}
        {WEEKDAY_LABELS.map((dayLabel, day) => (
          <div className="contents" key={dayLabel}>
            <div className="pr-2 pt-1.5 text-right font-mono text-[10px] uppercase text-gravel">{dayLabel}</div>
            {Array.from({ length: 24 }, (_, hour) => {
              const posts = byKey.get(`${day}-${hour}`) ?? 0
              const intensity = posts / max
              return (
                <div
                  className="h-7 rounded-[3px] bg-powder"
                  key={hour}
                  title={`${dayLabel} ${hour}:00 · ${posts} berichten`}
                  style={{
                    backgroundColor: posts
                      ? `color-mix(in srgb, var(--color-obsidian) ${Math.max(12, intensity * 92)}%, var(--color-powder))`
                      : 'var(--color-powder)',
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
