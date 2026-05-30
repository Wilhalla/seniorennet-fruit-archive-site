import type { LucideIcon } from 'lucide-react'
import type { RankPost } from '@/lib/archiveStats'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber } from './statsFormat'

export function MinimalCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 border-t border-chalk pt-5 ${className}`}>
      {children}
    </section>
  )
}

export function Kpi({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
  return (
    <div className="border-t border-chalk pt-4">
      <div className="mb-5 flex items-center justify-between gap-3 text-gravel">
        <span className="text-caption uppercase tracking-[0.22em]">{label}</span>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="font-heading text-[34px] font-light leading-none tracking-[-0.05em] text-obsidian md:text-[42px]">
        {value}
      </div>
      <p className="mt-3 max-w-[22ch] text-sm leading-5 text-gravel">{detail}</p>
    </div>
  )
}

export function ChartBlock({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <MinimalCard>
      <CardHeader className="px-0 pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription className="max-w-2xl text-gravel">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </MinimalCard>
  )
}

export function RankingTable({ title, description, posts, metric }: {
  title: string
  description: string
  posts: RankPost[]
  metric: 'charCount' | 'imageCount' | 'reactionCount'
}) {
  const metricLabel = {
    charCount: 'tekens',
    imageCount: 'beelden',
    reactionCount: 'reacties',
  }[metric]

  return (
    <MinimalCard>
      <CardHeader className="px-0 pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription className="text-gravel">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 px-0 text-caption uppercase tracking-[0.18em] text-gravel">#</TableHead>
              <TableHead className="px-0 text-caption uppercase tracking-[0.18em] text-gravel">Bericht</TableHead>
              <TableHead className="px-0 text-right text-caption uppercase tracking-[0.18em] text-gravel">{metricLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post, index) => (
              <TableRow className="hover:bg-powder/40" key={post.id}>
                <TableCell className="px-0 font-mono text-xs text-slate">{String(index + 1).padStart(2, '0')}</TableCell>
                <TableCell className="max-w-[20rem] px-0 whitespace-normal py-3">
                  <a className="line-clamp-2 text-sm font-medium no-underline hover:underline" href={post.url}>{post.title}</a>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gravel">
                    <span>{post.year}</span>
                    <span aria-hidden="true">·</span>
                    <span>{post.topicLabel}</span>
                  </div>
                </TableCell>
                <TableCell className="px-0 text-right font-mono text-sm tabular-nums">
                  {formatNumber(post[metric])}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </MinimalCard>
  )
}
