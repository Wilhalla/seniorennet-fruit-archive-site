import { useEffect, useState } from 'react'
import { useDismissHydrationLoader } from '../gallery/useGracefulLoader'

declare global {
  interface Window {
    __semanticDataDiagramReady?: boolean
    __semanticDataTablesReady?: boolean
  }
}

export default function DataPageLoaderController() {
  const [diagramReady, setDiagramReady] = useState(false)
  const [tablesReady, setTablesReady] = useState(false)

  useEffect(() => {
    const syncReadyState = () => {
      setDiagramReady(Boolean(window.__semanticDataDiagramReady))
      setTablesReady(Boolean(window.__semanticDataTablesReady))
    }

    syncReadyState()
    window.addEventListener('semantic-data-diagram-ready', syncReadyState)
    window.addEventListener('semantic-data-tables-ready', syncReadyState)

    return () => {
      window.removeEventListener('semantic-data-diagram-ready', syncReadyState)
      window.removeEventListener('semantic-data-tables-ready', syncReadyState)
    }
  }, [])

  useDismissHydrationLoader('data-hydration-loader', !(diagramReady && tablesReady))

  return null
}
