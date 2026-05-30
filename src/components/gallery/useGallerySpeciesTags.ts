import { useEffect, useState } from 'react'
import { fetchGalleryJson, shouldLoadGallerySpeciesTags, type SpeciesImageTags, type SpeciesTag } from '../../lib/imageGallerySession'
import { isAbortError } from '../../lib/clientFetch'

export function useGallerySpeciesTags(filters: { query: string; speciesFilter: string }) {
  const [speciesByImage, setSpeciesByImage] = useState<Record<string, SpeciesTag[]>>({})
  const [speciesTagsLoaded, setSpeciesTagsLoaded] = useState(false)
  const [speciesTagsLoading, setSpeciesTagsLoading] = useState(false)

  useEffect(() => {
    if (!shouldLoadGallerySpeciesTags({ ...filters, speciesTagsLoaded, speciesTagsLoading })) return

    let cancelled = false
    const controller = new AbortController()
    setSpeciesTagsLoading(true)
    fetchGalleryJson<SpeciesImageTags[]>('/generated/species-tags.json', 'low', controller.signal)
      .then((loadedSpeciesTags) => {
        if (cancelled) return
        setSpeciesByImage(Object.fromEntries(loadedSpeciesTags.map((item) => [item.imageId, item.tags])))
        setSpeciesTagsLoaded(true)
      })
      .catch((error) => {
        if (!isAbortError(error)) console.error(error)
      })
      .finally(() => {
        if (!cancelled) setSpeciesTagsLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [filters.query, filters.speciesFilter, speciesTagsLoaded, speciesTagsLoading])

  return { speciesByImage, speciesTagsLoaded, speciesTagsLoading }
}
