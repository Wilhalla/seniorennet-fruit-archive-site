import type { ChartConfig } from '@/components/ui/chart'

export const yearChartConfig = {
  posts: { label: 'Berichten', color: 'var(--color-obsidian)' },
  images: { label: 'Beelden', color: 'var(--color-slate)' },
  reactions: { label: 'Reacties', color: 'var(--color-ember)' },
} satisfies ChartConfig

export const postChartConfig = {
  posts: { label: 'Berichten', color: 'var(--color-obsidian)' },
} satisfies ChartConfig

export const topicChartConfig = {
  posts: { label: 'Berichten', color: 'var(--color-obsidian)' },
  images: { label: 'Beelden', color: 'var(--color-slate)' },
} satisfies ChartConfig

export const densityChartConfig = {
  avgChars: { label: 'Gem. tekens', color: 'var(--color-signal-blue)' },
} satisfies ChartConfig

export const valueChartConfig = {
  value: { label: 'Waarde', color: 'var(--color-obsidian)' },
} satisfies ChartConfig
