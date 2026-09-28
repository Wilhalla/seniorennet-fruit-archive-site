import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'

declare global {
  interface Window {
    __semanticDataDiagramReady?: boolean
  }
}

const diagram = `flowchart LR
  A[Blogberichten\nMarkdown + metadata] --> B[Tekst opschonen\ndatum, titel, inhoud]
  A --> C[Afbeeldingen\nper bericht]
  B --> D[Tekst betekenis\nembedding model]
  C --> E[Beeld betekenis\nCLIP model]
  D --> F[Betekenissen combineren\ntekst + beeld]
  E --> F
  F --> G[Onderwerpen maken\nclustering]
  F --> H[Kaartpositie maken\n2D projectie]
  F --> I[Verwante berichten zoeken\nnearest neighbours]
  G --> J[JSON data]
  H --> J
  I --> J
  J --> K[Atlas + deze datatabellen]
`

const mirrorArchiveDownloadUrl = 'https://objects.janpeterdhalle.com/wilhalla-vake-blog/downloads/seniorennet-fruit-archive.zip'
const mirrorArchiveFileSize = '2,7 GiB'

export default function SemanticPipelineDiagram() {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const id = useMemo(() => `semantic-preprocessing-${Math.random().toString(36).slice(2)}`, [])

  useEffect(() => {
    window.__semanticDataDiagramReady = true
    window.dispatchEvent(new CustomEvent('semantic-data-diagram-ready'))

    let cancelled = false

    const renderDiagram = () => import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            background: '#fbf6ea',
            mainBkg: '#fbf6ea',
            primaryColor: '#fbf6ea',
            primaryTextColor: '#1d1b16',
            primaryBorderColor: '#d6cdbb',
            lineColor: '#72695c',
            secondaryColor: '#fbf6ea',
            tertiaryColor: '#fbf6ea',
            fontFamily: 'DM Sans, Source Sans 3, sans-serif',
          },
        })
        return mermaid.render(id, diagram)
      })
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch((renderError) => {
        console.error(renderError)
        if (!cancelled) setError('Diagram kon niet geladen worden.')
      })

    let timeoutHandle: number | undefined
    let idleHandle: ReturnType<typeof window.requestIdleCallback> | undefined
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(renderDiagram, { timeout: 1600 })
    } else {
      timeoutHandle = window.setTimeout(renderDiagram, 350)
    }

    return () => {
      cancelled = true
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle)
    }
  }, [id])

  return (
    <section className="site-shell min-w-0 py-12" aria-labelledby="semantic-setup-title">
      <div className="min-w-0 border-b border-chalk pb-10">
        <div className="max-w-3xl">
          <h1 id="semantic-setup-title" className="display-title">Data</h1>
          <p className="mt-5 text-body-lg leading-body-lg text-gravel">
            Eerst worden tekst en afbeeldingen uit elk blogbericht apart gelezen. Daarna zet de pipeline beide om naar
            “betekenis-getallen”, combineert die, zoekt onderwerpen en verwante berichten, en schrijft alles weg als JSON.
          </p>
          <div className="mt-7 rounded-2xl border border-chalk bg-pure-surface p-5 shadow-subtle">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <h2 className="m-0 font-heading text-2xl font-normal leading-tight tracking-tight text-obsidian">Originele blogmirror</h2>
                <p className="mt-2 text-sm leading-6 text-gravel">
                  Download de volledige mirror-zip van de oorspronkelijke Seniorennet-blogs. Bestandsgrootte: <strong className="font-medium text-obsidian">{mirrorArchiveFileSize}</strong>.
                </p>
              </div>
              <Button asChild size="lg" className="justify-self-start sm:justify-self-end">
                <a href={mirrorArchiveDownloadUrl} download="seniorennet-fruit-archive.zip" aria-label={`Download originele blogmirror (${mirrorArchiveFileSize})`}>
                  <Download className="size-4" aria-hidden="true" />
                  <span>Download zip</span>
                </a>
              </Button>
            </div>
          </div>
        </div>
        {svg ? (
          <div className="mt-8 min-w-0 overflow-x-auto pb-2" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Mermaid diagram van de semantische preprocessing" />
        ) : error ? (
          <p className="mt-8 border-l border-chalk pl-4 text-gravel">{error}</p>
        ) : (
          <div className="mt-8 min-h-64" aria-hidden="true" />
        )}
      </div>
    </section>
  )
}
