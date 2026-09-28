# Seniorennet fruit archive site

Static Astro archive site.

## Semantic atlas

The live site uses the tag-first classification and similarity workflow in [`ML_PIPELINE.md`](./ML_PIPELINE.md). It publishes nine filterable categories, groups continuation posts into stories, and places those stories in the Atlas with a text embedding projection.

The former local-model pipeline is documented in [`SEMANTIC_ATLAS.md`](./SEMANTIC_ATLAS.md) for historical reference. Running `semanticAtlas` now republishes the new pipeline from the cached tag scores and embeddings in `ml-work/`; see `ML_PIPELINE.md` for prerequisites and paid request commands.

The image gallery's automatic descriptions, image tags, counted categories, and existing CLIP visual neighbors are documented in [`IMAGE_ATLAS.md`](./IMAGE_ATLAS.md).

Rebuild the Atlas from cached classification and embedding results:

```bash
nub run semanticAtlas
nub run build
```

The gallery filters use categories grouped from image-level tags. Every image keeps its own visual description and link to the source post; image-specific captions from that post are shown separately.
