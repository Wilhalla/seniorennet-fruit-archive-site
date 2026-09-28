# Seniorennet fruit archive site

Static Astro archive site.

## Semantic atlas

The replacement, tag-first classification and similarity workflow is in [`ML_PIPELINE.md`](./ML_PIPELINE.md). Its tag vocabulary is a draft and has not changed the live site data.

The existing semantic atlas preprocessing pipeline, JSON contracts, rerun commands, and topic-label workflow are documented in [`SEMANTIC_ATLAS.md`](./SEMANTIC_ATLAS.md).

The image gallery preprocessing pipeline and local CLIP image embedding workflow are documented in [`IMAGE_ATLAS.md`](./IMAGE_ATLAS.md).

Legacy data rerun from this directory (the tag-first pipeline is prepared separately):

```bash
pnpm semanticAtlas
pnpm imageAtlas
pnpm build
```

The public UI remains static: it fetches `/generated/map-points.json` and `/generated/topics.json` and renders a canvas map in `/atlas/`.
