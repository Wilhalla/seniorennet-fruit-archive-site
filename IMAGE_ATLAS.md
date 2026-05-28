# Image atlas / gallery preprocessing

The gallery is static at runtime. Image analysis happens once in preprocessing and writes JSON into:

- `public/generated/` for `/gallery/`
- `src/data/generated/` for build-time consumers

Generated files:

- `image-index.json` — one record per image, linked back to its post
- `image-related.json` — nearest visual neighbours per image
- `image-clusters.json` — visual clusters/contact-sheet groups
- `gallery-groups.json` — year/season/theme counts
- `image-manifest.json` — model and generation metadata
- `species-tags.json` — evidence-based species/cultivar tags per image
- `species-groups.json` — filterable species/cultivar groups with confidence counts
- `species-manifest.json` — species resolver metadata

## Preferred local model

Use `uv` and the project venv for real image embeddings:

```bash
uv venv .venv --python python
source .venv/bin/activate
uv pip install -r requirements-ml.txt
```

Then run from `site/`:

```bash
nohup .venv/bin/python scripts/image_atlas.py \
  --embedding-backend sentence-transformers \
  --model sentence-transformers/clip-ViT-B-32 \
  > image-atlas-clip.log 2>&1 &
```

`sentence-transformers/clip-ViT-B-32` is small enough for local preprocessing and gives useful visual embeddings for similarity and broad zero-shot themes.

After image embeddings, run the evidence-based species resolver:

```bash
pnpm speciesAtlas
```

`pnpm imageAtlas` runs both steps.

Exact cultivar tags are not image-only guesses. The resolver combines post title, excerpt/body, caption/filename, broad visual context, and a restricted candidate list. High confidence means the species/cultivar was found in textual context; broad visual tags remain medium confidence.

## Development fallback

If the model stack is not installed, `--embedding-backend auto` falls back to deterministic handcrafted image features based on color/layout. That keeps the gallery contract working, but it is not as semantic as CLIP.

The current generated example was produced with:

```bash
nohup python scripts/image_atlas.py --embedding-backend handcrafted > image-atlas.log 2>&1 &
```

## Frontend

- Page: `/gallery/`
- Component: `src/components/gallery/GalleryApp.tsx`
- Runtime data source: static JSON from `/generated/`

Default UX:

- chronological year timeline
- season/month grouping
- AI/visual theme filters
- species/cultivar filter with confidence/evidence chips
- selected image panel with related images
- every image links back to its source blog post
