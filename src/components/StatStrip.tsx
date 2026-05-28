type Stat = { label: string; value: string | number }
type Props = { stats: Stat[] }

export default function StatStrip({ stats }: Props) {
  return (
    <section className="site-shell grid gap-3 py-8 sm:grid-cols-2 lg:grid-cols-4" aria-label="Archief in cijfers">
      {stats.map((item) => (
        <div className="grid min-h-32 rounded-2xl bg-pure-surface p-5 shadow-soft" key={item.label}>
          <strong className="font-mono text-5xl leading-none md:text-7xl">{typeof item.value === 'number' ? item.value.toLocaleString('nl-BE') : item.value}</strong>
          <span className="text-slate-ink">{item.label}</span>
        </div>
      ))}
    </section>
  )
}
