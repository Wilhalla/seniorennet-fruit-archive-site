#!/usr/bin/env python3
"""Score accepted image captions with grouped Jev decisions on OpenRouter."""
from __future__ import annotations

import argparse
import math
import re
from pathlib import Path
from typing import Any

from archive_ml import (WORK, digest, image_state, load_json, openrouter_key, question_hash,
                        request_jev, validate_batch_answers, validate_vocabulary, write_json)
from archive_ml_counts import selected_tags
from archive_ml_units import meaningful_image_text


FAMILY_TITLE = re.compile(r"\b(familie|familiefeest|dochter|zoon|kleinkind(?:eren)?|kleindochter|kleinzoon|broer|zus|moeder|vader|mama|papa|opa|oma|nonkel|tante|nicht(?:je)?s?|neef(?:je)?s?|communie|huwelijk|trouwfeest)\b", re.I)
CELEBRATION_TITLE = re.compile(r"\b(familiefeest|verjaardag|communie|jubileum|trouwfeest|huwelijk|nieuwjaarsfeest)\b", re.I)


def selected_image_tags(observation: dict[str, Any], prediction: dict[str, Any],
                        vocabulary: dict[str, Any], post_categories: dict[str, Any]) -> set[str]:
    """Combine visual scores with explicit post evidence for family photos."""
    scores = prediction["tagScores"]
    tags = selected_tags(scores, vocabulary)
    post = post_categories.get(str(observation["postId"]), {})
    context = observation.get("linkedContext") or {}
    title = " ".join(value for value in (context.get("postTitle"), context.get("seriesTitle")) if value)
    image_specific_text = any(link.get("kind") in {"image-alt", "image-title", "numbered-caption"}
                              and link.get("sourcePostId") == observation["postId"]
                              and meaningful_image_text(link.get("text") or "")
                              for link in context.get("linkedText", []))
    excerpt_relation = FAMILY_TITLE.search(context.get("postExcerpt") or "") and image_specific_text
    real_people = scores.get("mensen", 0) >= 0.65
    if not real_people:
        tags.discard("familie")
    if real_people and "familie" in post.get("categoryIds", []) and (FAMILY_TITLE.search(title) or excerpt_relation):
        tags.add("familie")
    if real_people and "familiefeesten" in post.get("tagIds", []) and CELEBRATION_TITLE.search(title):
        tags.add("familiefeest")
    return tags


def image_batch_payload(rows: list[dict[str, Any]], vocabulary: dict[str, Any]) -> dict[str, Any]:
    from archive_ml import jev_batch_payload
    return jev_batch_payload([image_state(row) for row in rows], vocabulary)


def classify_images(args: argparse.Namespace) -> None:
    if not args.paid or args.max_images is None or args.max_usd is None:
        raise ValueError("Image Jev run requires --paid, --max-images and --max-usd")
    if args.max_images < 1 or args.max_usd <= 0 or not 1 <= args.batch_size <= 12:
        raise ValueError("positive limits and batch-size 1-12 are required")
    vocabulary = load_json(args.vocabulary)
    validate_vocabulary(vocabulary)
    rows = load_json(args.observations)[:args.max_images]
    if not rows or len({row["id"] for row in rows}) != len(rows):
        raise ValueError("observations need unique image IDs")
    vocabulary_hash = question_hash(vocabulary)
    output = load_json(args.output) if args.output.exists() else {}
    cache_dir = WORK / "cache/image-jev/batches"
    ledger_path = WORK / "cache/image-jev/paid-requests.json"
    ledger = load_json(ledger_path) if ledger_path.exists() else {}
    spent = sum(float(cost) for cost in ledger.values())
    requests = 0
    completed = 0
    for start in range(0, len(rows), args.batch_size):
        batch = rows[start:start + args.batch_size]
        payload = image_batch_payload(batch, vocabulary)
        batch_hash = digest(payload)
        if all(output.get(row["id"], {}).get("batchHash") == batch_hash for row in batch):
            continue
        cache_path = cache_dir / f"{batch_hash}.json"
        if cache_path.exists():
            raw_response = load_json(cache_path)
        else:
            if spent + args.reserve_usd > args.max_usd:
                raise RuntimeError(f"image Jev ceiling reached after {start}/{len(rows)} images")
            key = openrouter_key()
            if not key:
                raise ValueError("OPENROUTER_API_KEY is missing")
            raw_response = request_jev(payload, key)
            requests += 1
        results = validate_batch_answers(raw_response, vocabulary, len(batch))
        reported = (raw_response.get("usage") or {}).get("cost")
        if not isinstance(reported, (int, float)) or not math.isfinite(reported) or reported < 0:
            raise ValueError("Jev response lacks a valid cost")
        if not cache_path.exists():
            write_json(cache_path, raw_response)
        if batch_hash not in ledger:
            ledger[batch_hash] = float(reported)
            spent += float(reported)
            write_json(ledger_path, ledger)
        for row, result in zip(batch, results, strict=True):
            output[row["id"]] = {**result, "imageId": row["id"], "postId": row["postId"],
                                  "vocabularyVersion": vocabulary["version"],
                                  "vocabularyHash": vocabulary_hash,
                                  "inputHash": digest(image_state(row)), "batchHash": batch_hash}
            completed += 1
        if requests and requests % 25 == 0:
            write_json(args.output, output)
            print(f"Scored {len(output)}/{len(rows)} images; {requests} new Jev calls; ${spent:.4f} recorded", flush=True)
        if spent > args.max_usd:
            raise RuntimeError("reported image Jev spend exceeded ceiling; set a provider cap for a hard limit")
    write_json(args.output, output)
    print(f"Scored {len(output)}/{len(rows)} images; {requests} new calls; ${spent:.6f} recorded")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", type=Path, default=WORK / "image-observations.json")
    parser.add_argument("--vocabulary", type=Path, default=Path("ml/image-vocabulary.approved.json"))
    parser.add_argument("--output", type=Path, default=WORK / "image-tag-scores.json")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--paid", action="store_true")
    parser.add_argument("--max-images", type=int)
    parser.add_argument("--max-usd", type=float)
    parser.add_argument("--reserve-usd", type=float, default=0.05)
    classify_images(parser.parse_args())


if __name__ == "__main__":
    main()
