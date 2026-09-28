#!/usr/bin/env python3
"""Build a semantic Atlas preview from paid, cached text embeddings.

This does not write site JSON. The preview can be reviewed before a cutover.
Install numpy and umap-learn from requirements-archive-ml.txt for the map projection.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from archive_ml import load_json, write_json
from archive_ml_units import build_units


def normalized_vectors(rows: list[list[float]]) -> np.ndarray:
    vectors = np.asarray(rows, dtype=np.float32)
    if vectors.ndim != 2 or len(vectors) < 3 or not np.isfinite(vectors).all():
        raise ValueError("need at least three finite embeddings with equal dimensions")
    norms = np.linalg.norm(vectors, axis=1)
    if np.any(norms <= 1e-8):
        raise ValueError("zero-length embedding")
    return vectors / norms[:, None]


def nearest_neighbors(vectors: np.ndarray, ids: list[str], k: int = 5) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    # Blocked multiplication keeps memory bounded on the full 3,281-post archive.
    for start in range(0, len(ids), 128):
        similarities = vectors[start:start + 128] @ vectors.T
        for offset, scores in enumerate(similarities):
            index = start + offset
            scores[index] = -np.inf
            indices = np.argsort(-scores, kind="stable")[:k]
            result[ids[index]] = [ids[int(other)] for other in indices]
    return result


def map_coordinates(vectors: np.ndarray) -> np.ndarray:
    try:
        import umap
    except ImportError as error:
        raise RuntimeError("Install requirements-archive-ml.txt to project the Atlas map") from error
    projection = umap.UMAP(n_components=2, n_neighbors=min(20, len(vectors) - 1),
                           min_dist=0.15, metric="cosine", random_state=42).fit_transform(vectors)
    # Clip outliers only for drawing; related posts always use original vectors.
    low = np.percentile(projection, 1, axis=0)
    high = np.percentile(projection, 99, axis=0)
    span = np.maximum(high - low, 1e-6)
    return np.clip((projection - low) / span, 0, 1)


def preview(units: list[dict], embeddings: dict, predictions: dict, sample_ids: set[str] | None = None) -> dict:
    selected = [unit for unit in units if unit["id"] in embeddings and (sample_ids is None or unit["id"] in sample_ids)]
    if len(selected) < 3:
        raise ValueError("need at least three matching browse-unit embeddings")
    models = {embeddings[unit["id"]]["model"] for unit in selected}
    if len(models) != 1:
        raise ValueError("embeddings from different models cannot share one map")
    ids = [unit["id"] for unit in selected]
    vectors = normalized_vectors([embeddings[unit_id]["vector"] for unit_id in ids])
    neighbors = nearest_neighbors(vectors, ids)
    coordinates = map_coordinates(vectors)
    points = [{"id": unit["id"], "title": unit["title"], "postIds": unit["postIds"],
               "x": round(float(x), 6), "y": round(float(y), 6),
               "topTagIds": [tag_id for tag_id, _ in sorted(predictions.get(unit["id"], {}).get("tagScores", {}).items(), key=lambda item: -item[1])[:5]],
               "neighbors": neighbors[unit["id"]]} for unit, (x, y) in zip(selected, coordinates)]
    return {"model": next(iter(models)), "method": "umap-cosine-v1", "unitCount": len(points), "points": points}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--posts", type=Path, default=Path("src/data/generated/posts-index.json"))
    parser.add_argument("--series", type=Path, default=Path("src/data/post-series.json"))
    parser.add_argument("--embeddings", type=Path, default=Path("ml-work/embeddings.json"))
    parser.add_argument("--predictions", type=Path, default=Path("ml-work/tag-scores.json"))
    parser.add_argument("--sample", type=Path, help="Optional review sample JSON; omit for full archive")
    parser.add_argument("--output", type=Path, default=Path("ml-work/atlas-preview.json"))
    args = parser.parse_args()
    sample_ids = {row["id"] for row in load_json(args.sample)} if args.sample else None
    predictions = load_json(args.predictions) if args.predictions.exists() else {}
    result = preview(build_units(load_json(args.posts), load_json(args.series)["series"]),
                     load_json(args.embeddings), predictions, sample_ids)
    write_json(args.output, result)
    print(f"Wrote {result['unitCount']} points and nearest neighbors to {args.output}")


if __name__ == "__main__":
    main()
