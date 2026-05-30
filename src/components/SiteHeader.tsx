import { useEffect, useRef, useState } from 'react'
import { Archive, BarChart3, Database, Home, Images, Map, Menu, Search, Shuffle, X } from 'lucide-react'

const navLink = 'inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-body font-normal tracking-[0.01em] text-obsidian no-underline transition-colors hover:bg-powder hover:text-obsidian'
const randomNavLink = 'inline-grid size-9 place-items-center rounded-full text-obsidian no-underline transition-colors hover:bg-powder hover:text-obsidian'
const mobileNavLink = 'group inline-flex min-h-11 items-center justify-center gap-3 text-center text-[clamp(22px,7vw,28px)] font-medium leading-none tracking-[-0.05em] text-obsidian no-underline transition-colors hover:text-gravel'
const mobileRandomNavLink = 'inline-grid size-11 place-items-center rounded-full border border-chalk bg-pure-surface text-obsidian no-underline shadow-subtle transition-colors hover:bg-powder hover:text-obsidian'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/archive/', label: 'Alle berichten', icon: Archive },
  { href: '/gallery/', label: 'Beeldarchief', icon: Images },
  { href: '/atlas/', label: 'Atlas', icon: Map },
  { href: '/stats/', label: 'Statistieken', icon: BarChart3 },
  { href: '/data/', label: 'Data', icon: Database },
]

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuScrollPosition = useRef(0)

  useEffect(() => {
    const root = document.documentElement
    const body = document.body

    if (!menuOpen) {
      root.classList.remove('mobile-menu-open')
      body.classList.remove('mobile-menu-open')
      return
    }

    menuScrollPosition.current = window.scrollY
    root.classList.add('mobile-menu-open')
    body.classList.add('mobile-menu-open')
    body.style.position = 'fixed'
    body.style.top = `-${menuScrollPosition.current}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'

    return () => {
      root.classList.remove('mobile-menu-open')
      body.classList.remove('mobile-menu-open')
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.width = ''
      window.scrollTo({ top: menuScrollPosition.current, left: 0, behavior: 'auto' })
    }
  }, [menuOpen])

  return (
    <>
    <header className="sticky top-0 z-[60] w-full border-b border-chalk bg-eggshell/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-14 w-full max-w-page items-center justify-between gap-4 px-8 py-2 max-md:px-4">
        <a className="flex min-w-0 items-center gap-2 text-body font-medium tracking-[0.01em] text-obsidian no-underline hover:text-obsidian" href="/" aria-label="Naar de startpagina" onClick={() => setMenuOpen(false)}>
          <img className="apple-image brand-apple" src="/apple-assets/apple-1-192.png" alt="" aria-hidden="true" loading="eager" decoding="async" />
          <span className="truncate whitespace-nowrap font-heading text-[15px] font-normal leading-none tracking-normal">Blogarchief Daniël Willaeys</span>
        </a>
        <nav className="hidden items-center justify-center gap-1 sm:flex" aria-label="Hoofdnavigatie">
          {navItems.map(({ href, label, icon: Icon }) => (
            <a className={navLink} href={href} key={href}><Icon className="size-4 text-slate" aria-hidden="true" />{label}</a>
          ))}
          <a className={randomNavLink} href="/random/" aria-label="Open een willekeurig bericht" title="Willekeurig bericht"><Shuffle className="size-4 text-slate" aria-hidden="true" /></a>
          <a className="inline-flex min-h-9 items-center gap-2 rounded-full bg-obsidian px-4 text-body font-medium tracking-[0.01em] text-eggshell no-underline shadow-blue hover:text-eggshell" href="/search/"><Search className="size-4" aria-hidden="true" />Zoeken</a>
        </nav>
        <button
          className="inline-grid size-10 shrink-0 place-items-center rounded-full border border-chalk bg-pure-surface text-obsidian shadow-subtle sm:hidden"
          type="button"
          aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>
    </header>

    {menuOpen && (
      <div id="mobile-navigation" className="fixed inset-x-0 top-14 z-50 grid h-[calc(100dvh-3.5rem)] overflow-hidden overscroll-none bg-eggshell px-6 py-[clamp(1.5rem,6svh,2.5rem)] sm:hidden" role="dialog" aria-modal="true" aria-label="Hoofdnavigatie">
        <nav className="mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-[clamp(0.75rem,3.5svh,1.75rem)]" aria-label="Mobiele hoofdnavigatie">
          {navItems.map(({ href, label, icon: Icon }) => (
            <a className={mobileNavLink} href={href} key={href} onClick={() => setMenuOpen(false)}>
              <span>{label}</span>
              <Icon className="size-5 text-slate transition-colors group-hover:text-gravel" aria-hidden="true" />
            </a>
          ))}
          <div className="mt-2 h-px w-10 bg-chalk" aria-hidden="true" />
          <div className="flex items-center justify-center gap-2">
            <a className={mobileRandomNavLink} href="/random/" aria-label="Open een willekeurig bericht" title="Willekeurig bericht" onClick={() => setMenuOpen(false)}>
              <Shuffle className="size-5 text-slate" aria-hidden="true" />
            </a>
            <a className="inline-flex min-h-11 items-center justify-center gap-3 rounded-full bg-obsidian px-7 text-center text-[22px] font-medium leading-none tracking-[-0.035em] text-eggshell no-underline shadow-blue hover:text-eggshell" href="/search/" onClick={() => setMenuOpen(false)}>
              <span>Zoeken</span>
              <Search className="size-5" aria-hidden="true" />
            </a>
          </div>
        </nav>
      </div>
    )}
    </>
  )
}
