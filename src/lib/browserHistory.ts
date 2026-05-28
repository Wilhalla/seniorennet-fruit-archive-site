export type BrowserHistoryMode = 'push' | 'replace'

export function currentBrowserPath() {
  if (typeof window === 'undefined') return ''
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function writeBrowserPath(nextPath: string, mode: BrowserHistoryMode = 'replace', state: unknown = null) {
  if (typeof window === 'undefined') return false
  if (nextPath === currentBrowserPath()) return false
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', nextPath)
  return true
}

export function sameOriginReferrer() {
  if (typeof window === 'undefined' || !document.referrer) return false
  try {
    return new URL(document.referrer).origin === window.location.origin
  } catch {
    return false
  }
}
