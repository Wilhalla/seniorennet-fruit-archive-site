#!/usr/bin/env python3
"""Generate static JSON for an image gallery atlas.

Preferred local model:
  sentence-transformers/clip-ViT-B-32

The script never serves AI at runtime. It writes static JSON consumed by the
React gallery. If the model stack is unavailable, it falls back to deterministic
handcrafted visual features so development/CI can still generate the contract.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Sequence

import numpy as np
from PIL import Image, ImageStat, UnidentifiedImageError

THEMES = [
    {"id": "bloesem", "label": "Bloesem", "icon": "🌸", "terms": ["bloesem", "bloei", "bloemen", "flower", "blossom"]},
    {"id": "appels", "label": "Appels", "icon": "🍏", "terms": ["appel", "appels", "malus", "reinette", "jonagold", "pinova", "rubin", "boskoop", "elstar"]},
    {"id": "peren", "label": "Peren", "icon": "🍐", "terms": ["peer", "peren", "beurré", "doyenné", "catillac", "comtesse"]},
    {"id": "pruimen", "label": "Pruimen", "icon": "🟣", "terms": ["pruim", "pruimen", "prunus", "reine claude", "kerspruim", "myrobolaan"]},
    {"id": "bessen", "label": "Bessen", "icon": "🫐", "terms": ["bes", "bessen", "braam", "bramen", "framboos", "frambozen", "taybes", "wijnbes", "kruisbes"]},
    {"id": "tuin", "label": "Tuin & teelt", "icon": "🌿", "terms": ["tuin", "boomgaard", "serre", "snoei", "enten", "plant", "planten", "compost", "moestuin"]},
    {"id": "mensen", "label": "Mensen", "icon": "👥", "terms": ["familie", "dochter", "kleinzoon", "bezoek", "vriend", "vrienden", "feest", "groep", "gastvrouw"]},
    {"id": "dieren", "label": "Dieren & insecten", "icon": "🐝", "terms": ["vogel", "mees", "vlinder", "bij", "bijen", "rups", "wesp", "kip", "kippen", "nest", "koekoek"]},
    {"id": "erfgoed", "label": "Reizen & erfgoed", "icon": "🏛️", "terms": ["kerk", "kasteel", "abdij", "museum", "wandeling", "engeland", "antwerpen", "reis", "uitstap"]},
    {"id": "documenten", "label": "Documenten", "icon": "📜", "terms": ["artikel", "tekening", "kaart", "schema", "tabel", "bericht"]},
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

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"}
INITIAL_CLIENT_IMAGE_COUNT = 40


def stable_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8", errors="ignore")).hexdigest()


def l2_normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return (vectors / norms).astype(np.float32)


def cosine_related(vectors: np.ndarray, ids: list[str], top_k: int = 8) -> dict[str, list[str]]:
    vectors = l2_normalize(vectors)
    related: dict[str, list[str]] = {}
    chunk = 256
    for start in range(0, len(ids), chunk):
        sims = vectors[start : start + chunk] @ vectors.T
        for local, row in enumerate(sims):
            idx = start + local
            row[idx] = -np.inf
            k = min(top_k, len(ids) - 1)
            best = np.argpartition(-row, k)[:k] if k < len(ids) - 1 else np.argsort(-row)
            best = best[np.argsort(-row[best])]
            related[ids[idx]] = [ids[int(i)] for i in best[:top_k] if np.isfinite(row[int(i)])]
    return related


def kmeans(vectors: np.ndarray, k: int, seed: int = 42, iterations: int = 50) -> np.ndarray:
    n = len(vectors)
    if n == 0:
        return np.array([], dtype=np.int32)
    k = max(1, min(k, n))
    rng = np.random.default_rng(seed)
    centers = np.empty((k, vectors.shape[1]), dtype=np.float32)
    centers[0] = vectors[int(rng.integers(0, n))]
    closest = np.sum((vectors - centers[0]) ** 2, axis=1)
    for i in range(1, k):
        total = float(closest.sum())
        centers[i] = vectors[int(rng.choice(n, p=closest / total))] if total > 0 else vectors[int(rng.integers(0, n))]
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


def image_public_to_local(src: str, public_dir: Path) -> Path:
    return public_dir / src.lstrip("/")


def season(month: int | None) -> str:
    if month in (3, 4, 5):
        return "lente"
    if month in (6, 7, 8):
        return "zomer"
    if month in (9, 10, 11):
        return "herfst"
    return "winter"


def parse_date(post: dict[str, Any]) -> tuple[str, int | None, int | None, str]:
    iso = str(post.get("isoDate") or post.get("date") or "")
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})", iso)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}", year, month, season(month)
    # DD-MM-YYYY fallback
    raw = str(post.get("date") or "")
    match = re.match(r"(\d{2})-(\d{2})-(\d{4})", raw)
    if match:
        year = int(match.group(3))
        month = int(match.group(2))
        return f"{year:04d}-{month:02d}-{int(match.group(1)):02d}", year, month, season(month)
    return raw, None, None, "winter"


def load_posts(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def make_image_records(posts: list[dict[str, Any]], public_dir: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for post in posts:
        date, year, month, post_season = parse_date(post)
        images = post.get("images") or []
        for index, src in enumerate(images):
            src = str(src)
            if Path(src).suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            local_path = image_public_to_local(src, public_dir)
            records.append(
                {
                    "id": f"img-{stable_hash(f'{post.get('id')}:{index}:{src}')[:16]}",
                    "src": src,
                    "postId": str(post.get("id") or ""),
                    "postSlug": str(post.get("slug") or ""),
                    "postTitle": str(post.get("title") or ""),
                    "date": date,
                    "isoDate": str(post.get("isoDate") or date),
                    "year": year,
                    "month": month,
                    "season": post_season,
                    "topicId": str(post.get("topicId") or ""),
                    "excerpt": str(post.get("excerpt") or ""),
                    "caption": str(post.get("title") or ""),
                    "localPath": str(local_path),
                    "imageIndex": index,
                }
            )
    return records


def image_metadata(path: Path) -> dict[str, Any]:
    try:
        with Image.open(path) as image:
            image = image.convert("RGB")
            stat = ImageStat.Stat(image.resize((1, 1)))
            color = [int(v) for v in stat.mean]
            return {"width": image.width, "height": image.height, "dominantColor": "#%02x%02x%02x" % tuple(color), "ok": True}
    except (FileNotFoundError, UnidentifiedImageError, OSError):
        return {"width": None, "height": None, "dominantColor": "#8b875f", "ok": False}


class ImageEmbeddingProvider:
    name = "base"
    supports_text = False

    def encode_images(self, paths: list[Path]) -> np.ndarray:
        raise NotImplementedError

    def encode_texts(self, texts: list[str]) -> np.ndarray:
        raise NotImplementedError


class SentenceTransformerClipProvider(ImageEmbeddingProvider):
    supports_text = True

    def __init__(self, model_name: str, batch_size: int):
        from sentence_transformers import SentenceTransformer  # type: ignore

        self.name = model_name
        self.batch_size = batch_size
        self.model = SentenceTransformer(model_name)

    def encode_images(self, paths: list[Path]) -> np.ndarray:
        images: list[Image.Image] = []
        vectors: list[np.ndarray] = []
        for path in paths:
            try:
                images.append(Image.open(path).convert("RGB"))
            except Exception:
                images.append(Image.new("RGB", (224, 224), (138, 135, 95)))
            if len(images) >= self.batch_size:
                vectors.append(np.asarray(self.model.encode(images, normalize_embeddings=True, show_progress_bar=False), dtype=np.float32))
                for img in images:
                    img.close()
                images = []
        if images:
            vectors.append(np.asarray(self.model.encode(images, normalize_embeddings=True, show_progress_bar=False), dtype=np.float32))
            for img in images:
                img.close()
        return l2_normalize(np.vstack(vectors)) if vectors else np.empty((0, 512), dtype=np.float32)

    def encode_texts(self, texts: list[str]) -> np.ndarray:
        return l2_normalize(np.asarray(self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False), dtype=np.float32))


class HandcraftedProvider(ImageEmbeddingProvider):
    name = "handcrafted-color-layout"

    def encode_images(self, paths: list[Path]) -> np.ndarray:
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


def build_provider(backend: str, model: str, batch_size: int) -> ImageEmbeddingProvider:
    if backend in ("auto", "sentence-transformers"):
        try:
            return SentenceTransformerClipProvider(model, batch_size)
        except Exception as exc:
            if backend == "sentence-transformers":
                raise
            print(f"[image-atlas] sentence-transformers image model unavailable ({exc}); using handcrafted fallback", file=sys.stderr)
    return HandcraftedProvider()


def heuristic_tags(record: dict[str, Any]) -> list[str]:
    haystack = f"{record.get('postTitle','')} {record.get('excerpt','')} {record.get('caption','')}".lower()
    tags = []
    for theme in THEMES:
        if any(term in haystack for term in theme["terms"]):
            tags.append(theme["id"])
    if not tags:
        tags.append("tuin")
    return tags[:4]


def clip_tags(provider: ImageEmbeddingProvider, image_vectors: np.ndarray) -> list[list[str]] | None:
    if not provider.supports_text:
        return None
    text_ids = list(CLIP_TEXT_PROMPTS.keys())
    text_vectors = provider.encode_texts([CLIP_TEXT_PROMPTS[key] for key in text_ids])
    sims = image_vectors @ text_vectors.T
    result = []
    for row in sims:
        best = np.argsort(-row)[:3]
        result.append([text_ids[int(i)] for i in best])
    return result


def cluster_payload(records: list[dict[str, Any]], vectors: np.ndarray, labels: np.ndarray) -> list[dict[str, Any]]:
    by_cluster: dict[int, list[int]] = defaultdict(list)
    for idx, label in enumerate(labels):
        by_cluster[int(label)].append(idx)
    payload = []
    for rank, (label, indices) in enumerate(sorted(by_cluster.items(), key=lambda item: -len(item[1])), start=1):
        centroid = vectors[indices].mean(axis=0)
        centroid = centroid / max(np.linalg.norm(centroid), 1e-9)
        sims = vectors[indices] @ centroid
        reps = [records[indices[int(i)]]["id"] for i in np.argsort(-sims)[:8]]
        tag_counts = Counter(tag for i in indices for tag in records[i].get("visualTags", []))
        payload.append(
            {
                "id": f"image-cluster-{rank:02d}",
                "postCount": len({records[i]["postId"] for i in indices}),
                "imageCount": len(indices),
                "generatedLabel": ", ".join(tag for tag, _ in tag_counts.most_common(4)) or "beelden",
                "representativeImageIds": reps,
                "sourceLabel": int(label),
            }
        )
    return payload


def group_payload(records: list[dict[str, Any]]) -> dict[str, Any]:
    years = defaultdict(int)
    seasons = defaultdict(int)
    themes = defaultdict(int)
    for record in records:
        if record.get("year"):
            years[str(record["year"])] += 1
        seasons[record.get("season") or "winter"] += 1
        for tag in record.get("visualTags", []):
            themes[tag] += 1
    return {
        "years": [{"id": key, "label": key, "count": count} for key, count in sorted(years.items(), reverse=True)],
        "seasons": [{"id": key, "label": key, "count": seasons[key]} for key in ["lente", "zomer", "herfst", "winter"] if seasons[key]],
        "themes": [
            {"id": theme["id"], "label": theme["label"], "icon": theme["icon"], "count": themes[theme["id"]]}
            for theme in THEMES
            if themes[theme["id"]]
        ],
    }


def strip_internal(record: dict[str, Any]) -> dict[str, Any]:
    copy = dict(record)
    copy.pop("localPath", None)
    return copy


def thumb_src(src: str, width: int = 480) -> str:
    if not src.startswith("/archive-images/"):
        return src
    prefix = "/archive-thumbs-240/" if width <= 240 else "/archive-thumbs/"
    return re.sub(r"\.[^.\/]+$", ".webp", src.replace("/archive-images/", prefix))


def client_image_record(record: dict[str, Any]) -> dict[str, Any]:
    src = str(record.get("src") or "")
    return {
        "id": record.get("id"),
        "src": src,
        "thumbSrc": thumb_src(src, 480),
        "postSlug": record.get("postSlug"),
        "postTitle": record.get("postTitle"),
        "date": record.get("date"),
        "isoDate": record.get("isoDate"),
        "year": record.get("year"),
        "month": record.get("month"),
        "season": record.get("season"),
        "caption": record.get("caption"),
        "excerpt": record.get("excerpt"),
        "imageIndex": record.get("imageIndex"),
        "ok": record.get("ok"),
        "visualTags": record.get("visualTags", []),
        "visualClusterId": record.get("visualClusterId"),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate static image gallery embeddings and JSON")
    parser.add_argument("--posts", type=Path, default=Path("src/data/generated/posts-index.json"))
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    parser.add_argument("--output-public", type=Path, default=Path("public/generated"))
    parser.add_argument("--output-data", type=Path, default=Path("src/data/generated"))
    parser.add_argument("--embedding-backend", choices=["auto", "sentence-transformers", "handcrafted"], default="auto")
    parser.add_argument("--model", default="sentence-transformers/clip-ViT-B-32")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--related-k", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limit", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    posts = load_posts(args.posts)
    records = make_image_records(posts, args.public_dir)
    if args.limit:
        records = records[: args.limit]
    print(f"[image-atlas] loaded {len(records)} image references")
    for record in records:
        record.update(image_metadata(Path(record["localPath"])))
        record["visualTags"] = heuristic_tags(record)

    provider = build_provider(args.embedding_backend, args.model, args.batch_size)
    print(f"[image-atlas] embedding backend: {provider.name}")
    vectors = provider.encode_images([Path(record["localPath"]) for record in records])

    model_tags = clip_tags(provider, vectors)
    if model_tags:
        for record, tags in zip(records, model_tags):
            # Keep post-context tags first, then add visual model tags.
            record["visualTags"] = list(dict.fromkeys(record["visualTags"] + tags))[:5]

    related = cosine_related(vectors, [record["id"] for record in records], args.related_k)
    k = max(8, min(64, round(math.sqrt(max(len(records), 1) / 4))))
    labels = kmeans(vectors, k=k, seed=args.seed)
    clusters = cluster_payload(records, vectors, labels)
    source_to_cluster = {cluster["sourceLabel"]: cluster["id"] for cluster in clusters}
    for record, label in zip(records, labels):
        record["visualClusterId"] = source_to_cluster[int(label)]

    manifest = {
        "generatedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "imageCount": len(records),
        "embeddingModel": provider.name,
        "contractVersion": 1,
    }
    client_records = [client_image_record(record) for record in records]
    outputs = {
        "image-index.json": [strip_internal(record) for record in records],
        "image-index.client.json": client_records,
        "image-index.initial.json": client_records[:INITIAL_CLIENT_IMAGE_COUNT],
        "image-related.json": related,
        "image-clusters.json": [{k: v for k, v in cluster.items() if k != "sourceLabel"} for cluster in clusters],
        "gallery-groups.json": group_payload(records),
        "image-manifest.json": manifest,
    }
    public_outputs = {filename: payload for filename, payload in outputs.items() if filename != "image-index.json"}
    for filename, payload in public_outputs.items():
        write_json(args.output_public / filename, payload)
    for filename, payload in outputs.items():
        write_json(args.output_data / filename, payload)
    print(f"[image-atlas] wrote runtime JSON to {args.output_public} and full JSON to {args.output_data}")


if __name__ == "__main__":
    main()
