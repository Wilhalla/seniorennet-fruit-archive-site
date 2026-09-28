# Archive tagging and category pipeline

Status: **tag review**. The current site still uses its existing generated data. No OpenRouter request has been made by this pipeline.

## The two layers

1. **Content tags:** assign multiple fine-grained, stable tags to each browse unit. A unit is one post or a curated continuation series. The archive has 3,281 posts, including 964 posts in 361 existing series, producing 2,678 browse units. Each tag is an independent Jev `noul` question; a unit may have zero or several tags. A versioned vocabulary, per-tag thresholds and source hashes make results reproducible. `count-tags` reports classified-unit counts, raw-post counts, the sum of scores, and counts at several thresholds. Counts are not inferred from old topic names.
2. **UI categories:** only after viewing the full tag counts, group selected tag IDs into broader, filterable categories. A category is a union of tags; overlapping categories are allowed and reported. `bundle` previews category sizes, overlap, uncovered units and tags without a category. There is intentionally **no category map yet**: inventing one before the tag count view would repeat the old problem.

The draft [tag vocabulary](./ml/tag-vocabulary.draft.json) has 54 candidates discovered from 119 development units with GPT-6 Sol at low effort through the ChatGPT subscription, plus a word-frequency spot check across all browse units that found omitted topics such as grafting and greenhouses. This is a proposal, not the list of counted tags. Near-neighbor tags can be merged or split after reviewing their measured prevalence and errors. The old category-first draft has been removed.

## Continuations and image context

The pipeline reads the same curated continuation groups as the UI. A series is sampled, labeled, tagged and embedded as one unit, so its parts cannot land on opposite sides of the development/holdout split. Each part remains linked through its original post ID. The series grouping is context for the whole story; it is not evidence that every photo shows every subject in the group. Counts include both **browse units** and **underlying posts** so a long series does not silently inflate category sizes. The [44 cross-date groups curated by an LLM](./ml/series-audit.json) are listed for review; any incorrect group should be fixed before a full run, since a wrong link would mix unrelated post text.

The image review set now links each image to its source post title and excerpt, its series title and member IDs, and any explicit image `alt`, `title` or numbered caption found in the source HTML. A numbered list such as “1 & 2 …” is linked only to images 1 and 2. Every link has `role: linked-context-only` and source provenance. These links appear in the local contact sheet at `ml-work/review/images.html`. They **never** enter the image description prompt or become visible-content tags automatically. Only a reviewed, image-specific description can support a post tag or embedding. The eight [caption proposals](./ml/caption-pilot.json) remain unreviewed.

## Review and trial

The pinned [review set](./ml/review-set.json) has 150 browse units (119 development, 31 holdout) and 100 images. It records source hashes and preserves annotations when regenerated. Legacy topic IDs are used only to balance the sample. The holdout was excluded from tag discovery. To regenerate local review files and the image contact sheet:

```bash
python3 scripts/archive_ml.py sample
python3 scripts/archive_ml.py image-review
python3 scripts/archive_ml.py validate-tags ml/tag-vocabulary.draft.json
```

Review `ml-work/review/units.json`: put accepted tag IDs in `goldTagIds` and set `tagReviewStatus` to `reviewed`. Empty `goldTagIds` with reviewed status explicitly means none of the proposed tags apply. In `ml-work/review/images.json`, correct any image-specific description and visible tags, then set `descriptionStatus` to `reviewed`. Only reviewed descriptions enter the unit classifier or embeddings. Keep linked post text separate from visual claims.

After reviewing tag definitions, save a new vocabulary version with `status: approved`. A **limited paid** Jev run requires explicit item and USD ceilings:

```bash
python3 scripts/archive_ml.py tag --vocabulary ml/tag-vocabulary.approved.json \
  --sample ml-work/review/units.json --observations ml-work/review/images.json \
  --paid --max-items 20 --max-usd 0.10
python3 scripts/archive_ml.py evaluate --vocabulary ml/tag-vocabulary.approved.json --split development
python3 scripts/archive_ml.py evaluate --vocabulary ml/tag-vocabulary.approved.json \
  --split holdout --output ml-work/holdout-evaluation.json
```

The classifier caches each response by its source and question hash and stores OpenRouter's reported cost. Changing a threshold or display label reuses scored results; changing a question invalidates them. The local ceiling checks recorded cost before the next request; set a provider key spending cap for a strict ceiling on an in-flight request. The key is read from `OPENROUTER_API_KEY` or the local `.env` and is never written to outputs. A full run omits `--sample` after trial quality and cost have been reviewed; any wrong continuation links found in the audit must be corrected and affected units rerun before publishing categories:

```bash
python3 scripts/archive_ml.py tag --vocabulary ml/tag-vocabulary.approved.json \
  --paid --max-items 2678 --max-usd AGREED_LIMIT
python3 scripts/archive_ml.py count-tags --vocabulary ml/tag-vocabulary.approved.json
```

Use `ml-work/tag-counts.json` to decide which tags are useful, redundant or too rare, then make a versioned category mapping with `{version, categories:[{id,label,tagIds}]}`. Preview it with:

```bash
python3 scripts/archive_ml.py bundle --vocabulary ml/tag-vocabulary.approved.json \
  --mapping ml/category-map.draft.json
```

An optional similarity trial embeds the same browse units using reviewed image observations as supporting evidence. Verify the embedding model's current price and pass it explicitly; the embedding response reports token usage but its cost is estimated from that price. `archive_ml_similarity.py` builds cosine neighbors and a global UMAP map without bucket-first clustering or forced category territories.

## Quality and cutover gate

Use human-labeled development units to tune per-tag thresholds. Check precision and recall per tag, exact tag-set agreement, zero-tag coverage, and errors among image-only and continued posts. Evaluate once on the frozen holdout. Check the five nearest browse units and Atlas map on mixed examples. For gallery themes, review and consolidate **image-visible** tags separately from post-content tags, then count them before forming gallery filter groups. The current static outputs and UI stay in place until these checks pass and all dependent JSON consumers are migrated together.

References: [Jev multi-label classification and threshold calibration](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-classification), [OpenRouter embedding request](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request).
