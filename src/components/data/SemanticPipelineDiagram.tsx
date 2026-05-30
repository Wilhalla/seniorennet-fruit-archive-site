import { useEffect, useMemo, useState } from 'react'

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

export default function SemanticPipelineDiagram() {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const id = useMemo(() => `semantic-preprocessing-${Math.random().toString(36).slice(2)}`, [])

  useEffect(() => {
    let cancelled = false

    import('mermaid')
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

    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <section className="site-shell min-w-0 py-12" aria-labelledby="semantic-setup-title">
      <div className="min-w-0 border-b border-chalk pb-10">
        <div className="max-w-3xl">
          <p className="eyebrow">Semantische preprocessing</p>
          <h1 id="semantic-setup-title" className="display-title mt-2">Data</h1>
          <p className="mt-5 text-body-lg leading-body-lg text-gravel">
            Eerst worden tekst en afbeeldingen uit elk blogbericht apart gelezen. Daarna zet de pipeline beide om naar
            “betekenis-getallen”, combineert die, zoekt onderwerpen en verwante berichten, en schrijft alles weg als JSON.
          </p>
        </div>
        {svg ? (
          <div className="mt-8 min-w-0 overflow-x-auto pb-2" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Mermaid diagram van de semantische preprocessing" />
        ) : (
          <pre className="mt-8 min-w-0 overflow-x-auto border-l border-chalk bg-transparent pl-4 font-mono text-sm text-obsidian">{error ?? diagram}</pre>
        )}
      </div>
    </section>
  )
}
