function trimLeadingSlash(value: string) {
  return value.replace(/^\/+/, '')
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

export function sitePath(path: string, base = import.meta.env.BASE_URL || '/') {
  const normalizedBase = ensureTrailingSlash(base || '/')
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith('data:')) return path
  return `${normalizedBase}${trimLeadingSlash(path)}`
}

export function generatedDataUrl(filename: string, base = import.meta.env.BASE_URL || '/') {
  return sitePath(`generated/${trimLeadingSlash(filename)}`, base)
}
