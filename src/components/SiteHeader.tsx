import { useEffect, useState } from 'react'
import { Archive, BarChart3, Database, Home, Images, Map, Menu, Search, X } from 'lucide-react'

const navLink = 'inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-body font-normal tracking-[0.01em] text-obsidian no-underline transition-colors hover:bg-powder hover:text-obsidian'
const mobileNavLink = 'group inline-flex min-h-12 items-center justify-center gap-3 text-center text-[28px] font-medium leading-none tracking-[-0.05em] text-obsidian no-underline transition-colors hover:text-gravel'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/archive/', label: 'Alle berichten', icon: Archive },
  { href: '/stats/', label: 'Statistieken', icon: BarChart3 },
  { href: '/atlas/', label: 'Atlas', icon: Map },
  { href: '/data/', label: 'Data', icon: Database },
  { href: '/gallery/', label: 'Beeldarchief', icon: Images },
]

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('mobile-menu-open', menuOpen)
    return () => document.body.classList.remove('mobile-menu-open')
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
      <div id="mobile-navigation" className="fixed inset-x-0 bottom-0 top-14 z-50 grid bg-eggshell px-6 py-10 sm:hidden" role="dialog" aria-modal="true" aria-label="Hoofdnavigatie">
        <nav className="mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-7" aria-label="Mobiele hoofdnavigatie">
          {navItems.map(({ href, label, icon: Icon }) => (
            <a className={mobileNavLink} href={href} key={href} onClick={() => setMenuOpen(false)}>
              <span>{label}</span>
              <Icon className="size-5 text-slate transition-colors group-hover:text-gravel" aria-hidden="true" />
            </a>
          ))}
          <div className="mt-2 h-px w-10 bg-chalk" aria-hidden="true" />
          <a className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-obsidian px-7 text-center text-[22px] font-medium leading-none tracking-[-0.035em] text-eggshell no-underline shadow-blue hover:text-eggshell" href="/search/" onClick={() => setMenuOpen(false)}>
            <span>Zoeken</span>
            <Search className="size-5" aria-hidden="true" />
          </a>
        </nav>
      </div>
    )}
    </>
  )
}
