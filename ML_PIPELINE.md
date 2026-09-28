# Archive ML pipeline

The site uses two layers: **fine-grained content tags** and **broad UI categories**. Tags are independent Jev scores on a versioned set of 54 Dutch questions. After scoring the whole archive, counted tags were bundled into eight categories plus `Overig`. Categories overlap; a story can appear under several filters. Thresholds are provisional until human labels are reviewed.

## Full corpus and provenance

The archive has 3,281 raw posts. The curated continuation map groups 964 of these into 361 series, leaving 2,678 browse units. A series is classified and embedded as one story; its original posts retain links to that unit. The 44 cross-date series in [series-audit.json](./ml/series-audit.json) still need a broader human audit. Wrong joins can mix unrelated text, so correct a series and rerun its affected unit before treating that result as reliable.

The approved [tag vocabulary](./ml/tag-vocabulary.approved.json) contains 54 questions. Full Jev scoring covers all 2,678 units. The [category map](./ml/category-map.approved.json) was made **after** reviewing `ml-work/tag-counts.json`: Fruit & rassen, Tuin & teelt, Plantenproblemen, Natuur & seizoenen, Reizen & bezoeken, Erfgoed & verhalen, Familie, and Eten & gezondheid. Units with no selected tag are `Overig`. The Family category uses only the `familie` and `familiefeesten` tags; showing people in a picture is insufficient.

The [image pipeline](./IMAGE_ATLAS.md) automatically describes all 13,048 distinct source images using the ChatGPT-signed-in Codex CLI, then links each description to its image occurrence, source post, and continuation series. Matching HTML `alt`, `title`, and numbered captions remain separate linked context; post text is not treated as visual evidence. The post tagger sees up to 12 visual descriptions spread across a story, while the text embedding includes all of that story's descriptions. Image records receive their own Jev scores and counted gallery categories. Family images require photographed people plus explicit family context, rather than people alone.

## Reproducible outputs

The full score table, raw model responses, request ledger, embedding vectors, and review sheets live under ignored `ml-work/`. Every Jev grouped response and unit's scores are cached with request, vocabulary, and input hashes. The request ledger records the provider-reported spend. Jev's `noul` values are independent model scores, not calibrated probabilities. The approved vocabulary currently selects a tag at its per-tag threshold, generally 0.5.

Text embeddings use `Qwen/Qwen3-Embedding-8B` through OpenRouter. The embedding ledger estimates cost from returned token usage and the verified $0.01 per million input tokens price; it is not a provider-billed total. `scripts/archive_ml_similarity.py` normalizes vectors, computes exact cosine nearest neighbors in the original 4,096-dimensional space, and uses seeded cosine UMAP only for two-dimensional Atlas positions. This avoids deriving related stories from distorted map distances or forcing categories into artificial territories.

The commands below reuse cached requests. Only Jev classification and text embeddings use `OPENROUTER_API_KEY`; image descriptions use the Codex login. Complete the image stage before refreshing story scores and embeddings:

```bash
python3 scripts/archive_ml_caption.py --workers 4 --batch-size 16
python3 scripts/archive_ml_image_tags.py --paid --max-images 13144 --max-usd 2.00
python3 scripts/archive_ml.py tag --vocabulary ml/tag-vocabulary.approved.json --observations ml-work/image-observations.json --paid --max-items 2678 --max-usd 2.00
python3 scripts/archive_ml.py count-tags --vocabulary ml/tag-vocabulary.approved.json
python3 scripts/archive_ml.py bundle --vocabulary ml/tag-vocabulary.approved.json --mapping ml/category-map.approved.json
python3 scripts/archive_ml.py embed --observations ml-work/image-observations.json --paid --max-items 2678 --max-usd 0.25 --price-per-million 0.01
.venv/bin/python scripts/archive_ml_similarity.py
python3 scripts/archive_ml_publish.py
python3 scripts/topic_calendar.py
nub run clientData
python3 scripts/archive_ml_image_counts.py
nub run imageAtlas
```

The publisher checks complete unit/post coverage, vocabulary hash, and tag-to-category coverage, then writes static JSON to `src/data/generated/` and `public/generated/`: categories, tags per post, multi-category IDs per post, Atlas points, and exact embedding neighbors. `clientData` rebuilds the small archive list payload. The UI filters Atlas, archive, and search by all category memberships. Atlas colors each point by one primary category while preserving its other memberships.

## Quality limits and next review

The [review set](./ml/review-set.json) contains 150 browse units (119 development, 31 holdout) and 100 images. Human `goldTagIds` are still missing. Automatic image descriptions are accepted for this run without a human review gate, as requested; coverage and reproducibility therefore do **not** establish precision or recall. Before claiming measured accuracy, label development examples, tune thresholds there, and evaluate once on the frozen holdout. Include image-only and continuation cases. Full image tag counts determine gallery categories before publication.

References: [Jev multi-record classification](https://openrouter.ai/labs/jev/compile), [OpenRouter embeddings API](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings), [Qwen3 Embedding 8B listing](https://openrouter.ai/qwen/qwen3-embedding-8b/providers).
