# Archive tagging and category pipeline

Status: **tag review**. The current site still uses its existing generated data. Only a capped, 20-unit Jev pilot has used OpenRouter; no full archive run or image classification has started.

## The two layers

1. **Content tags:** assign multiple fine-grained, stable tags to each browse unit. A unit is one post or a curated continuation series. The archive has 3,281 posts, including 964 posts in 361 existing series, producing 2,678 browse units. Each tag is an independent Jev `noul` question; a unit may have zero or several tags. Four units normally share one Decisions request, with each question naming its own record; the command permits one to eight. Long units get smaller batches so their full text is retained. A versioned vocabulary, per-tag thresholds and source hashes make results reproducible. `count-tags` reports classified-unit counts, raw-post counts, the sum of scores, and counts at several thresholds. Counts are not inferred from old topic names.
2. **UI categories:** only after viewing the full tag counts, group selected tag IDs into broader, filterable categories. A category is a union of tags; overlapping categories are allowed and reported. `bundle` previews category sizes, overlap, uncovered units and tags without a category. There is intentionally **no category map yet**: inventing one before the tag count view would repeat the old problem.

The draft [tag vocabulary](./ml/tag-vocabulary.draft.json) has 54 candidates discovered from 119 development units with GPT-6 Sol at low effort through the ChatGPT subscription, plus a word-frequency spot check across all browse units that found omitted topics such as grafting and greenhouses. This is a proposal, not the list of counted tags. Near-neighbor tags can be merged or split after reviewing their measured prevalence and errors. The old category-first draft has been removed.

## Continuations and image context

The pipeline reads the same curated continuation groups as the UI. A series is sampled, labeled, tagged and embedded as one unit, so its parts cannot land on opposite sides of the development/holdout split. Each part remains linked through its original post ID. The series grouping is context for the whole story; it is not evidence that every photo shows every subject in the group. Counts include both **browse units** and **underlying posts** so a long series does not silently inflate category sizes. A Jev trial exposed six wrong same-day joins; these were corrected in the canonical series map and the review sample was repinned without losing the eight unreviewed caption proposals. The [44 cross-date groups curated by an LLM](./ml/series-audit.json) are listed for review. Remaining series links need a broader audit before a full run because a wrong link mixes unrelated text and creates wrong tag combinations.

The image review set now links each image to its source post title and excerpt, its series title and member IDs, and any explicit image `alt`, `title` or numbered caption found in the source HTML. A numbered list such as “1 & 2 …” is linked only to images 1 and 2. Every link has `role: linked-context-only` and source provenance. These links appear in the local contact sheet at `ml-work/review/images.html`. They **never** enter the image description prompt or become visible-content tags automatically. Only a reviewed, image-specific description can support a post tag or embedding. When one is reviewed, the post tagger receives its image ID, visual description, source post ID and matching image-specific text in separate fields. The eight [caption proposals](./ml/caption-pilot.json) remain unreviewed.

The draft post vocabulary already contains independent `familie` and `familiefeesten` tags. The [image signal draft](./ml/image-vocabulary.draft.json) starts with separate People, Family and Family celebration tags. For gallery images, **People** is a visual observation while **Family** requires explicit family context in a matching caption or linked post and alignment with the image description. A group of people alone does not establish a relationship. The old image `familie` tags are not ground truth; the new image-level classifier has not run. `image-inputs` previews the evidence and context that a future text-only Jev image classifier would receive. It includes no unreviewed image descriptions. Jev can score several nonexclusive tags per image, with one probability per tag, and the category mapping remains a later step based on measured counts.

## Review and trial

The pinned [review set](./ml/review-set.json) has 150 browse units (119 development, 31 holdout) and 100 images. It records source hashes and preserves annotations when regenerated. Legacy topic IDs are used only to balance the sample. The holdout was excluded from tag discovery. To regenerate local review files and the image contact sheet:

```bash
python3 scripts/archive_ml.py sample
python3 scripts/archive_ml.py image-review
python3 scripts/archive_ml.py image-inputs
python3 scripts/archive_ml.py validate-tags ml/tag-vocabulary.draft.json
python3 scripts/archive_ml.py tag-plan --vocabulary ml/tag-vocabulary.draft.json
```

Review `ml-work/review/units.json`: put accepted tag IDs in `goldTagIds` and set `tagReviewStatus` to `reviewed`. Empty `goldTagIds` with reviewed status explicitly means none of the proposed tags apply. In `ml-work/review/images.json`, correct any image-specific description and visible tags, then set `descriptionStatus` to `reviewed`. Only reviewed descriptions enter the unit classifier or embeddings. Keep linked post text separate from visual claims.

Before approving the whole vocabulary, a **limited paid** Jev trial can use the draft only with a review sample, at most 20 units and a $0.10 ceiling:

```bash
python3 scripts/archive_ml.py tag --vocabulary ml/tag-vocabulary.draft.json --trial \
  --sample ml/family-pilot.sample.json --observations ml-work/review/images.json \
  --paid --max-items 20 --max-usd 0.10
python3 scripts/archive_ml.py count-tags --vocabulary ml/tag-vocabulary.draft.json
python3 scripts/archive_ml.py evaluate --vocabulary ml/tag-vocabulary.draft.json --split development
python3 scripts/archive_ml.py evaluate --vocabulary ml/tag-vocabulary.draft.json \
  --split holdout --output ml-work/holdout-evaluation.json
```

The default Jev batch size is four units: 54 tag questions per unit mean at most 216 questions per request. The complete archive currently plans **695 Decisions requests**, including smaller batches for long posts; a 20-unit pilot needs five. The planner uses a conservative 64,000-character payload ceiling. This is a size heuristic, not an exact Jev token count, so any provider context error must stop the run for adjustment. It is ordinary multi-record Jev usage, not OpenRouter's asynchronous Batch API, which does not list the Decisions endpoint among its supported shapes. One request for the whole archive would exceed Jev's 32K state context. A [20-unit family-focused development sample](./ml/family-pilot.sample.json) was run with grouped and solo scoring. The grouping comparison and complete-text refresh together made 26 paid requests and cost **$0.012028**. The current four-unit output selects `familie` on 10 of the 20 deliberately family-enriched units at a provisional 0.5 threshold. The preliminary batch-size comparisons showed some scores cross that threshold when batch partners change. These are consistency comparisons, not accuracy or corpus-prevalence measurements; reviewed labels remain necessary.

The classifier caches each full OpenRouter response and each unit's per-tag scores by the hash of its entire grouped request. A separate request ledger records each paid batch once, including reruns at a different batch size. It allocates a grouped request's reported cost equally across its units so that the per-unit costs sum to the actual request cost. The `noul` values are independent model scores; their usefulness as confidence measures and the selection threshold must be checked against reviewed labels. Changing a threshold or display label reuses scored results; changing a question or a batch partner invalidates them. Cached responses can be read without a key. Fewer HTTP requests do not necessarily mean proportionally lower cost: Jev bills input tokens. The local ceiling checks recorded cost before the next request; set a provider key spending cap for a strict ceiling on an in-flight request. The key is read from `OPENROUTER_API_KEY` or the local `.env` only when a request is needed and is never written to outputs. A full run requires an approved vocabulary and omits `--sample` after trial quality and cost have been reviewed; any wrong continuation links found in the audit must be corrected and affected units rerun before publishing categories:

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

References: [Jev multi-label classification and threshold calibration](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-classification), [OpenRouter multi-record Jev example](https://openrouter.ai/labs/jev/compile), [OpenRouter Batch API shapes](https://openrouter.ai/docs/batch-quickstart), [OpenRouter embedding request](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings).
