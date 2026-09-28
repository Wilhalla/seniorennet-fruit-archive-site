# Image gallery pipeline

The gallery uses static JSON generated before the Astro build. The pipeline keeps one record per image occurrence, even when the same image file appears in more than one post. Each record links to its source post and, where applicable, its continuation series.

## Description, tags, and categories

`scripts/archive_ml_caption.py` downloads a small WebP thumbnail and asks the ChatGPT-signed-in Codex CLI for a short Dutch description of **visible content only**. Identical source files reuse one description. The resulting `ml-work/image-observations.json` attaches the description to each image occurrence and separately records the source post title, excerpt, and any matching HTML `alt`, `title`, or numbered caption. This stage does not use OpenRouter or require a review gate.

`scripts/archive_ml_image_tags.py` sends groups of eight observations to Jev on OpenRouter. Its [image tag vocabulary](./ml/image-vocabulary.approved.json) has independent scores for visible subjects such as people, fruit, plants, animals, buildings, art, and documents. Linked post text may establish an explicit family relationship, but it cannot establish that a person or object is visible. The complete Jev responses, per-image scores, and request costs remain in ignored `ml-work/` files. Scores are model estimates, not calibrated probabilities.

After all images are scored, `scripts/archive_ml_image_counts.py` counts selected fine tags. The [image category map](./ml/image-category-map.approved.json) groups those tags into the broader filters used in the gallery. `scripts/archive_ml_publish_images.py` checks full coverage and matching vocabulary hashes, then writes the client index, category counts, source links, descriptions, and image-specific text to `src/data/generated/` and `public/generated/`. `scripts/chunk-gallery-index.ts` refreshes the smaller year payloads. `nub run imageAtlas` repeats the publication steps from cached results.

The archive has 13,144 image records and 13,048 distinct source files. For a full run from the project root:

```bash
python3 scripts/archive_ml_caption.py --workers 4 --batch-size 16
python3 scripts/archive_ml_image_tags.py --paid --max-images 13144 --max-usd 2.00
python3 scripts/archive_ml_image_counts.py
nub run imageAtlas
```

The Jev command requires `OPENROUTER_API_KEY`; the caption command uses the Codex login. Both are resumable through cached batches. The cost limit includes previously recorded image-classifier requests in `ml-work/cache/image-jev/paid-requests.json`.

## Related images and species

The gallery's `image-related.json` and `image-clusters.json` still come from the earlier local CLIP image embedding workflow documented in the git history of this file. Those visual neighbors are separate from the tag and category pipeline. `nub run speciesAtlas` remains the separate evidence-based species resolver; exact cultivar names must come from linked text, not visual guesses.

## Runtime files

- `image-index.client.json` and `image-index-years/*.json`: image records for gallery and viewer routes
- `image-index.initial.json`: initial image records embedded in the page
- `gallery-groups.json` and `image-categories.json`: filter labels and counts
- `image-related.json`: existing visual neighbors
- `species-tags.json` and `species-groups.json`: optional species filters

Generated files live under `src/data/generated/` for build-time consumers and `public/generated/` for browser requests. The gallery links every image back to its post.
