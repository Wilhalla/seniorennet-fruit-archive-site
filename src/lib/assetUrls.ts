const DEFAULT_S3_ASSET_ENDPOINT = 'https://objects.janpeterdhalle.com'
const DEFAULT_S3_ASSET_BUCKET = 'wilhalla-vake-blog'
const ARCHIVE_IMAGE_PREFIX = '/archive-images/'
const ARCHIVE_THUMB_PREFIX = '/archive-thumbs/'
const ARCHIVE_SMALL_THUMB_PREFIX = '/archive-thumbs-240/'
const ARCHIVE_TINY_THUMB_PREFIX = '/archive-thumbs-96/'

function envString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '')
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, '')
}

function withScheme(endpoint: string) {
  if (!endpoint) return ''
  return /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`
}

function joinUrl(...parts: string[]) {
  const [first = '', ...rest] = parts.filter(Boolean)
  return [trimTrailingSlash(first), ...rest.map(trimSlashes)].filter(Boolean).join('/')
}

const configuredBaseUrl = envString(import.meta.env.PUBLIC_S3_ASSET_BASE_URL)
export const s3AssetEndpoint = withScheme(
  envString(import.meta.env.PUBLIC_S3_ASSET_ENDPOINT) || DEFAULT_S3_ASSET_ENDPOINT,
)
export const s3AssetBucket = envString(import.meta.env.PUBLIC_S3_ASSET_BUCKET) || DEFAULT_S3_ASSET_BUCKET
export const s3AssetPrefix = trimSlashes(envString(import.meta.env.PUBLIC_S3_ASSET_PREFIX))
export const s3AssetBaseUrl = trimTrailingSlash(
  configuredBaseUrl || joinUrl(s3AssetEndpoint, s3AssetBucket, s3AssetPrefix),
)
export const useRemoteImageAssets = envString(import.meta.env.PUBLIC_USE_REMOTE_IMAGE_ASSETS || 'true') !== 'false'

function splitSuffix(path: string) {
  const index = path.search(/[?#]/)
  if (index === -1) return { pathname: path, suffix: '' }
  return { pathname: path.slice(0, index), suffix: path.slice(index) }
}

export function archiveAssetUrl(assetPath: string) {
  if (!assetPath || !useRemoteImageAssets || !s3AssetBaseUrl) return assetPath
  if (!assetPath.startsWith(ARCHIVE_IMAGE_PREFIX)) return assetPath

  const { pathname, suffix } = splitSuffix(assetPath)
  return `${joinUrl(s3AssetBaseUrl, pathname)}${suffix}`
}

function remoteArchivePath(pathname: string, suffix: string) {
  if (!useRemoteImageAssets || !s3AssetBaseUrl) return `${pathname}${suffix}`
  return `${joinUrl(s3AssetBaseUrl, pathname)}${suffix}`
}

function archiveThumbPath(assetPath: string, prefix: string) {
  const { pathname, suffix } = splitSuffix(assetPath)
  const thumbPath = pathname.startsWith(prefix)
    ? pathname
    : pathname.startsWith(ARCHIVE_IMAGE_PREFIX)
      ? pathname.replace(ARCHIVE_IMAGE_PREFIX, prefix).replace(/\.[^/.]+$/, '.webp')
      : pathname.startsWith(ARCHIVE_THUMB_PREFIX) || pathname.startsWith(ARCHIVE_SMALL_THUMB_PREFIX) || pathname.startsWith(ARCHIVE_TINY_THUMB_PREFIX)
        ? pathname.replace(/^\/archive-thumbs(?:-240|-96)?\//, prefix).replace(/\.[^/.]+$/, '.webp')
        : ''
  return { thumbPath, suffix }
}

export function archiveThumbUrl(assetPath: string) {
  if (!assetPath) return assetPath
  const { thumbPath, suffix } = archiveThumbPath(assetPath, ARCHIVE_THUMB_PREFIX)
  if (!thumbPath) return archiveAssetUrl(assetPath)
  return remoteArchivePath(thumbPath, suffix)
}

export function archiveSmallThumbUrl(assetPath: string) {
  if (!assetPath) return assetPath
  const { thumbPath, suffix } = archiveThumbPath(assetPath, ARCHIVE_SMALL_THUMB_PREFIX)
  if (!thumbPath) return archiveAssetUrl(assetPath)
  return remoteArchivePath(thumbPath, suffix)
}

export function archiveTinyThumbUrl(assetPath: string) {
  if (!assetPath) return assetPath
  const { thumbPath, suffix } = archiveThumbPath(assetPath, ARCHIVE_TINY_THUMB_PREFIX)
  if (!thumbPath) return archiveAssetUrl(assetPath)
  return remoteArchivePath(thumbPath, suffix)
}

export function rewriteArchiveAssetUrls(html: string) {
  if (!html) return html

  return html
    .replace(/\b(src|href)\s*=\s*(["'])(\/archive-images\/[^"']+)\2/gi, (_match, attr, quote, value) => {
      return `${attr}=${quote}${archiveAssetUrl(value)}${quote}`
    })
    .replace(/\b(src|href)\s*=\s*(\/archive-images\/[^\s>]+)/gi, (_match, attr, value) => {
      return `${attr}=${archiveAssetUrl(value)}`
    })
}
