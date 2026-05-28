# Semantische atlas

De publieke website blijft volledig statisch. Alle AI/ML-stappen gebeuren éénmalig lokaal tijdens preprocessing; de browser laadt alleen JSON uit `public/generated/` en tekent een canvas.

## Output contract

De pipeline schrijft dezelfde bestanden naar:

- `public/generated/` voor de browser (`/generated/map-points.json`, enz.)
- `src/data/generated/` voor Astro build-time integratie op postpagina’s

Bestanden:

- `posts-index.json` — genormaliseerde metadata + cleaned plain text + topicId
- `map-points.json` — kleine frontend dataset met `id`, `slug`, `title`, datumvelden, `season`, `topicId`, `x`, `y`, `imageCount`, `excerpt`
- `topics.json` — topic metadata, labels, gegenereerde trefwoorden en representatieve posts
- `related-posts.json` — `{ postId: [nearPostId, ...] }`
- `topic-calendar.json` — topic × maand/seizoen tellingen voor de heatmap op de atlaspagina
- `entities.json` — lege placeholder voor latere entiteiten
- `manifest.json` — model/methode/tijdstip/contractversie

## Voorkeursstack

Installeer voor echte semantische preprocessing met `uv`:

```bash
uv venv .venv --python python
source .venv/bin/activate
uv pip install -r requirements-ml.txt
```

Standaard gebruikt de pipeline `BAAI/bge-m3` voor Nederlandse tekst en `sentence-transformers/clip-ViT-B-32` voor beelden. De atlas clustert dus niet langer alleen op blogtekst: per post wordt een gemiddelde CLIP-vector van alle afbeeldingen gemaakt en via late fusion gecombineerd met de tekstembedding. Dit is belangrijk omdat veel oude posts vooral fotoreeksen met korte bijschriften zijn.

## Pipeline opnieuw draaien

Vanuit `site/`:

```bash
pnpm semanticAtlas
```

Dat is equivalent aan:

```bash
python scripts/semantic_atlas.py \
  --markdown-dir src/content/blog-posts \
  --output-public public/generated \
  --output-data src/data/generated \
  --model BAAI/bge-m3 \
  --image-model sentence-transformers/clip-ViT-B-32 \
  --topics-yml topics.yml \
  --related-k 10
python scripts/topic_calendar.py
```

In een omgeving zonder `sentence-transformers`, `umap-learn` of `hdbscan` valt het script deterministisch terug op:

- TF-IDF + random projection voor tekstembeddings
- handgemaakte kleur/layoutfeatures voor beeldembeddings
- PCA voor 2D-projectie
- KMeans voor clustering

Dat fallbackpad is bedoeld voor smoke tests/CI en JSON-voorbeelden. Voor de uiteindelijke atlas: gebruik de voorkeursstack hierboven. Als je expliciet de oude tekst-only analyse wil vergelijken, gebruik `--image-embedding-backend none`.

## Menselijke topicnamen

`topics.yml` is bewust leeg (`topics: {}`) tenzij een topic handmatig is nagekeken. Topic-ID’s zijn cluster-ID’s en kunnen verschuiven wanneer corpus, modellen, gewichten of clusteringparameters wijzigen. Stale overrides geven misleidende thema’s.

Alleen na controle van `generatedLabel`, `visualKeywords`, `textKeywords` en `representativePostIds` in `public/generated/topics.json` mag je een label vastzetten:

```yaml
topics:
  topic-04:
    label: "Appelrassen"
```

Run daarna opnieuw:

```bash
pnpm semanticAtlas
```

## Frontend

- Pagina: `/atlas/`
- Componenten: `src/components/atlas/SemanticAtlasApp.tsx` en `src/components/atlas/TopicSeasonHeatmap.tsx`
- Postintegratie: `src/components/RelatedPosts.astro`

De kaart gebruikt precomputed `x/y`-coördinaten, geen force-directed graph. Filters gebeuren client-side op de geladen JSON: topic, jaar, seizoen en “met beelden”. Pan/zoom blijft in canvas en is performant voor duizenden punten.
