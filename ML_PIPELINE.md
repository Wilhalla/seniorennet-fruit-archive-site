# Archive ML pipeline

The site uses two layers: **fine-grained content tags** and **broad UI categories**. Tags are independent Jev scores on a versioned set of 54 Dutch questions. After scoring the whole archive, counted tags were bundled into eight categories plus `Overig`. Categories overlap; a story can appear under several filters. Thresholds are provisional until human labels are reviewed.

## Full corpus and provenance

The archive has 3,281 raw posts. The curated continuation map groups 964 of these into 361 series, leaving 2,678 browse units. A series is classified and embedded as one story; its original posts retain links to that unit. The 44 cross-date series in [series-audit.json](./ml/series-audit.json) still need a broader human audit. Wrong joins can mix unrelated text, so correct a series and rerun its affected unit before treating that result as reliable.

The approved [tag vocabulary](./ml/tag-vocabulary.approved.json) contains 54 questions. Full Jev scoring covers all 2,678 units. The [category map](./ml/category-map.approved.json) was made **after** reviewing `ml-work/tag-counts.json`: Fruit & rassen, Tuin & teelt, Plantenproblemen, Natuur & seizoenen, Reizen & bezoeken, Erfgoed & verhalen, Familie, and Eten & gezondheid. Units with no selected tag are `Overig`. The Family category uses only the `familie` and `familiefeesten` tags; showing people in a picture is insufficient.

Images retain an explicit provenance link to their source post, its series, and any matching HTML `alt`, `title`, or numbered caption in the [review contact sheet](./ml-work/review/images.html). Linked post text is context, not proof of what an image visibly shows. Only reviewed, image-specific descriptions can enter the post tagger or embeddings. The eight caption proposals in [caption-pilot.json](./ml/caption-pilot.json) remain unreviewed, so **this full run is text-based**. Image-level Jev classification and new gallery categories have not run. The gallery's existing people detector is displayed as “Mensen”, never as a Family finding.

## Reproducible outputs

The full score table, raw model responses, request ledger, embedding vectors, and review sheets live under ignored `ml-work/`. Every Jev grouped response and unit's scores are cached with request, vocabulary, and input hashes. The request ledger records the provider-reported spend. Jev's `noul` values are independent model scores, not calibrated probabilities. The approved vocabulary currently selects a tag at its per-tag threshold, generally 0.5.

Text embeddings use `Qwen/Qwen3-Embedding-8B` through OpenRouter. The embedding ledger estimates cost from returned token usage and the verified $0.01 per million input tokens price; it is not a provider-billed total. `scripts/archive_ml_similarity.py` normalizes vectors, computes exact cosine nearest neighbors in the original 4,096-dimensional space, and uses seeded cosine UMAP only for two-dimensional Atlas positions. This avoids deriving related stories from distorted map distances or forcing categories into artificial territories.

The commands below reuse cached requests and require `OPENROUTER_API_KEY` only when a request is missing:

```bash
python3 scripts/archive_ml.py tag --vocabulary ml/tag-vocabulary.approved.json --paid --max-items 2678 --max-usd 1.00
python3 scripts/archive_ml.py count-tags --vocabulary ml/tag-vocabulary.approved.json
python3 scripts/archive_ml.py bundle --vocabulary ml/tag-vocabulary.approved.json --mapping ml/category-map.approved.json
python3 scripts/archive_ml.py embed --paid --max-items 2678 --max-usd 0.25 --price-per-million 0.01
.venv/bin/python scripts/archive_ml_similarity.py
python3 scripts/archive_ml_publish.py
python3 scripts/topic_calendar.py
nub run clientData
```

The publisher checks complete unit/post coverage, vocabulary hash, and tag-to-category coverage, then writes static JSON to `src/data/generated/` and `public/generated/`: categories, tags per post, multi-category IDs per post, Atlas points, and exact embedding neighbors. `clientData` rebuilds the small archive list payload. The UI filters Atlas, archive, and search by all category memberships. Atlas colors each point by one primary category while preserving its other memberships.

## Quality limits and next review

The [review set](./ml/review-set.json) contains 150 browse units (119 development, 31 holdout) and 100 images. Human `goldTagIds` and accepted image descriptions are still missing. Consequently the full run verifies coverage and reproducibility, **not precision or recall**. Before calling any category accurate, review development units, tune per-tag thresholds, then evaluate once on the frozen holdout. Include image-only and continuation cases. After reviewing visual descriptions, classify images separately and count image-visible tags before designing gallery filters. Keep the Family image rule tied to explicit, image-specific family context.

References: [Jev multi-record classification](https://openrouter.ai/labs/jev/compile), [OpenRouter embeddings API](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings), [Qwen3 Embedding 8B listing](https://openrouter.ai/qwen/qwen3-embedding-8b/providers).
