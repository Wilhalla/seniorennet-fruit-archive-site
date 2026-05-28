#!/usr/bin/env python3
"""Build a static semantic atlas for the fruit archive.

The public site never runs AI or clustering. This script is intended to be run
manually/at build-preprocessing time and writes JSON files consumed by Astro and
browser canvas code.

Preferred stack when installed:
  embeddings: sentence-transformers (default model BAAI/bge-m3)
  projection: umap-learn
  clustering: hdbscan

A deterministic TF-IDF/random-projection + PCA/KMeans fallback is included so the
contract can be generated in constrained environments and for CI smoke tests.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import html
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Sequence

import numpy as np

try:
    import yaml
except Exception:  # pragma: no cover - only used in very small environments
    yaml = None

try:
    from bs4 import BeautifulSoup
except Exception:  # pragma: no cover
    BeautifulSoup = None


DUTCH_STOPWORDS = {
    "aan", "al", "als", "bij", "dan", "dat", "de", "deze", "die", "dit", "door", "een", "en", "er",
    "ge", "geen", "haar", "had", "heb", "hebben", "heeft", "hem", "het", "hier", "hij", "hoe", "hun",
    "ik", "in", "is", "ja", "je", "kan", "kunnen", "maar", "me", "men", "met", "mijn", "naar", "niet",
    "nog", "nu", "of", "om", "ons", "ook", "op", "over", "te", "tot", "uit", "uw", "van", "veel", "voor",
    "was", "wat", "we", "wel", "werd", "wij", "worden", "wordt", "ze", "zei", "zijn", "zo", "zal", "zou",
    "br", "nbsp", "http", "https", "www", "html", "img", "src", "href", "class", "article", "div", "span",
    # Historic blog exports contain a lot of comment/trackback spam. These terms
    # should never become semantic topic names.
    "outlet", "outlets", "shoes", "shoe", "online", "cheap", "sale", "wholesale", "replica", "profile",
    "user", "users", "michael", "kors", "coach", "chung", "xyz", "com", "net", "org", "site", "sunglasses",
    "nike", "jordan", "air", "the", "bulg", "jaar", "jaren", "grote", "meer", "vervolg", "idem",
    # Very common caption glue from image-only travel/fair posts. Keeping these
    # out of labels prevents "Vervolg"-style albums from becoming nonsense topics.
    "werk", "werken", "plan", "floor", "gids", "gidse", "stap", "zien", "foto", "fotos", "foto's",
    # Domain-generic archive words. Useful in prose, but too broad to name a theme.
    "vrucht", "vruchten", "boom", "bomen", "ras", "rassen", "soort", "soorten", "plant", "planten",
}
TOKEN_NORMALIZATION = {
    "appel": "appels",
    "appelen": "appels",
    "peer": "peren",
    "pruim": "pruimen",
    "bes": "bessen",
}
TOKEN_RE = re.compile(r"[a-zà-ÿ][a-zà-ÿ'’-]{2,}", re.IGNORECASE)
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"}

VISUAL_THEMES = [
    {"id": "bloesem", "label": "bloesem", "terms": ["bloesem", "bloei", "bloemen", "flower", "blossom"]},
    {"id": "appels", "label": "appels", "terms": ["appel", "appels", "malus", "reinette", "jonagold", "pinova", "rubin", "boskoop", "elstar"]},
    {"id": "peren", "label": "peren", "terms": ["peer", "peren", "beurré", "doyenné", "catillac", "comtesse"]},
    {"id": "pruimen", "label": "pruimen", "terms": ["pruim", "pruimen", "prunus", "reine claude", "kerspruim", "myrobolaan"]},
    {"id": "bessen", "label": "bessen", "terms": ["bes", "bessen", "braam", "bramen", "framboos", "frambozen", "taybes", "wijnbes", "kruisbes"]},
    {"id": "tuin", "label": "tuin & teelt", "terms": ["tuin", "boomgaard", "serre", "snoei", "enten", "plant", "planten", "compost", "moestuin"]},
    {"id": "mensen", "label": "mensen", "terms": ["familie", "dochter", "kleinzoon", "bezoek", "vriend", "vrienden", "feest", "groep", "gastvrouw"]},
    {"id": "dieren", "label": "dieren & insecten", "terms": ["vogel", "mees", "vlinder", "bij", "bijen", "rups", "wesp", "kip", "kippen", "nest", "koekoek"]},
    {"id": "erfgoed", "label": "reizen & erfgoed", "terms": ["kerk", "kasteel", "abdij", "museum", "wandeling", "engeland", "antwerpen", "reis", "uitstap"]},
    {"id": "documenten", "label": "documenten", "terms": ["artikel", "tekening", "kaart", "schema", "tabel", "bericht"]},
]

CLIP_TEXT_PROMPTS = {
    "bloesem": "a close-up photograph of fruit tree blossom flowers in spring",
    "appels": "a photograph of apples or an apple tree in an orchard",
    "peren": "a photograph of pears or a pear tree",
    "pruimen": "a photograph of plums or a plum tree",
    "bessen": "a photograph of berries, raspberries, blackberries or currants",
    "tuin": "a photograph of a garden, orchard, greenhouse, plants or gardening work",
    "mensen": "a photograph with people, family or visitors",
    "dieren": "a photograph of animals, birds, insects, bees, butterflies or chickens",
    "erfgoed": "a travel photograph of a church, castle, museum, town, heritage place or landscape",
    "documenten": "a scan or photograph of a document, poster, drawing, table or text",
}
VISUAL_THEME_LABELS = {theme["id"]: theme["label"] for theme in VISUAL_THEMES}

# A richer prompt bank turns raw image vectors into lightweight "visual captions"
# that can be embedded in the same semantic space as the post text. This is CPU
# friendly: it only does CLIP image/text similarity, not generative captioning.
VISUAL_CONCEPT_PROMPTS = [
    ("bloesem", "fruit tree blossom, flowers on branches, spring orchard"),
    ("appels", "apples, apple trees, apple varieties, apples on a table or tree"),
    ("peren", "pears, pear trees, pear varieties, pears on a table or tree"),
    ("pruimen", "plums, plum trees, plum varieties, blue or yellow plums"),
    ("bessen", "berries, raspberries, blackberries, currants or small fruit"),
    ("druiven", "grapes, grape vines, vineyard, bunches of grapes"),
    ("tuin & teelt", "garden, orchard, vegetable garden, greenhouse, cultivated plants"),
    ("snoeien & enten", "pruning, grafting, garden tools, tree maintenance, horticulture work"),
    ("ziekten & plagen", "plant disease, damaged leaves, pests, caterpillars, fungi, crop damage"),
    ("dieren & insecten", "animals, insects, bees, butterflies, birds, wildlife in a garden"),
    ("vogels", "birds, nest boxes, small garden birds, bird nests"),
    ("kippen", "chickens, hens, poultry, chicken coop"),
    ("mensen & familie", "people, family, visitors, group portrait, social gathering"),
    ("feest & bezoek", "party, feast, visit, group event, people at a table"),
    ("reizen & erfgoed", "travel, day trip, heritage place, tourist visit, historic site"),
    ("kerken & kastelen", "church, cathedral, abbey, castle, historic architecture"),
    ("musea & steden", "museum, town, city street, square, monument, cultural visit"),
    ("landschap & natuur", "landscape, nature, park, forest, water, countryside"),
    ("documenten", "document, poster, sign, drawing, chart, table, printed text"),
]


@dataclasses.dataclass
class NormalizedPost:
    id: str
    slug: str
    title: str
    date: str
    iso_date: str
    year: int | None
    month: int | None
    season: str
    excerpt: str
    cleaned_text: str
    images: list[str]
    tags: list[str]
    url: str

    @property
    def image_count(self) -> int:
        return len(self.images)

    def body_sample(self, limit: int = 3500) -> str:
        # Most spam lives in imported reactions near the end. Keep the author's
        # own text dominant for embeddings and labels.
        return self.cleaned_text[:limit]

    def embedding_input(self) -> str:
        return "\n\n".join(part for part in [self.title, self.excerpt, self.body_sample()] if part).strip()

    def label_input(self) -> str:
        return "\n\n".join(part for part in [self.title, self.excerpt, self.body_sample(1400)] if part).strip()


def clean_plain_text(raw: str) -> str:
    raw = html.unescape(raw or "")
    if BeautifulSoup is not None and "<" in raw and ">" in raw:
        soup = BeautifulSoup(raw, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        text = soup.get_text(" ")
    else:
        text = TAG_RE.sub(" ", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def short_excerpt(text: str, max_chars: int = 220) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(" ", 1)[0]
    return f"{cut}…"


def parse_date(value: Any, iso_value: Any = None) -> tuple[str, str, int | None, int | None, str]:
    candidates = [iso_value, value]
    parsed: datetime | None = None
    for candidate in candidates:
        if not candidate:
            continue
        s = str(candidate).strip()
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                parsed = datetime.strptime(s[:19], fmt)
                break
            except ValueError:
                continue
        if parsed:
            break
    if not parsed:
        return str(value or ""), str(iso_value or ""), None, None, "winter"
    month = parsed.month
    if month in (3, 4, 5):
        season = "lente"
    elif month in (6, 7, 8):
        season = "zomer"
    elif month in (9, 10, 11):
        season = "herfst"
    else:
        season = "winter"
    return parsed.strftime("%Y-%m-%d"), parsed.strftime("%Y-%m-%dT%H:%M:%S"), parsed.year, month, season


def normalize_tags(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        bits = re.split(r"[,;]", value)
    elif isinstance(value, Sequence):
        bits = [str(v) for v in value]
    else:
        bits = [str(value)]
    return sorted({bit.strip() for bit in bits if bit and bit.strip()})


def normalize_post(meta: dict[str, Any], body: str) -> NormalizedPost:
    post_id = str(meta.get("id") or meta.get("slug") or stable_hash(body)[:12])
    slug = str(meta.get("slug") or post_id)
    title = clean_plain_text(str(meta.get("title") or slug))
    date, iso_date, year, month, season = parse_date(meta.get("date"), meta.get("isoDate") or meta.get("iso_date"))
    cleaned = clean_plain_text(body or meta.get("html") or "")
    excerpt = clean_plain_text(str(meta.get("excerpt") or "")) or short_excerpt(cleaned)
    images = meta.get("images") or []
    if isinstance(images, str):
        images = [images]
    images = [str(image) for image in images if str(image).strip()]
    tags = normalize_tags(meta.get("tags") or meta.get("categories") or meta.get("tag"))
    return NormalizedPost(
        id=post_id,
        slug=slug,
        title=title,
        date=date,
        iso_date=iso_date,
        year=year,
        month=month,
        season=season,
        excerpt=short_excerpt(excerpt),
        cleaned_text=cleaned,
        images=images,
        tags=tags,
        url=f"/posts/{slug}/",
    )


def load_markdown_dir(content_dir: Path) -> list[NormalizedPost]:
    posts: list[NormalizedPost] = []
    for path in sorted(content_dir.rglob("*.md")):
        raw = path.read_text(encoding="utf-8", errors="replace")
        match = FRONTMATTER_RE.match(raw)
        if match:
            if yaml is None:
                raise RuntimeError("PyYAML is required to parse markdown frontmatter")
            frontmatter = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", " ", match.group(1))
            meta = yaml.safe_load(frontmatter) or {}
            body = match.group(2)
        else:
            meta = {"slug": path.stem, "title": path.stem}
            body = raw
        posts.append(normalize_post(meta, body))
    return posts


def load_json_file(path: Path) -> list[NormalizedPost]:
    data = json.loads(path.read_text(encoding="utf-8"))
    posts: list[NormalizedPost] = []
    for item in data:
        meta = dict(item)
        body = str(meta.pop("html", "") or meta.pop("cleanedText", ""))
        posts.append(normalize_post(meta, body))
    return posts


def load_html_dir(content_dir: Path) -> list[NormalizedPost]:
    posts: list[NormalizedPost] = []
    for path in sorted(content_dir.rglob("*.html")):
        raw = path.read_text(encoding="utf-8", errors="replace")
        title = path.stem
        if BeautifulSoup is not None:
            soup = BeautifulSoup(raw, "html.parser")
            title_tag = soup.find("title")
            if title_tag:
                title = title_tag.get_text(" ").strip() or title
        posts.append(normalize_post({"slug": path.stem, "title": title}, raw))
    return posts


def load_posts(markdown_dir: Path | None, json_file: Path | None, html_dir: Path | None) -> list[NormalizedPost]:
    posts: list[NormalizedPost] = []
    if markdown_dir and markdown_dir.exists():
        posts.extend(load_markdown_dir(markdown_dir))
    if json_file and json_file.exists():
        posts.extend(load_json_file(json_file))
    if html_dir and html_dir.exists():
        posts.extend(load_html_dir(html_dir))
    # De-duplicate by id while preserving first source priority.
    seen: set[str] = set()
    unique: list[NormalizedPost] = []
    for post in posts:
        if post.id in seen:
            continue
        seen.add(post.id)
        unique.append(post)
    return unique


def stable_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest()


def tokenize(text: str) -> list[str]:
    raw_tokens = [m.group(0).lower().replace("’", "'") for m in TOKEN_RE.finditer(text)]
    tokens = [TOKEN_NORMALIZATION.get(token, token) for token in raw_tokens]
    return [token for token in tokens if token not in DUTCH_STOPWORDS and len(token) > 2]


class EmbeddingProvider:
    name = "base"

    def encode(self, texts: list[str]) -> np.ndarray:  # pragma: no cover - interface
        raise NotImplementedError


class SentenceTransformerEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str, batch_size: int = 16):
        from sentence_transformers import SentenceTransformer  # type: ignore

        self.name = model_name
        self.batch_size = batch_size
        self.model = SentenceTransformer(model_name)

    def encode(self, texts: list[str]) -> np.ndarray:
        vectors = self.model.encode(
            texts,
            batch_size=self.batch_size,
            normalize_embeddings=True,
            show_progress_bar=True,
        )
        return np.asarray(vectors, dtype=np.float32)


class TfidfRandomProjectionEmbeddingProvider(EmbeddingProvider):
    """Small deterministic fallback, not the preferred semantic model."""

    name = "tfidf-random-projection"

    def __init__(self, dimensions: int = 384, max_features: int = 5000, seed: int = 42):
        self.dimensions = dimensions
        self.max_features = max_features
        self.seed = seed

    def encode(self, texts: list[str]) -> np.ndarray:
        tokenized = [tokenize(text) for text in texts]
        df: Counter[str] = Counter()
        for tokens in tokenized:
            df.update(set(tokens))
        vocab = [term for term, _ in sorted(df.items(), key=lambda item: (-item[1], item[0]))[: self.max_features]]
        term_index = {term: i for i, term in enumerate(vocab)}
        n = len(texts)
        matrix = np.zeros((n, len(vocab)), dtype=np.float32)
        idf = np.array([math.log((1 + n) / (1 + df[term])) + 1 for term in vocab], dtype=np.float32)
        for row, tokens in enumerate(tokenized):
            counts = Counter(t for t in tokens if t in term_index)
            total = max(sum(counts.values()), 1)
            for term, count in counts.items():
                matrix[row, term_index[term]] = (count / total) * idf[term_index[term]]
        rng = np.random.default_rng(self.seed)
        projection = rng.normal(0, 1 / math.sqrt(max(self.dimensions, 1)), (len(vocab), self.dimensions)).astype(np.float32)
        vectors = matrix @ projection
        return l2_normalize(vectors)


class ImageEmbeddingProvider:
    name = "base"
    supports_text = False

    def encode_images(self, paths: list[Path]) -> np.ndarray:  # pragma: no cover - interface
        raise NotImplementedError

    def encode_texts(self, texts: list[str]) -> np.ndarray:  # pragma: no cover - interface
        raise NotImplementedError


class SentenceTransformerClipProvider(ImageEmbeddingProvider):
    supports_text = True

    def __init__(self, model_name: str, batch_size: int):
        from PIL import Image  # type: ignore
        from sentence_transformers import SentenceTransformer  # type: ignore

        self.name = model_name
        self.batch_size = batch_size
        self.image_class = Image
        self.model = SentenceTransformer(model_name)

    def encode_images(self, paths: list[Path]) -> np.ndarray:
        images: list[Any] = []
        vectors: list[np.ndarray] = []
        for path in paths:
            try:
                images.append(self.image_class.open(path).convert("RGB"))
            except Exception:
                images.append(self.image_class.new("RGB", (224, 224), (138, 135, 95)))
            if len(images) >= self.batch_size:
                vectors.append(np.asarray(self.model.encode(images, normalize_embeddings=True, show_progress_bar=False), dtype=np.float32))
                for image in images:
                    image.close()
                images = []
        if images:
            vectors.append(np.asarray(self.model.encode(images, normalize_embeddings=True, show_progress_bar=False), dtype=np.float32))
            for image in images:
                image.close()
        return l2_normalize(np.vstack(vectors)) if vectors else np.empty((0, 512), dtype=np.float32)

    def encode_texts(self, texts: list[str]) -> np.ndarray:
        return l2_normalize(np.asarray(self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False), dtype=np.float32))


class HandcraftedImageEmbeddingProvider(ImageEmbeddingProvider):
    """Deterministic visual fallback based on colour/layout only.

    This is not semantic, but it keeps smoke tests and CI from silently falling
    back to text-only behaviour when the CLIP stack is unavailable.
    """

    name = "handcrafted-color-layout"

    def encode_images(self, paths: list[Path]) -> np.ndarray:
        from PIL import Image  # type: ignore

        features = []
        for path in paths:
            try:
                with Image.open(path) as image:
                    image = image.convert("RGB")
                    small = image.resize((8, 8))
                    arr = np.asarray(small, dtype=np.float32).reshape(-1, 3) / 255.0
                    hist = []
                    for channel in range(3):
                        hist.extend(np.histogram(arr[:, channel], bins=8, range=(0, 1))[0] / 64.0)
                    aspect = min(image.width / max(image.height, 1), 4) / 4
                    brightness = float(arr.mean())
                    saturation = float((arr.max(axis=1) - arr.min(axis=1)).mean())
                    feature = np.concatenate([arr.mean(axis=0), arr.std(axis=0), np.asarray(hist), [aspect, brightness, saturation]])
            except Exception:
                feature = np.zeros(33, dtype=np.float32)
            features.append(feature.astype(np.float32))
        return l2_normalize(np.vstack(features)) if features else np.empty((0, 33), dtype=np.float32)

    def encode_texts(self, texts: list[str]) -> np.ndarray:
        return np.empty((len(texts), 0), dtype=np.float32)


def build_image_embedding_provider(backend: str, model_name: str, batch_size: int) -> ImageEmbeddingProvider | None:
    if backend == "none":
        return None
    if backend in ("auto", "sentence-transformers"):
        try:
            return SentenceTransformerClipProvider(model_name, batch_size=batch_size)
        except Exception as exc:
            if backend == "sentence-transformers":
                raise
            print(f"[semantic-atlas] image model unavailable ({exc}); using handcrafted visual fallback", file=sys.stderr)
    try:
        return HandcraftedImageEmbeddingProvider()
    except Exception as exc:
        print(f"[semantic-atlas] image fallback unavailable ({exc}); continuing text-only", file=sys.stderr)
        return None


def build_embedding_provider(backend: str, model_name: str, batch_size: int) -> EmbeddingProvider:
    if backend == "sentence-transformers" or backend == "auto":
        try:
            return SentenceTransformerEmbeddingProvider(model_name, batch_size=batch_size)
        except Exception as exc:
            if backend == "sentence-transformers":
                raise
            print(f"[semantic-atlas] sentence-transformers unavailable ({exc}); using TF-IDF fallback", file=sys.stderr)
    return TfidfRandomProjectionEmbeddingProvider()


def l2_normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return (vectors / norms).astype(np.float32)


@dataclasses.dataclass
class PostVisualFeatures:
    vectors: np.ndarray
    terms_by_post: dict[str, list[str]]
    image_count: int
    embedding_model: str

    @property
    def coverage(self) -> float:
        if len(self.vectors) == 0:
            return 0.0
        return float((np.linalg.norm(self.vectors, axis=1) > 0).mean())


def image_public_to_local(src: str, public_dir: Path) -> Path:
    return public_dir / src.lstrip("/")


def post_image_records(posts: list[NormalizedPost], public_dir: Path) -> list[tuple[int, Path]]:
    records: list[tuple[int, Path]] = []
    for post_idx, post in enumerate(posts):
        for src in post.images:
            if Path(src).suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            records.append((post_idx, image_public_to_local(src, public_dir)))
    return records


def heuristic_visual_terms(post: NormalizedPost) -> list[str]:
    haystack = f"{post.title} {post.excerpt} {post.cleaned_text[:800]}".lower()
    scored = []
    for theme in VISUAL_THEMES:
        score = sum(1 for term in theme["terms"] if term in haystack)
        if score:
            scored.append((score, str(theme["id"])))
    return [VISUAL_THEME_LABELS[theme_id] for _, theme_id in sorted(scored, reverse=True)[:3]]


def clip_visual_terms(provider: ImageEmbeddingProvider, image_vectors: np.ndarray) -> list[list[str]] | None:
    if not provider.supports_text or len(image_vectors) == 0:
        return None
    labels = [label for label, _ in VISUAL_CONCEPT_PROMPTS]
    prompts = [prompt for _, prompt in VISUAL_CONCEPT_PROMPTS]
    text_vectors = provider.encode_texts(prompts)
    if text_vectors.size == 0:
        return None
    sims = image_vectors @ text_vectors.T
    result: list[list[str]] = []
    for row in sims:
        best = np.argsort(-row)[:4]
        result.append([labels[int(i)] for i in best])
    return result


def compute_post_visual_features(
    posts: list[NormalizedPost],
    public_dir: Path,
    backend: str,
    model_name: str,
    batch_size: int,
    image_limit: int = 0,
) -> PostVisualFeatures:
    empty = PostVisualFeatures(
        vectors=np.zeros((len(posts), 0), dtype=np.float32),
        terms_by_post={},
        image_count=0,
        embedding_model="none",
    )
    records = post_image_records(posts, public_dir)
    if image_limit > 0 and len(records) > image_limit:
        indices = np.linspace(0, len(records) - 1, num=image_limit, dtype=np.int32)
        records = [records[int(index)] for index in indices]
        print(f"[semantic-atlas] limiting visual smoke run to {len(records)} evenly sampled images")
    if not records or backend == "none":
        return empty

    provider = build_image_embedding_provider(backend, model_name, batch_size)
    if provider is None:
        return empty

    print(f"[semantic-atlas] visual embedding backend: {provider.name}")
    try:
        image_vectors = provider.encode_images([path for _, path in records])
    except Exception as exc:
        print(f"[semantic-atlas] visual embedding failed ({exc}); continuing text-only", file=sys.stderr)
        return empty
    if len(image_vectors) != len(records):
        print(
            f"[semantic-atlas] visual embedding count mismatch ({len(image_vectors)} vectors for {len(records)} images); continuing text-only",
            file=sys.stderr,
        )
        return empty

    dims = image_vectors.shape[1]
    post_vectors = np.zeros((len(posts), dims), dtype=np.float32)
    counts = np.zeros(len(posts), dtype=np.float32)
    for image_idx, (post_idx, _) in enumerate(records):
        post_vectors[post_idx] += image_vectors[image_idx]
        counts[post_idx] += 1
    has_images = counts > 0
    post_vectors[has_images] = post_vectors[has_images] / counts[has_images, None]
    post_vectors = l2_normalize(post_vectors)
    post_vectors[~has_images] = 0

    terms_by_post: dict[str, list[str]] = {}
    try:
        model_terms = clip_visual_terms(provider, image_vectors)
    except Exception as exc:
        print(f"[semantic-atlas] visual label prompts failed ({exc}); using text heuristics for visual labels", file=sys.stderr)
        model_terms = None
    grouped_terms: dict[int, Counter[str]] = defaultdict(Counter)
    if model_terms:
        for image_idx, (post_idx, _) in enumerate(records):
            # Weight the top visual match higher but keep secondary evidence.
            for rank, term in enumerate(model_terms[image_idx]):
                grouped_terms[post_idx][term] += 3 - rank
    else:
        for post_idx, post in enumerate(posts):
            for term in heuristic_visual_terms(post):
                grouped_terms[post_idx][term] += 1
    for post_idx, counter in grouped_terms.items():
        terms_by_post[posts[post_idx].id] = [term for term, _ in counter.most_common(4)]

    return PostVisualFeatures(
        vectors=post_vectors,
        terms_by_post=terms_by_post,
        image_count=len(records),
        embedding_model=provider.name,
    )


def visual_semantic_inputs(posts: list[NormalizedPost], visual: PostVisualFeatures) -> list[str]:
    inputs: list[str] = []
    for post in posts:
        terms = visual.terms_by_post.get(post.id, [])
        if not terms:
            inputs.append("")
            continue
        # Keep this in Dutch-ish archive language because the text embedding
        # model sees the rest of the corpus in Dutch. These labels function as
        # cheap VLM captions derived from image embeddings.
        inputs.append(f"Beeldinhoud: {', '.join(terms)}.")
    return inputs


def combine_multimodal_embeddings(
    text_vectors: np.ndarray,
    visual: PostVisualFeatures,
    visual_semantic_vectors: np.ndarray,
    posts: list[NormalizedPost],
    text_weight: float,
    image_weight: float,
    visual_semantic_weight: float,
) -> np.ndarray:
    text_vectors = l2_normalize(text_vectors)
    text_weight = max(text_weight, 0.0)

    # Visual concept captions are encoded by the same text model, so fuse them in
    # text space instead of appending another sparse modality. Posts without
    # images remain normal text-only rows rather than rows with a distinctive
    # block of zeros.
    text_space = text_vectors * text_weight
    if visual_semantic_vectors.shape[1] == text_vectors.shape[1] and visual_semantic_weight > 0:
        semantic_vectors = l2_normalize(visual_semantic_vectors)
        has_semantic_visual = np.asarray([bool(visual.terms_by_post.get(post.id)) for post in posts], dtype=bool)
        row_semantic_weights = np.full(len(posts), visual_semantic_weight * 0.45, dtype=np.float32)
        row_semantic_weights[~has_semantic_visual] = 0.0
        text_space = text_space + semantic_vectors * row_semantic_weights[:, None]
    parts = [l2_normalize(text_space)]

    if visual.vectors.shape[1] > 0 and image_weight > 0:
        visual_vectors = l2_normalize(visual.vectors)
        has_visual = np.linalg.norm(visual_vectors, axis=1) > 0
        token_counts = np.asarray([len(tokenize(post.embedding_input())) for post in posts], dtype=np.float32)
        # Image evidence enriches the map, but should not create a separate
        # "has images" continent. Cap the CLIP contribution so every row keeps a
        # strong text component; rows without images naturally stay text-only.
        short_text_boost = 1.0 + np.clip((120.0 - token_counts) / 120.0, 0.0, 0.35)
        image_count_boost = 1.0 + np.asarray([min(math.log1p(post.image_count) / math.log(12), 1.0) * 0.15 for post in posts], dtype=np.float32)
        row_image_weights = image_weight * 0.42 * short_text_boost * image_count_boost
        row_image_weights[~has_visual] = 0.0
        max_image_weight = max(text_weight, 0.001) * 0.55
        row_image_weights = np.minimum(row_image_weights, max_image_weight)
        parts.append(visual_vectors * row_image_weights[:, None])

    return l2_normalize(np.concatenate(parts, axis=1))


def compute_related(vectors: np.ndarray, ids: list[str], top_k: int) -> dict[str, list[str]]:
    vectors = l2_normalize(vectors)
    related: dict[str, list[str]] = {}
    chunk = 256
    for start in range(0, len(ids), chunk):
        sims = vectors[start : start + chunk] @ vectors.T
        for local, row in enumerate(sims):
            global_idx = start + local
            row[global_idx] = -np.inf
            if top_k >= len(ids) - 1:
                best = np.argsort(-row)
            else:
                best = np.argpartition(-row, top_k)[:top_k]
                best = best[np.argsort(-row[best])]
            related[ids[global_idx]] = [ids[i] for i in best[:top_k] if np.isfinite(row[i])]
    return related


def pca_2d(vectors: np.ndarray) -> np.ndarray:
    if len(vectors) == 1:
        return np.array([[0.5, 0.5]], dtype=np.float32)
    centered = vectors - vectors.mean(axis=0, keepdims=True)
    try:
        _, _, vt = np.linalg.svd(centered, full_matrices=False)
        coords = centered @ vt[:2].T
    except np.linalg.LinAlgError:
        coords = centered[:, :2]
    if coords.shape[1] == 1:
        coords = np.column_stack([coords[:, 0], np.zeros(len(coords))])
    return coords.astype(np.float32)


def project_2d(vectors: np.ndarray, seed: int) -> tuple[np.ndarray, str]:
    try:
        import umap  # type: ignore

        n_neighbors = min(30, max(2, len(vectors) - 1))
        reducer = umap.UMAP(n_components=2, metric="cosine", n_neighbors=n_neighbors, min_dist=0.08, random_state=seed)
        coords = reducer.fit_transform(vectors)
        method = "umap"
    except Exception as exc:
        print(f"[semantic-atlas] UMAP unavailable ({exc}); using PCA fallback", file=sys.stderr)
        coords = pca_2d(vectors)
        method = "pca"
    return normalize_xy(coords), method


def reduce_for_clustering(vectors: np.ndarray, seed: int) -> tuple[np.ndarray, str]:
    try:
        import umap  # type: ignore

        n_neighbors = min(30, max(2, len(vectors) - 1))
        dims = min(12, max(2, vectors.shape[1], 2))
        reducer = umap.UMAP(n_components=min(dims, vectors.shape[1]), metric="cosine", n_neighbors=n_neighbors, min_dist=0.0, random_state=seed)
        return reducer.fit_transform(vectors).astype(np.float32), "umap"
    except Exception:
        return vectors.astype(np.float32), "embedding"


def normalize_xy(coords: np.ndarray) -> np.ndarray:
    coords = np.asarray(coords, dtype=np.float32)
    mins = coords.min(axis=0)
    maxs = coords.max(axis=0)
    spans = maxs - mins
    spans[spans == 0] = 1
    norm = (coords - mins) / spans
    # Pad away from the canvas edge.
    return (norm * 0.92 + 0.04).astype(np.float32)


def kmeans(vectors: np.ndarray, k: int, seed: int = 42, iterations: int = 60) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = len(vectors)
    if n == 0:
        return np.array([], dtype=np.int32)
    k = max(1, min(k, n))
    # KMeans++-lite initialization.
    centers = np.empty((k, vectors.shape[1]), dtype=np.float32)
    first = int(rng.integers(0, n))
    centers[0] = vectors[first]
    closest = np.sum((vectors - centers[0]) ** 2, axis=1)
    for i in range(1, k):
        total = float(closest.sum())
        if total <= 0:
            centers[i] = vectors[int(rng.integers(0, n))]
        else:
            centers[i] = vectors[int(rng.choice(n, p=closest / total))]
        closest = np.minimum(closest, np.sum((vectors - centers[i]) ** 2, axis=1))
    labels = np.zeros(n, dtype=np.int32)
    for _ in range(iterations):
        distances = ((vectors[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        next_labels = distances.argmin(axis=1).astype(np.int32)
        if np.array_equal(next_labels, labels):
            break
        labels = next_labels
        for i in range(k):
            mask = labels == i
            if mask.any():
                centers[i] = vectors[mask].mean(axis=0)
    return labels


def cluster_embeddings(vectors: np.ndarray, seed: int) -> tuple[np.ndarray, str]:
    reduced, reduction_method = reduce_for_clustering(vectors, seed)
    try:
        import hdbscan  # type: ignore

        min_cluster_size = max(8, min(45, len(vectors) // 28))
        labels = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, min_samples=max(3, min_cluster_size // 3)).fit_predict(reduced)
        non_noise = labels[labels != -1]
        cluster_count = len(set(int(label) for label in non_noise))
        largest_ratio = 1.0
        if len(non_noise):
            largest_ratio = max(Counter(int(label) for label in non_noise).values()) / len(labels)
        if cluster_count >= 8 and largest_ratio <= 0.45:
            return labels.astype(np.int32), f"{reduction_method}+hdbscan"
        print(
            f"[semantic-atlas] HDBSCAN produced weak/skewed clusters "
            f"(clusters={cluster_count}, largest_ratio={largest_ratio:.2f}); using KMeans fallback",
            file=sys.stderr,
        )
    except Exception as exc:
        print(f"[semantic-atlas] HDBSCAN unavailable ({exc}); using KMeans fallback", file=sys.stderr)
    k = max(12, min(48, round(math.sqrt(max(len(vectors), 1) / 2))))
    return kmeans(reduced, k, seed=seed), f"{reduction_method}+kmeans"


def post_category(post: NormalizedPost, visual_terms: list[str]) -> str:
    text = post.label_input().lower()
    tokens = Counter(tokenize(text))
    visual_set = {term.lower() for term in visual_terms}
    best_label = "Overig"
    best_score = 0.0
    for category in TOPIC_TAXONOMY:
        score = 0.0
        for term in category["visual"]:
            if term in visual_set:
                score += 2.4
        for term in category["text"]:
            term = str(term).lower()
            if " " in term:
                if term in text:
                    score += 1.2
            else:
                score += min(tokens.get(term, 0), 3) * 1.0
        if score > best_score:
            best_score = score
            best_label = str(category["label"])
    return best_label if best_score >= 1.5 else "Overig"


def agglomerative_cosine_labels(vectors: np.ndarray, seed: int) -> tuple[np.ndarray, str]:
    n = len(vectors)
    if n == 0:
        return np.array([], dtype=np.int32), "empty"
    if n < 10:
        return np.zeros(n, dtype=np.int32), "single-small-bucket"
    try:
        from sklearn.cluster import AgglomerativeClustering  # type: ignore
    except Exception as exc:
        k = max(1, min(8, round(math.sqrt(n / 2))))
        return kmeans(vectors, k, seed=seed), f"kmeans-no-sklearn({exc})"

    desired = max(2, min(18, round(math.sqrt(n / 3))))
    min_cluster_size = max(4, min(18, n // 35))
    best_labels: np.ndarray | None = None
    best_score = float("inf")
    best_threshold = 0.0
    # Cosine distance threshold. Lower = more, tighter clusters.
    for threshold in np.linspace(0.28, 0.68, 9):
        kwargs: dict[str, Any] = {
            "n_clusters": None,
            "distance_threshold": float(threshold),
            "linkage": "average",
        }
        try:
            model = AgglomerativeClustering(metric="cosine", **kwargs)
        except TypeError:  # older sklearn
            model = AgglomerativeClustering(affinity="cosine", **kwargs)
        try:
            labels = np.asarray(model.fit_predict(vectors), dtype=np.int32)
        except Exception:
            continue
        labels = merge_tiny_clusters(vectors, labels, min_cluster_size)
        counts = Counter(int(label) for label in labels)
        cluster_count = len(counts)
        largest_ratio = max(counts.values()) / max(n, 1)
        score = abs(cluster_count - desired) + max(0.0, largest_ratio - 0.62) * 10
        if score < best_score:
            best_score = score
            best_labels = labels
            best_threshold = float(threshold)
    if best_labels is None:
        k = max(1, min(desired, n))
        return kmeans(vectors, k, seed=seed), "kmeans-agglomerative-failed"
    return relabel_dense(best_labels), f"agglomerative-cosine@{best_threshold:.2f}"


def relabel_dense(labels: np.ndarray) -> np.ndarray:
    mapping: dict[int, int] = {}
    next_label = 0
    result = np.empty(len(labels), dtype=np.int32)
    for idx, label in enumerate(labels):
        key = int(label)
        if key not in mapping:
            mapping[key] = next_label
            next_label += 1
        result[idx] = mapping[key]
    return result


def merge_tiny_clusters(vectors: np.ndarray, labels: np.ndarray, min_cluster_size: int) -> np.ndarray:
    counts = Counter(int(label) for label in labels)
    large_labels = [label for label, count in counts.items() if count >= min_cluster_size]
    if not large_labels or len(large_labels) == len(counts):
        return labels.astype(np.int32)
    centroids = []
    for label in large_labels:
        centroid = vectors[labels == label].mean(axis=0)
        centroids.append(centroid)
    centroid_matrix = l2_normalize(np.vstack(centroids))
    result = labels.copy().astype(np.int32)
    for label, count in counts.items():
        if count >= min_cluster_size:
            continue
        mask = labels == label
        small_centroid = l2_normalize(vectors[mask].mean(axis=0, keepdims=True))[0]
        nearest = large_labels[int(np.argmax(centroid_matrix @ small_centroid))]
        result[mask] = nearest
    return result


def category_aware_cluster_embeddings(
    vectors: np.ndarray,
    posts: list[NormalizedPost],
    visual_terms_by_post: dict[str, list[str]],
    seed: int,
) -> tuple[np.ndarray, str]:
    categories: dict[str, list[int]] = defaultdict(list)
    for idx, post in enumerate(posts):
        category = post_category(post, visual_terms_by_post.get(post.id, []))
        categories[category].append(idx)

    labels = np.empty(len(posts), dtype=np.int32)
    next_label = 0
    methods: list[str] = []
    for category, indices in sorted(categories.items(), key=lambda item: (-len(item[1]), item[0])):
        local_vectors = vectors[indices]
        local_labels, method = agglomerative_cosine_labels(local_vectors, seed + next_label + len(indices))
        local_labels = relabel_dense(local_labels)
        local_count = len(set(int(label) for label in local_labels))
        for row_idx, local_label in zip(indices, local_labels):
            labels[row_idx] = next_label + int(local_label)
        next_label += local_count
        methods.append(f"{category}:{len(indices)}->{local_count}:{method}")
    print("[semantic-atlas] category clustering " + "; ".join(methods))
    return labels, "category+agglomerative-cosine"


def stable_topic_ids(labels: np.ndarray) -> tuple[list[str], dict[int, str]]:
    counts = Counter(int(label) for label in labels)
    # Noise gets a stable archive topic; other clusters sort by size desc then label.
    ordered = sorted([label for label in counts if label != -1], key=lambda label: (-counts[label], label))
    label_to_id = {-1: "topic-overig"}
    for idx, label in enumerate(ordered, start=1):
        label_to_id[label] = f"topic-{idx:02d}"
    return [label_to_id[int(label)] for label in labels], label_to_id


def extract_keywords(posts: list[NormalizedPost], topic_ids: list[str], max_terms: int = 5) -> dict[str, list[str]]:
    all_doc_tokens = [set(tokenize(post.label_input())) for post in posts]
    df = Counter(token for tokens in all_doc_tokens for token in tokens)
    n = max(len(posts), 1)
    grouped: dict[str, Counter[str]] = defaultdict(Counter)
    for post, topic_id in zip(posts, topic_ids):
        grouped[topic_id].update(tokenize(post.label_input()))
    result: dict[str, list[str]] = {}
    for topic_id, counts in grouped.items():
        scored = []
        total = max(sum(counts.values()), 1)
        for term, count in counts.items():
            if count < 2:
                continue
            idf = math.log((1 + n) / (1 + df[term])) + 1
            scored.append((count / total * idf, term))
        result[topic_id] = [term for _, term in sorted(scored, reverse=True)[:max_terms]]
    return result


def load_manual_topic_labels(path: Path | None) -> dict[str, str]:
    if not path or not path.exists() or yaml is None:
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if isinstance(data, dict) and "topics" in data:
        data = data["topics"]
    labels: dict[str, str] = {}
    if isinstance(data, dict):
        for topic_id, value in data.items():
            if isinstance(value, dict):
                label = value.get("label")
            else:
                label = value
            if label:
                labels[str(topic_id)] = str(label)
    return labels


def extract_visual_keywords(posts: list[NormalizedPost], topic_ids: list[str], terms_by_post: dict[str, list[str]]) -> dict[str, list[str]]:
    grouped: dict[str, Counter[str]] = defaultdict(Counter)
    topic_sizes: Counter[str] = Counter(topic_ids)
    for post, topic_id in zip(posts, topic_ids):
        # Count each visual label once per post so albums with many near-duplicate
        # photos do not drown out smaller but coherent posts.
        grouped[topic_id].update(set(terms_by_post.get(post.id, [])))
    result: dict[str, list[str]] = {}
    for topic_id, counts in grouped.items():
        min_support = max(2, math.ceil(topic_sizes[topic_id] * 0.08))
        terms = [term for term, count in counts.most_common() if count >= min_support]
        result[topic_id] = terms[:4]
    return result


BROAD_VISUAL_TOPIC_LABELS = {"mensen", "tuin & teelt", "dieren & insecten", "reizen & erfgoed", "documenten"}
LABEL_GENERIC_TERMS = {
    "rijden", "dag", "eerste", "goed", "zeer", "mij", "kleine", "zie", "kant", "open", "terug", "onderweg",
    "groep", "bezoek", "bericht", "frontaal", "dubbele", "gele", "witte", "rode", "oude", "nieuwe",
}
TOPIC_TAXONOMY = [
    {
        "label": "Reizen & erfgoed",
        "visual": {"reizen & erfgoed", "kerken & kastelen", "musea & steden", "landschap & natuur"},
        "text": {"kerk", "kasteel", "abdij", "museum", "stad", "antwerpen", "engeland", "reis", "wandeling", "davidsfonds", "voc", "brogdale", "londen"},
    },
    {
        "label": "Fruit & rassen",
        "visual": {"appels", "peren", "pruimen", "bessen", "druiven", "bloesem"},
        "text": {"appels", "peren", "pruimen", "bessen", "druiven", "reinette", "boskoop", "topaz", "beurré", "prunus", "kwee"},
    },
    {
        "label": "Tuin & teelt",
        "visual": {"tuin & teelt", "snoeien & enten", "ziekten & plagen"},
        "text": {"tuin", "snoei", "snoeien", "enten", "onderstam", "hoogstam", "compost", "bodem", "teelt", "bloei"},
    },
    {
        "label": "Dieren & insecten",
        "visual": {"dieren & insecten", "vogels", "kippen", "ziekten & plagen"},
        "text": {"kippen", "vogel", "vogels", "vlinder", "rups", "rupsen", "bijen", "mees", "merels", "woelmuis", "koekoek"},
    },
    {
        "label": "Mensen & familie",
        "visual": {"mensen & familie", "feest & bezoek"},
        "text": {"familie", "feest", "aleide", "leen", "tinneke", "keda", "erik", "ludo"},
    },
    {
        "label": "Documenten & bronnen",
        "visual": {"documenten"},
        "text": {"document", "artikel", "tabel", "schema", "kaart", "poster", "onderzoek"},
    },
]


def topic_category_label(text_terms: list[str], visual_terms: list[str]) -> str | None:
    text_set = {term.lower() for term in text_terms}
    visual_set = {term.lower() for term in visual_terms}
    best_label: str | None = None
    best_score = 0
    for category in TOPIC_TAXONOMY:
        visual_score = sum(2 for term in category["visual"] if term in visual_set)
        text_score = sum(1 for term in category["text"] if term in text_set)
        score = visual_score + text_score
        if score > best_score:
            best_score = score
            best_label = str(category["label"])
    return best_label if best_score >= 2 else None


def merge_topic_terms(text_terms: list[str], visual_terms: list[str]) -> list[str]:
    category = topic_category_label(text_terms, visual_terms)
    merged: list[str] = []
    if category:
        merged.append(category)
    concrete_visual_terms = [term for term in visual_terms if term.strip().lower() not in BROAD_VISUAL_TOPIC_LABELS]
    for term in text_terms + concrete_visual_terms:
        term = term.strip()
        if not term or term.lower() in LABEL_GENERIC_TERMS or term in merged:
            continue
        merged.append(term)
        if len(merged) >= 5:
            break
    return merged


def build_topics(
    posts: list[NormalizedPost],
    vectors: np.ndarray,
    topic_ids: list[str],
    manual_labels: dict[str, str],
    visual_terms_by_post: dict[str, list[str]] | None = None,
) -> list[dict[str, Any]]:
    keywords = extract_keywords(posts, topic_ids)
    visual_keywords = extract_visual_keywords(posts, topic_ids, visual_terms_by_post or {})
    by_topic: dict[str, list[int]] = defaultdict(list)
    for idx, topic_id in enumerate(topic_ids):
        by_topic[topic_id].append(idx)
    topics: list[dict[str, Any]] = []
    for topic_id, indices in by_topic.items():
        centroid = vectors[indices].mean(axis=0)
        centroid = centroid / max(np.linalg.norm(centroid), 1e-9)
        sims = vectors[indices] @ centroid
        reps = [posts[indices[i]].id for i in np.argsort(-sims)[:5]]
        text_terms = keywords.get(topic_id, [])
        visual_terms = visual_keywords.get(topic_id, [])
        terms = merge_topic_terms(text_terms, visual_terms)
        generated = ", ".join(terms) if terms else "archief, herinnering"
        topics.append(
            {
                "id": topic_id,
                "label": manual_labels.get(topic_id, generated.title() if generated else "Nog te benoemen"),
                "generatedLabel": generated,
                "visualKeywords": visual_terms,
                "textKeywords": text_terms,
                "postCount": len(indices),
                "representativePostIds": reps,
            }
        )
    topics.sort(key=lambda t: (t["id"] == "topic-overig", -t["postCount"], t["id"]))
    return topics


def post_index_json(posts: list[NormalizedPost], topic_ids: list[str]) -> list[dict[str, Any]]:
    return [
        {
            "id": post.id,
            "slug": post.slug,
            "title": post.title,
            "date": post.date,
            "isoDate": post.iso_date,
            "year": post.year,
            "month": post.month,
            "season": post.season,
            "excerpt": post.excerpt,
            "cleanedText": post.cleaned_text,
            "images": post.images,
            "imageCount": post.image_count,
            "tags": post.tags,
            "topicId": topic_id,
            "url": post.url,
        }
        for post, topic_id in zip(posts, topic_ids)
    ]


def map_points_json(posts: list[NormalizedPost], topic_ids: list[str], coords: np.ndarray) -> list[dict[str, Any]]:
    return [
        {
            "id": post.id,
            "slug": post.slug,
            "title": post.title,
            "date": post.date,
            "year": post.year,
            "month": post.month,
            "season": post.season,
            "topicId": topic_id,
            "x": round(float(coords[idx, 0]), 6),
            "y": round(float(coords[idx, 1]), 6),
            "imageCount": post.image_count,
            "image": post.images[0] if post.images else None,
            "excerpt": post.excerpt,
        }
        for idx, (post, topic_id) in enumerate(zip(posts, topic_ids))
    ]


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_outputs(output_dir: Path, outputs: dict[str, Any]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename, value in outputs.items():
        write_json(output_dir / filename, value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate static semantic atlas JSON for the archive")
    parser.add_argument("--markdown-dir", type=Path, default=Path("src/content/blog-posts"))
    parser.add_argument("--json-source", type=Path, default=None, help="Optional posts.json fallback/source")
    parser.add_argument("--html-dir", type=Path, default=None)
    parser.add_argument("--output-public", type=Path, default=Path("public/generated"))
    parser.add_argument("--output-data", type=Path, default=Path("src/data/generated"))
    parser.add_argument("--topics-yml", type=Path, default=Path("topics.yml"), help="Optional manual label overrides; defaults to ./topics.yml when present.")
    parser.add_argument("--model", default="BAAI/bge-m3")
    parser.add_argument("--embedding-backend", choices=["auto", "sentence-transformers", "tfidf"], default="auto")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--public-dir", type=Path, default=Path("public"), help="Public asset root used to resolve post image paths")
    parser.add_argument("--image-model", default="sentence-transformers/clip-ViT-B-32")
    parser.add_argument("--image-embedding-backend", choices=["auto", "sentence-transformers", "handcrafted", "none"], default="auto")
    parser.add_argument("--image-batch-size", type=int, default=32)
    parser.add_argument("--image-limit", type=int, default=0, help="Debug/smoke limit for image embeddings; 0 means all images")
    parser.add_argument("--text-weight", type=float, default=1.0)
    parser.add_argument("--image-weight", type=float, default=1.0)
    parser.add_argument("--visual-semantic-weight", type=float, default=1.0, help="Weight for CLIP-derived visual concept captions embedded with the text model")
    parser.add_argument("--related-k", type=int, default=10)
    parser.add_argument("--cluster-mode", choices=["category", "global"], default="category", help="category = classify broad buckets then cluster inside each bucket; global = legacy HDBSCAN/KMeans")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limit", type=int, default=0, help="Debug limit; 0 means all posts")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    posts = load_posts(args.markdown_dir, args.json_source, args.html_dir)
    if args.limit:
        posts = posts[: args.limit]
    if not posts:
        raise SystemExit("No posts found. Pass --markdown-dir, --json-source, or --html-dir.")

    print(f"[semantic-atlas] loaded {len(posts)} posts")
    provider = build_embedding_provider(args.embedding_backend, args.model, args.batch_size)
    print(f"[semantic-atlas] text embedding backend: {provider.name}")
    text_embeddings = provider.encode([post.embedding_input() for post in posts])
    text_embeddings = l2_normalize(text_embeddings)
    visual = compute_post_visual_features(
        posts,
        public_dir=args.public_dir,
        backend=args.image_embedding_backend,
        model_name=args.image_model,
        batch_size=args.image_batch_size,
        image_limit=args.image_limit,
    )
    visual_semantic_embeddings = np.zeros((len(posts), 0), dtype=np.float32)
    if visual.terms_by_post and args.visual_semantic_weight > 0:
        visual_inputs = visual_semantic_inputs(posts, visual)
        visual_semantic_embeddings = provider.encode([text or "geen beeldinhoud" for text in visual_inputs])
        visual_semantic_embeddings = l2_normalize(visual_semantic_embeddings)
        empty_visual_rows = np.asarray([not text for text in visual_inputs], dtype=bool)
        visual_semantic_embeddings[empty_visual_rows] = 0
    if visual.vectors.shape[1] > 0:
        print(
            f"[semantic-atlas] fusing peer text + image embeddings "
            f"(images={visual.image_count}, postCoverage={visual.coverage:.1%}, textWeight={args.text_weight}, "
            f"imageWeight={args.image_weight}, visualSemanticWeight={args.visual_semantic_weight})"
        )
    embeddings = combine_multimodal_embeddings(
        text_embeddings,
        visual,
        visual_semantic_embeddings,
        posts,
        args.text_weight,
        args.image_weight,
        args.visual_semantic_weight,
    )

    related = compute_related(embeddings, [post.id for post in posts], args.related_k)
    if args.cluster_mode == "category":
        labels, cluster_method = category_aware_cluster_embeddings(embeddings, posts, visual.terms_by_post, args.seed)
    else:
        labels, cluster_method = cluster_embeddings(embeddings, args.seed)
    topic_ids, _ = stable_topic_ids(labels)
    coords, projection_method = project_2d(embeddings, args.seed)
    topics = build_topics(posts, embeddings, topic_ids, load_manual_topic_labels(args.topics_yml), visual.terms_by_post)

    manifest = {
        "generatedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "postCount": len(posts),
        "embeddingModel": provider.name,
        "textEmbeddingModel": provider.name,
        "imageEmbeddingModel": visual.embedding_model,
        "imageCount": visual.image_count,
        "imagePostCoverage": round(visual.coverage, 4),
        "fusionMethod": "balanced-text-visual-concept-fusion-image-concat" if visual.vectors.shape[1] > 0 and args.image_weight > 0 else "text-only",
        "textWeight": args.text_weight,
        "imageWeight": args.image_weight,
        "visualSemanticWeight": args.visual_semantic_weight,
        "clusterMethod": cluster_method,
        "clusterMode": args.cluster_mode,
        "projectionMethod": projection_method,
        "relatedK": args.related_k,
        "contractVersion": 2,
    }
    outputs = {
        "posts-index.json": post_index_json(posts, topic_ids),
        "map-points.json": map_points_json(posts, topic_ids, coords),
        "topics.json": topics,
        "related-posts.json": related,
        "entities.json": [],
        "manifest.json": manifest,
    }
    public_outputs = {filename: payload for filename, payload in outputs.items() if filename not in {"posts-index.json", "related-posts.json"}}
    write_outputs(args.output_public, public_outputs)
    write_outputs(args.output_data, outputs)
    print(f"[semantic-atlas] wrote runtime JSON to {args.output_public} and full JSON to {args.output_data}")


if __name__ == "__main__":
    main()
