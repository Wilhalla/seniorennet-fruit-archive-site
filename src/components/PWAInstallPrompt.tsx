import { Download, Share2, Smartphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_STORAGE_KEY = 'fruit-archive-pwa-install-dismissed-at'
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIosSafari() {
  const userAgent = window.navigator.userAgent.toLowerCase()
  const isIos = /iphone|ipad|ipod/.test(userAgent) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent)
  return isIos && isSafari
}

function recentlyDismissed() {
  const dismissedAt = Number(window.localStorage.getItem(DISMISS_STORAGE_KEY) || 0)
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS
}

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [showIosInstructions, setShowIosInstructions] = useState(false)

  useEffect(() => {
    if (isStandaloneApp() || recentlyDismissed()) return

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setShowIosInstructions(false)
      setVisible(true)
    }

    const handleAppInstalled = () => {
      setVisible(false)
      setInstallPrompt(null)
      window.localStorage.removeItem(DISMISS_STORAGE_KEY)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    let iosTimer: number | undefined
    if (isIosSafari()) {
      iosTimer = window.setTimeout(() => {
        setShowIosInstructions(true)
        setVisible(true)
      }, 1800)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      if (iosTimer) window.clearTimeout(iosTimer)
    }
  }, [])

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()))
    setVisible(false)
  }

  const install = async () => {
    if (!installPrompt) return
    const prompt = installPrompt
    setInstallPrompt(null)
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'dismissed') {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()))
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <aside
      className="fixed bottom-4 right-4 z-[80] w-[min(calc(100vw-2rem),25rem)] overflow-hidden rounded-[1.75rem] border border-chalk bg-pure-surface/95 p-4 text-obsidian shadow-[rgba(0,0,0,0.18)_0_18px_55px,rgba(0,0,0,0.08)_0_1px_0] backdrop-blur-xl max-sm:inset-x-4 max-sm:bottom-3 max-sm:w-auto"
      role="dialog"
      aria-label="App installeren"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-powder" aria-hidden="true" />
      <button
        className="absolute right-3 top-3 inline-grid size-9 place-items-center rounded-full text-gravel transition-colors hover:bg-powder hover:text-obsidian focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
        type="button"
        aria-label="Installatiemelding sluiten"
        onClick={dismiss}
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <div className="relative flex gap-3 pr-8">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-chalk bg-eggshell shadow-subtle">
          <img className="size-9 bg-transparent" src="/pwa-192x192.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        </div>
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 text-caption font-medium uppercase leading-caption tracking-[0.16em] text-gravel">
            <Smartphone className="size-3.5" aria-hidden="true" />
            PWA beschikbaar
          </p>
          <h2 className="m-0 mt-1 font-heading text-[22px] font-light leading-[1.05] tracking-[-0.02em] text-obsidian">
            Installeer dit fruitarchief
          </h2>
          <p className="m-0 mt-2 text-body leading-body text-gravel">
            Open zoeken, atlas en beeldarchief als zelfstandige app — met snelle heropeningen en slimme caching.
          </p>
        </div>
      </div>

      {showIosInstructions ? (
        <div className="relative mt-4 rounded-2xl bg-powder px-4 py-3 text-body leading-body text-cinder">
          Tik in Safari op <Share2 className="mx-1 inline size-4 align-[-0.2em]" aria-hidden="true" /> <strong>Delen</strong> en kies <strong>Zet op beginscherm</strong>.
        </div>
      ) : (
        <div className="relative mt-4 flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full bg-obsidian px-4 text-body font-medium text-eggshell shadow-blue transition-transform hover:-translate-y-0.5 hover:text-eggshell focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
            type="button"
            onClick={install}
          >
            <Download className="size-4" aria-hidden="true" />
            Installeren
          </button>
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-chalk bg-pure-surface px-4 text-body font-medium text-obsidian transition-colors hover:bg-powder focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
            type="button"
            onClick={dismiss}
          >
            Later
          </button>
        </div>
      )}
    </aside>
  )
}
