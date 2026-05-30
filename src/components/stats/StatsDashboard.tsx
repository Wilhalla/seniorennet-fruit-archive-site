import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarDays, Image, MessageCircle, Ruler, Sparkles } from 'lucide-react'
import type { ArchiveStatsData } from '@/lib/archiveStats'
import { Badge } from '@/components/ui/badge'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Separator } from '@/components/ui/separator'
import TopicSeasonHeatmap from '@/components/atlas/TopicSeasonHeatmap'
import { useDismissHydrationLoader } from '@/components/gallery/useGracefulLoader'
import { ChartBlock, Kpi, MinimalCard, RankingTable } from './StatsBlocks'
import { DistributionChart, ValueBarChart, WeekHeatmap } from './StatsCharts'
import { densityChartConfig, postChartConfig, topicChartConfig, yearChartConfig } from './statsChartConfig'
import { formatCompact, formatDate, formatLabelCompact, formatLabelNumber, formatNumber, pct, WEEKDAY_LABELS } from './statsFormat'

export default function StatsDashboard({ stats }: { stats: ArchiveStatsData }) {
  useDismissHydrationLoader('stats-hydration-loader', false)

  const mostActiveYear = [...stats.byYear].sort((a, b) => b.posts - a.posts)[0]
  const mostVisualYear = [...stats.byYear].sort((a, b) => b.images - a.images)[0]
  const tempoYears = [...stats.byYear]
    .filter((year) => year.activeDays > 0)
    .map((year) => ({
      label: String(year.year),
      value: Number((year.posts / year.activeDays).toFixed(2)),
      detail: `${year.posts} berichten · ${year.activeDays} dagen`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  const visualYears = [...stats.byYear]
    .filter((year) => year.posts > 0)
    .map((year) => ({
      label: String(year.year),
      value: year.avgImages,
      detail: `${year.images} beelden`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  const discussionTopics = [...stats.topics]
    .filter((topic) => topic.reactions > 0)
    .map((topic) => ({
      label: topic.label,
      value: Number(((topic.reactions / topic.posts) * 100).toFixed(1)),
      detail: `${topic.reactions} reacties`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  const weekdayTotals = WEEKDAY_LABELS.map((label, day) => ({
    label,
    value: stats.byWeekday[day]?.posts ?? 0,
  }))

  return (
    <div className="site-shell pb-20">
      <section className="relative overflow-hidden py-16 md:py-24">
        <div className="max-w-5xl">
          <h1 className="display-title max-w-4xl">
            Blogarchiefstatistieken
          </h1>
        </div>
        <div className="mt-10 flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full bg-powder text-gravel">{formatDate(stats.totals.firstDate)} → {formatDate(stats.totals.lastDate)}</Badge>
          <Badge variant="secondary" className="rounded-full bg-powder text-gravel">{formatNumber(stats.totals.activeDays)} actieve dagen</Badge>
          <Badge variant="secondary" className="rounded-full bg-powder text-gravel">mediaan {formatNumber(stats.totals.medianChars)} tekens</Badge>
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2 lg:grid-cols-4" aria-label="Kerncijfers">
        <Kpi icon={CalendarDays} label="Berichten" value={formatNumber(stats.totals.posts)} detail={`${formatNumber(stats.totals.activeYears)} jaargangen met gemiddeld ${stats.totals.avgDaysBetweenActiveDays} dagen tussen actieve blogdagen.`} />
        <Kpi icon={Image} label="Beelden" value={formatNumber(stats.totals.images)} detail={`${pct(stats.totals.illustratedPosts, stats.totals.posts)} van de berichten bevat minstens één afbeelding.`} />
        <Kpi icon={MessageCircle} label="Reacties" value={formatNumber(stats.totals.reactions)} detail={`${pct(stats.totals.reactedPosts, stats.totals.posts)} kreeg zichtbaar gesprek onderaan het bericht.`} />
        <Kpi icon={Ruler} label="Tekstvolume" value={formatCompact(stats.totals.chars)} detail={`P95-lengte: ${formatNumber(stats.totals.p95Chars)} tekens. Samen goed voor ${formatCompact(stats.totals.words)} woorden.`} />
      </section>

      <Separator className="my-10 bg-chalk" />

      <TopicSeasonHeatmap initialData={stats.topicCalendar} />

      <section className="mt-10 grid gap-8 lg:grid-cols-[1.45fr_0.95fr]">
        <ChartBlock title="Publicatieritme" description="Berichten vormen de hoofdcurve; beelden en reacties tonen wanneer het archief visueler of conversatiever werd.">
          <ChartContainer config={yearChartConfig} className="h-[360px] w-full aspect-auto">
            <AreaChart data={stats.byYear} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="posts-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-posts)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-posts)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-chalk)" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent className="border-chalk bg-pure-surface shadow-none" />} />
              <Area type="monotone" dataKey="posts" stroke="var(--color-posts)" fill="url(#posts-fill)" strokeWidth={2} />
              <Line type="monotone" dataKey="images" stroke="var(--color-images)" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="reactions" stroke="var(--color-reactions)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ChartContainer>
        </ChartBlock>

        <div className="grid content-start gap-6">
          <MinimalCard>
            <CardHeader className="px-0 pb-4">
              <CardTitle>Consistentie</CardTitle>
              <CardDescription className="text-gravel">Waar het archief zijn tempo toont.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 px-0">
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-t border-chalk pt-4">
                <span className="text-gravel">Langste dagelijkse reeks</span>
                <span className="font-mono text-lg tabular-nums">{stats.consistency.longestStreak.days} dagen</span>
                <span className="col-span-2 text-xs text-gravel">{formatDate(stats.consistency.longestStreak.start)} — {formatDate(stats.consistency.longestStreak.end)}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-t border-chalk pt-4">
                <span className="text-gravel">Langste stilte</span>
                <span className="font-mono text-lg tabular-nums">{stats.consistency.longestGap.days} dagen</span>
                <span className="col-span-2 text-xs text-gravel">{formatDate(stats.consistency.longestGap.start)} — {formatDate(stats.consistency.longestGap.end)}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-t border-chalk pt-4">
                <span className="text-gravel">Drukste jaar</span>
                <span className="font-mono text-lg tabular-nums">{mostActiveYear?.year}</span>
                <span className="col-span-2 text-xs text-gravel">{formatNumber(mostActiveYear?.posts ?? 0)} berichten · {formatNumber(mostActiveYear?.activeDays ?? 0)} actieve dagen</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-t border-chalk pt-4">
                <span className="text-gravel">Meest visuele jaar</span>
                <span className="font-mono text-lg tabular-nums">{mostVisualYear?.year}</span>
                <span className="col-span-2 text-xs text-gravel">{formatNumber(mostVisualYear?.images ?? 0)} beelden in {formatNumber(mostVisualYear?.posts ?? 0)} berichten</span>
              </div>
            </CardContent>
          </MinimalCard>
        </div>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <ChartBlock title="Seizoenshartslag" description="Alle jaren samen opgeteld. De lente en zomer domineren de tuinagenda, maar winterposts blijven aanwezig.">
          <ChartContainer config={postChartConfig} className="h-[300px] w-full aspect-auto">
            <BarChart data={stats.byMonth} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-chalk)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis hide />
              <ChartTooltip content={<ChartTooltipContent className="border-chalk bg-pure-surface shadow-none" />} />
              <Bar dataKey="posts" fill="var(--color-posts)" radius={[2, 2, 0, 0]}>
                <LabelList dataKey="posts" position="top" className="fill-gravel text-[11px]" formatter={formatLabelCompact} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartBlock>

        <ChartBlock title="Drukste blogdagen" description="Dagen waarop het archief in batches werd aangevuld of meerdere observaties tegelijk online kwamen.">
          <div className="grid gap-1">
            {stats.consistency.busiestDays.map((day) => (
              <div className="grid grid-cols-[minmax(8rem,1fr)_auto] items-center gap-4 border-t border-chalk py-3" key={day.date}>
                <div>
                  <div className="font-medium">{day.label}</div>
                  <div className="mt-1 text-xs text-gravel">{formatNumber(day.images)} beelden · {formatNumber(day.reactions)} reacties</div>
                </div>
                <div className="font-mono text-xl tabular-nums">{day.posts}</div>
              </div>
            ))}
          </div>
        </ChartBlock>
      </section>

      <Separator className="my-10 bg-chalk" />

      <section>
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Vorm van de collectie</p>
            <h2 className="section-title mt-2">Lengte, beeld en gesprek.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-gravel">Distributies maken zichtbaar of het archief bestaat uit korte notities, fotoreeksen of lange pomologische essays.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartBlock title="Tekens per bericht" description="Van korte observaties tot lange naslagstukken.">
            <DistributionChart data={stats.distributions.length} />
          </ChartBlock>
          <ChartBlock title="Beelden per bericht" description="Hoe vaak een post puur tekstueel of uitgesproken visueel is.">
            <DistributionChart data={stats.distributions.images} />
          </ChartBlock>
          <ChartBlock title="Reacties per bericht" description="De meeste posts zijn stil, enkele worden gesprekspunten.">
            <DistributionChart data={stats.distributions.reactions} />
          </ChartBlock>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Extra grafieken</p>
            <h2 className="section-title mt-2">Tempo, beeld, reactie.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-gravel">Meer ratio’s dan ruwe volumes: jaren met veel posts per actieve dag, visuele jaargangen en thema’s die relatief veel reactie kregen.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartBlock title="Hoogste blogtempo per jaar" description="Berichten gedeeld door actieve blogdagen. Dit toont batch- of dagritme, niet alleen jaartotaal.">
            <ValueBarChart data={tempoYears} height={280} labelWidth={48} />
          </ChartBlock>
          <ChartBlock title="Meest visuele jaren" description="Gemiddeld aantal beelden per bericht. Jaren met excursies en fotoreeksen springen eruit.">
            <ValueBarChart data={visualYears} height={280} labelWidth={48} />
          </ChartBlock>
          <ChartBlock title="Reactiedichte thema’s" description="Reacties per 100 berichten binnen de grootste themaclusters.">
            <ValueBarChart data={discussionTopics} height={320} labelWidth={150} />
          </ChartBlock>
          <ChartBlock title="Weekdagvolume" description="Aantal publicaties per weekdag, inclusief posts zonder specifiek uur.">
            <ValueBarChart data={weekdayTotals} height={220} labelWidth={36} formatter={formatLabelNumber} />
          </ChartBlock>
        </div>
      </section>

      <section className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-3">
        <RankingTable title="Langste berichten" description="Geordend op aantal auteurstekens, zonder reacties mee te tellen." posts={stats.top.longest} metric="charCount" />
        <RankingTable title="Meeste beelden" description="Posts waar het archief het meest fotografisch wordt." posts={stats.top.imageRich} metric="imageCount" />
        <RankingTable title="Meeste reacties" description="Berichten die het vaakst tot antwoord uitnodigden." posts={stats.top.mostDiscussed} metric="reactionCount" />
      </section>

      <Separator className="my-10 bg-chalk" />

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <ChartBlock title="Thema’s als zwaartepunten" description="De grootste semantische clusters uit het archief. Balklengte is volume; grijze markering toont beeldintensiteit.">
          <ChartContainer config={topicChartConfig} className="h-[520px] w-full aspect-auto">
            <BarChart data={stats.topics} layout="vertical" margin={{ top: 0, right: 38, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--color-chalk)" />
              <XAxis type="number" hide />
              <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={150} className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent className="border-chalk bg-pure-surface shadow-none" />} />
              <Bar dataKey="posts" fill="var(--color-posts)" radius={[0, 2, 2, 0]}>
                <LabelList dataKey="posts" position="right" className="fill-gravel text-[11px]" formatter={formatLabelNumber} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartBlock>

        <MinimalCard>
          <CardHeader className="px-0 pb-4">
            <CardTitle>Topic-details</CardTitle>
            <CardDescription className="text-gravel">Gemiddelde lengte en beelden per thema.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="grid gap-3">
              {stats.topics.slice(0, 8).map((topic) => (
                <div className="border-t border-chalk pt-3" key={topic.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{topic.label}</span>
                    <span className="font-mono text-sm tabular-nums">{formatNumber(topic.posts)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gravel">
                    <span>{formatNumber(topic.avgWords)} woorden/post</span>
                    <span>·</span>
                    <span>{topic.illustratedShare.toFixed(2)} beelden/post</span>
                    <span>·</span>
                    <span>{formatNumber(topic.reactions)} reacties</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </MinimalCard>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <ChartBlock title="Tekstdichtheid per jaar" description="Gemiddelde tekens per bericht. Pieken wijzen naar jaren met meer essays of uitgebreide reisverslagen.">
          <ChartContainer config={densityChartConfig} className="h-[300px] w-full aspect-auto">
            <LineChart data={stats.byYear} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-chalk)" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(value) => formatCompact(Number(value))} />
              <ChartTooltip content={<ChartTooltipContent className="border-chalk bg-pure-surface shadow-none" />} />
              <Line dataKey="avgChars" stroke="var(--color-avgChars)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </ChartBlock>

        <ChartBlock title="Weekritme per uur" description="Een heatmap van publicatiemomenten: donkerder betekent meer berichten op die combinatie van weekdag en uur. Posts op 00:00 worden genegeerd.">
          <WeekHeatmap data={stats.weekdayHour} />
        </ChartBlock>
      </section>

      <div className="mt-14 flex items-center gap-3 border-t border-chalk pt-5 text-sm text-gravel">
        <Sparkles className="size-4" aria-hidden="true" />
        <span>Gebaseerd op gegenereerde archiefdata; tekstlengte telt auteurstekst en knipt zichtbare reacties waar mogelijk weg.</span>
      </div>
    </div>
  )
}
