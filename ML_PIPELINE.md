# Archive classification pipeline

Status: **review stage**. The draft taxonomy is not approved and the site still uses its existing generated JSON. No OpenRouter request has been made for this pipeline.

## Data model

- A **post category** is one stable, broad main subject for browsing the Atlas. `other` is valid when text gives too little evidence. Jev uses one `choice` question with the reviewed category definitions.
- **Post facets** are optional yes/no questions. Jev returns their independent `noul` scores. Thresholds must be chosen on labeled development examples.
- **Image observations** are literal descriptions and visible tags of individual photos. Post title and topic are kept separate. Model proposals have `descriptionStatus: unreviewed`; only `reviewed` observations enter post classification or embeddings.
- **Similarity** uses hosted text embeddings of the post title, cleaned author text and any reviewed image observations. The Atlas preview uses cosine neighbors and one global UMAP projection. It never clusters inside a guessed broad bucket or moves points into label-based screen territories.

The pipeline keeps model responses and input hashes under ignored `ml-work/cache/` so reruns can resume. The taxonomy has stable IDs and a version. Changing the taxonomy or input text changes Jev's cache key. The static site remains unchanged until a full run passes review and its JSON consumers are migrated together.

## What is ready

`ml/review-set.json` pins a reproducible, topic-balanced sample of 150 posts and 100 images. It records the hashes of source JSON and a fixed development/holdout split (120/30 posts). Legacy topic IDs and gallery tags are included only for sampling and comparison. They are not truth labels. `ml/taxonomy.draft.json` contains 15 candidate categories derived from development posts with GPT-6 Sol at low effort through the ChatGPT subscription. Its five facets are yes/no questions. The draft needs a human pass, especially across travel, garden visits and events, and across fruit growing, plant health and harvest.

`ml/caption-pilot.json` contains eight **unreviewed** image-specific descriptions from the same subscription route. The local contact sheet at `ml-work/review/images.html` can be regenerated to compare each image with its old tags. In this pilot, a rock landscape had the old tag `tuin` and a photo of two men with a bird had `landschap`. The proposed descriptions describe the visible content; they have not been accepted as ground truth.

## Run the review workflow

From the repository root:

```bash
python3 scripts/archive_ml.py sample
python3 scripts/archive_ml.py image-review
python3 scripts/archive_ml.py validate-taxonomy ml/taxonomy.draft.json
python3 -m unittest discover -s scripts -p 'test_archive_ml.py'
```

Review `ml-work/review/posts.json`: fill `goldCategoryId` and optional `goldFacets` for development examples. Keep holdout labels out of taxonomy and threshold tuning. Review `ml-work/review/images.json`: confirm descriptions, correct `visibleTags`, then set `descriptionStatus` to `reviewed` for accepted observations. `import-captions --input FILE --model MODEL` safely imports a JSON array of `{id, description, visibleTags, unclear}` proposals and marks them unreviewed.

After category names and definitions are agreed, save a new versioned taxonomy with `status: approved`. To run **a limited paid Jev trial**, specify both an item count and a USD ceiling:

```bash
python3 scripts/archive_ml.py classify --taxonomy ml/taxonomy.approved.json \
  --sample ml-work/review/posts.json --observations ml-work/review/images.json \
  --paid --max-items 20 --max-usd 0.10
python3 scripts/archive_ml.py evaluate --taxonomy ml/taxonomy.approved.json --split development
python3 scripts/archive_ml.py evaluate --taxonomy ml/taxonomy.approved.json \
  --split holdout --output ml-work/holdout-evaluation.json
```

The key is read from `OPENROUTER_API_KEY` in the environment or local `.env`; it is never written to outputs. Jev's returned `usage.cost` is stored per item. The local ceiling stops subsequent requests based on recorded cost and a reserve. A strict account-level cap must be set on the OpenRouter key because an in-flight request can exceed a local estimate.

For a later similarity trial, verify the embedding model's current price and pass it explicitly:

```bash
python3 scripts/archive_ml.py embed --sample ml-work/review/posts.json \
  --observations ml-work/review/images.json --price-per-million PRICE_USD \
  --paid --max-items 20 --max-usd 0.10
python3 -m pip install -r requirements-archive-ml.txt
python3 scripts/archive_ml_similarity.py --sample ml-work/review/posts.json
```

Embeddings are billed separately. OpenRouter's embeddings response reports prompt tokens, so the script records **estimated** spend from the price supplied by the caller. Compare this against the provider's usage report before a larger run.

## Gate before replacing the old outputs

Review category accuracy and per-category precision/recall on the frozen holdout; inspect errors by confidence band. Check how often `other` is used, and inspect neighboring posts and the UMAP map for a cross-section of short posts, photo albums and text/image disagreements. Image themes need their own reviewed sample and precision check. Only then run the remaining archive and replace `topics.json`, `map-points.json`, `related-posts.json`, gallery JSON and all dependent client indexes in one verified cutover. The old preprocessing scripts stay available during this stage so the current static site builds unchanged.

References: [Jev classification and calibration](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-classification), [OpenRouter embedding request](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request).
