export const WEEKDAY_LABELS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

export function formatNumber(value: number) {
  return value.toLocaleString('nl-BE')
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat('nl-BE', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function formatLabelNumber(value: unknown) {
  return typeof value === 'number' ? formatNumber(value) : String(value ?? '')
}

export function formatLabelCompact(value: unknown) {
  return typeof value === 'number' ? formatCompact(value) : String(value ?? '')
}

export function formatMetric(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat('nl-BE', { maximumFractionDigits }).format(value)
}

export function formatLabelMetric(value: unknown) {
  return typeof value === 'number' ? formatMetric(value) : String(value ?? '')
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

export function pct(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}
