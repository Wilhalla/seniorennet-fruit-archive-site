export const siteName = 'Blogarchief Daniël Willaeys'
export const defaultDescription = 'Bewaarde berichten, foto’s en reacties uit het blogarchief van Daniël Willaeys.'
export const defaultSocialImage = '/og-default.png'

function envString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function withScheme(value: string) {
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

function normalizeBasePath(basePath: string) {
  if (!basePath || basePath === '/') return ''
  return `/${basePath.replace(/^\/+|\/+$/g, '')}`
}

function applyConfiguredBasePath(path: string) {
  if (!path.startsWith('/')) return path

  const basePath = normalizeBasePath(import.meta.env.BASE_URL || '/')
  if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) return path
  return `${basePath}${path}`
}

function truncateAtWordBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  const trimmed = value.slice(0, Math.max(0, maxLength - 1)).trimEnd()
  const lastSpace = trimmed.lastIndexOf(' ')
  const candidate = lastSpace > maxLength * 0.65 ? trimmed.slice(0, lastSpace) : trimmed
  return `${candidate.replace(/[\s,.;:!?-]+$/u, '')}…`
}

export function cleanMetadataText(value: unknown, fallback = '') {
  const text = typeof value === 'string' ? value : fallback
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || fallback
}

export function metadataText(value: unknown, fallback = '', maxLength?: number) {
  const text = cleanMetadataText(value, fallback)
  return maxLength ? truncateAtWordBoundary(text, maxLength) : text
}

export function configuredSiteUrl(astroSite: URL | undefined, currentUrl: URL) {
  const vercelHost = envString(import.meta.env.VERCEL_PROJECT_PRODUCTION_URL) || envString(import.meta.env.VERCEL_URL)
  const configured =
    envString(import.meta.env.PUBLIC_SITE_URL) ||
    envString(import.meta.env.SITE_URL) ||
    (vercelHost ? withScheme(vercelHost) : '') ||
    astroSite?.href ||
    currentUrl.origin

  return ensureTrailingSlash(withScheme(configured))
}

export function absoluteMetadataUrl(value: string, metadataBase: string) {
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || value.startsWith('data:')) return value
  return new URL(applyConfiguredBasePath(value), metadataBase).href
}
