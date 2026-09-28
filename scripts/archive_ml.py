#!/usr/bin/env python3
"""Review-first, tag-first archive pipeline. Run from the repository root.

No command contacts a paid service unless --paid, --max-items and --max-usd are
all supplied. Results are cached by source and vocabulary hashes.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import random
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

from archive_ml_units import build_units, image_context, image_state, unit_state, usable_image_links
from archive_ml_counts import bundle_categories, evaluate_tags, summarize_tags

POSTS = Path("src/data/generated/posts-index.json")
IMAGES = Path("public/generated/image-index.client.json")
SERIES = Path("src/data/post-series.json")
RAW_POSTS = Path("src/data/posts.json")
WORK = Path("ml-work")
JEV_MODEL = "typesafe/jev-1.13"
JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions"
EMBED_ENDPOINT = "https://openrouter.ai/api/v1/embeddings"


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def digest(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def sample_evenly(rows: list[dict[str, Any]], count: int, group: str, seed: int) -> list[dict[str, Any]]:
    """Round-robin across legacy groups; labels are used for sampling only."""
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        buckets[str(row.get(group) or "unknown")].append(row)
    rng = random.Random(seed)
    for bucket in buckets.values():
        rng.shuffle(bucket)
    order = sorted(buckets, key=lambda key: (-len(buckets[key]), key))
    chosen: list[dict[str, Any]] = []
    while len(chosen) < min(count, len(rows)):
        progressed = False
        for key in order:
            if buckets[key] and len(chosen) < count:
                chosen.append(buckets[key].pop())
                progressed = True
        if not progressed:
            break
    return chosen


def split_for(identifier: str) -> str:
    # Fixed holdout assignment: changing sample size does not move an item.
    return "holdout" if int(hashlib.sha256(identifier.encode()).hexdigest()[:8], 16) % 5 == 0 else "development"


def make_sample(post_count: int, image_count: int, output: Path) -> None:
    source_posts = load_json(POSTS)
    images = load_json(IMAGES)
    raw_posts = load_json(RAW_POSTS)
    series = load_json(SERIES)["series"]
    source_hashes = {"posts": digest(source_posts), "images": digest(images),
                     "rawPosts": digest(raw_posts), "series": digest(series)}
    old_manifest = output / "sample-manifest.json"
    if old_manifest.exists():
        old_hashes = load_json(old_manifest).get("sourceHashes", {})
        if any(source_hashes.get(key) != value for key, value in old_hashes.items()):
            raise ValueError("source JSON changed; archive the existing review labels before regenerating the sample")
    units = sample_evenly(build_units(source_posts, series), post_count, "legacyTopicId", 42)
    pinned = Path("ml/review-set.json")
    if image_count == 100 and pinned.exists():
        image_by_id = {image["id"]: image for image in images}
        sampled_images = [image_by_id[row["id"]] for row in load_json(pinned)["images"]]
    else:
        sampled_images = sample_evenly(images, image_count, "year", 43)
    unit_rows = [{
        "id": unit["id"], "split": split_for(unit["id"]), "title": unit["title"],
        "parts": unit["parts"], "postIds": unit["postIds"], "imageCount": unit["imageCount"],
        "seriesSource": unit["seriesSource"], "legacyTopicId": unit["legacyTopicId"],
        "goldTagIds": [], "tagReviewStatus": "unreviewed", "reviewNotes": "",
    } for unit in units]
    raw_by_slug = {post["slug"]: post for post in raw_posts}
    series_by_post = {post_id: item for item in series for post_id in item["postIds"]}
    image_rows = [{
        "id": image["id"], "split": split_for(image["id"]), "src": image["src"],
        "postSlug": image.get("postSlug"), "postTitle": image.get("postTitle"),
        "legacyTags": image.get("visualTags", []), "description": None,
        "visibleTags": [], "descriptionModel": None, "reviewNotes": "",
        "linkedContext": image_context(image, raw_by_slug[image["postSlug"]],
                                       series_by_post.get(raw_by_slug[image["postSlug"]]["id"])),
    } for image in sampled_images]
    old_units = {row["id"]: row for row in load_json(output / "units.json")} if (output / "units.json").exists() else {}
    old_images = {row["id"]: row for row in load_json(output / "images.json")} if (output / "images.json").exists() else {}
    for row in unit_rows:
        for key in ("goldTagIds", "tagReviewStatus", "reviewNotes"):
            if row["id"] in old_units and key in old_units[row["id"]]:
                row[key] = old_units[row["id"]][key]
    for row in image_rows:
        for key in ("description", "visibleTags", "descriptionModel", "descriptionStatus", "unclear", "reviewNotes", "goldVisibleTags"):
            if row["id"] in old_images and key in old_images[row["id"]]:
                row[key] = old_images[row["id"]][key]
    write_json(output / "units.json", unit_rows)
    write_json(output / "images.json", image_rows)
    write_json(output / "sample-manifest.json", {
        "sourceHashes": source_hashes,
        "seed": 42, "unitCount": len(unit_rows), "imageCount": len(image_rows),
        "note": "Series are browse units. Legacy labels are sampling metadata, not ground truth. Keep holdout labels unseen during tag discovery and threshold tuning.",
    })
    print(f"Wrote {len(unit_rows)} browse units and {len(image_rows)} images to {output}")


def validate_vocabulary(vocabulary: dict[str, Any]) -> None:
    if not isinstance(vocabulary.get("version"), str) or not vocabulary["version"].strip():
        raise ValueError("vocabulary.version is required")
    tags = vocabulary.get("tags")
    if not isinstance(tags, list) or not tags:
        raise ValueError("vocabulary.tags must be a nonempty list")
    ids: set[str] = set()
    for item in tags:
        if not all(isinstance(item.get(key), str) and item[key].strip() for key in ("id", "label", "question", "definition")):
            raise ValueError("every tag needs id, label, question and definition")
        if item["id"] in ids:
            raise ValueError(f"duplicate tag ID: {item['id']}")
        if not re.fullmatch(r"[a-z][a-z0-9_]*", item["id"]):
            raise ValueError(f"tag ID must be lowercase snake_case: {item['id']}")
        threshold = item.get("threshold", 0.5)
        if not isinstance(threshold, (int, float)) or not 0 < threshold < 1:
            raise ValueError(f"invalid threshold for {item['id']}")
        ids.add(item["id"])


def jev_payload(state: dict[str, Any], vocabulary: dict[str, Any]) -> dict[str, Any]:
    validate_vocabulary(vocabulary)
    questions = {item["id"]: {"type": "noul", "instructions": item["question"] + " " + item["definition"]}
                 for item in vocabulary["tags"]}
    return {"model": JEV_MODEL, "state": state, "questions": questions}


def jev_batch_payload(states: list[dict[str, Any]], vocabulary: dict[str, Any]) -> dict[str, Any]:
    """Ask the same independent tag questions about each named archive unit."""
    if not states:
        raise ValueError("Jev batch must contain at least one unit")
    base_questions = jev_payload({}, vocabulary)["questions"]
    questions = {
        f"r{index}__{tag_id}": {
            "type": "noul",
            "instructions": f'For the record with id "r{index}", and only that record: {question["instructions"]}',
        }
        for index in range(len(states))
        for tag_id, question in base_questions.items()
    }
    records = [{"id": f"r{index}", **state} for index, state in enumerate(states)]
    return {"model": JEV_MODEL, "state": {"records": records}, "questions": questions}


def question_hash(vocabulary: dict[str, Any]) -> str:
    """Threshold or display-label edits do not invalidate paid Jev scores."""
    return digest(jev_payload({}, vocabulary)["questions"])


def load_observations(path: Path | None) -> dict[str, list[dict[str, Any]]]:
    if path is None:
        return {}
    rows = load_json(path)
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("description") and row.get("postSlug") and row.get("descriptionStatus") == "reviewed":
            if not row.get("descriptionModel"):
                raise ValueError(f"image {row.get('id')} needs descriptionModel provenance")
            context = row.get("linkedContext") or {}
            result[row["postSlug"]].append({
                "imageId": row["id"], "visualDescription": row["description"].strip()[:240],
                "sourcePostId": context.get("postId"), "linkedText": usable_image_links(context),
            })
    return dict(result)


def validate_answer(response: dict[str, Any], vocabulary: dict[str, Any]) -> dict[str, Any]:
    answers = response.get("answers") or {}
    scores: dict[str, float] = {}
    for tag in vocabulary["tags"]:
        answer = answers.get(tag["id"]) or {}
        probability = answer.get("noul")
        if answer.get("type") != "noul" or not isinstance(probability, (int, float)) or not 0 <= probability <= 1:
            raise ValueError(f"invalid tag answer: {tag['id']}")
        scores[tag["id"]] = float(probability)
    usage = response.get("usage") or {}
    cost = usage.get("cost")
    if not isinstance(cost, (int, float)) or cost < 0 or not math.isfinite(cost):
        raise ValueError("Jev response lacks usable cost; stop batch to protect budget")
    return {"tagScores": scores, "model": response.get("model"), "usage": usage}


def validate_batch_answers(response: dict[str, Any], vocabulary: dict[str, Any], count: int) -> list[dict[str, Any]]:
    """Validate every answer before writing any per-unit result."""
    usage = response.get("usage") or {}
    cost = usage.get("cost")
    if not isinstance(cost, (int, float)) or cost < 0 or not math.isfinite(cost):
        raise ValueError("Jev response lacks usable cost; stop batch to protect budget")
    answers = response.get("answers") or {}
    results = []
    for index in range(count):
        item_answers = {tag["id"]: answers.get(f'r{index}__{tag["id"]}') for tag in vocabulary["tags"]}
        per_unit = validate_answer({"answers": item_answers, "model": response.get("model"),
                                    "usage": {"cost": cost / count}}, vocabulary)
        per_unit["usage"]["batchCostUsd"] = cost
        results.append(per_unit)
    return results


def request_jev(payload: dict[str, Any], key: str) -> dict[str, Any]:
    data = json.dumps(payload).encode()
    request = urllib.request.Request(JEV_ENDPOINT, data=data, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json",
    }, method="POST")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504, 520, 524) or attempt == 3:
                raise RuntimeError(f"Jev HTTP {error.code}: {error.read().decode()[:500]}") from error
            time.sleep(min(15, 2 ** attempt))
    raise RuntimeError("Jev retry limit reached")


def request_embedding(payload: dict[str, Any], key: str) -> dict[str, Any]:
    request = urllib.request.Request(EMBED_ENDPOINT, data=json.dumps(payload).encode(), headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json",
    }, method="POST")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504, 520, 524) or attempt == 3:
                raise RuntimeError(f"Embeddings HTTP {error.code}: {error.read().decode()[:500]}") from error
            time.sleep(min(15, 2 ** attempt))
    raise RuntimeError("Embeddings retry limit reached")


def validate_embeddings(response: dict[str, Any], count: int, price_per_million: float) -> list[dict[str, Any]]:
    data = response.get("data") or []
    tokens = (response.get("usage") or {}).get("prompt_tokens")
    indices = [row.get("index") for row in data]
    if len(data) != count or not all(isinstance(index, int) for index in indices) or sorted(indices) != list(range(count)):
        raise ValueError("embedding response has missing or duplicate indices")
    ordered = sorted(data, key=lambda row: row["index"])
    dimensions = {len(row.get("embedding") or []) for row in ordered}
    if len(dimensions) != 1 or 0 in dimensions or any(
        not isinstance(row.get("embedding"), list) or
        not all(isinstance(value, (int, float)) and math.isfinite(value) for value in row["embedding"])
        for row in ordered
    ):
        raise ValueError("invalid embedding vector")
    if not isinstance(tokens, int) or tokens < 0:
        raise ValueError("embedding response has no prompt token count")
    estimated_cost = tokens * price_per_million / 1_000_000
    return [{"vector": row["embedding"], "model": response.get("model"),
             "usage": {"batchPromptTokens": tokens, "batchEstimatedCostUsd": estimated_cost,
                       "estimatedCostUsd": estimated_cost / count}} for row in ordered]


def validate_embedding(response: dict[str, Any], price_per_million: float) -> dict[str, Any]:
    """Compatibility wrapper for a single embedding response."""
    return validate_embeddings(response, 1, price_per_million)[0]


def openrouter_key() -> str | None:
    if os.environ.get("OPENROUTER_API_KEY"):
        return os.environ["OPENROUTER_API_KEY"]
    # The repository uses a local .env. Do not print or copy its contents.
    dot_env = Path(".env")
    if dot_env.exists():
        for line in dot_env.read_text(encoding="utf-8").splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                return line.partition("=")[2].strip().strip("\"'")
    return None


def load_all_units() -> list[dict[str, Any]]:
    return build_units(load_json(POSTS), load_json(SERIES)["series"])


def planned_tag_batches(units: list[dict[str, Any]], observations: dict[str, list[dict[str, Any]]],
                        vocabulary: dict[str, Any], batch_size: int, max_payload_chars: int
                        ) -> list[list[tuple[dict[str, Any], dict[str, Any]]]]:
    """Keep complete units together while limiting the size of each Jev request."""
    if not 1 <= batch_size <= 8 or max_payload_chars <= 0:
        raise ValueError("batch-size must be 1-8 and max-payload-chars must be positive")
    batches: list[list[tuple[dict[str, Any], dict[str, Any]]]] = []
    current: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for unit in units:
        record = (unit, unit_state(unit, observations))
        proposed = [*current, record]
        if current and (len(proposed) > batch_size or
                        len(json.dumps(jev_batch_payload([state for _, state in proposed], vocabulary))) > max_payload_chars):
            batches.append(current)
            proposed = [record]
        size = len(json.dumps(jev_batch_payload([state for _, state in proposed], vocabulary)))
        if size > max_payload_chars:
            raise ValueError(f"unit {unit['id']} needs {size} payload characters, above limit {max_payload_chars}")
        current = proposed
    if current:
        batches.append(current)
    return batches


def plan_tags(args: argparse.Namespace) -> None:
    vocabulary = load_json(args.vocabulary)
    validate_vocabulary(vocabulary)
    selected = {row["id"] for row in load_json(args.sample)} if args.sample else None
    all_units = load_all_units()
    if selected is not None and selected - {unit["id"] for unit in all_units}:
        raise ValueError(f"sample has unknown browse units: {sorted(selected - {unit['id'] for unit in all_units})}")
    units = [unit for unit in all_units if selected is None or unit["id"] in selected]
    batches = planned_tag_batches(units, load_observations(args.observations), vocabulary,
                                  args.batch_size, args.max_payload_chars)
    largest = max((len(json.dumps(jev_batch_payload([state for _, state in batch], vocabulary)))
                   for batch in batches), default=0)
    print(f"Planned {len(batches)} Jev requests for {len(units)} complete browse units; largest payload {largest} characters")


def classify(args: argparse.Namespace) -> None:
    vocabulary = load_json(args.vocabulary)
    validate_vocabulary(vocabulary)
    if not args.paid or args.max_items is None or args.max_usd is None:
        raise ValueError("Paid classification requires --paid, --max-items and --max-usd")
    if args.max_items <= 0 or args.max_usd <= 0:
        raise ValueError("max-items and max-usd must be positive")
    if vocabulary.get("status") != "approved":
        if not (getattr(args, "trial", False) and args.sample and args.max_items <= 20 and args.max_usd <= 0.10):
            raise ValueError("draft vocabulary requires --trial, --sample, --max-items <= 20 and --max-usd <= 0.10")
    observations = load_observations(args.observations)
    all_units = load_all_units()
    valid_unit_ids = {unit["id"] for unit in all_units}
    units = all_units
    selected = {row["id"] for row in load_json(args.sample)} if args.sample else None
    if selected is not None:
        if selected - valid_unit_ids:
            raise ValueError(f"sample has unknown browse units: {sorted(selected - valid_unit_ids)}")
        units = [unit for unit in units if unit["id"] in selected]
    batches = planned_tag_batches(units, observations, vocabulary, args.batch_size,
                                  getattr(args, "max_payload_chars", 64000))
    vocabulary_hash = question_hash(vocabulary)
    output = load_json(args.output) if args.output.exists() else {}
    output = {unit_id: row for unit_id, row in output.items()
              if unit_id in valid_unit_ids and row.get("vocabularyHash") == vocabulary_hash}
    cache_dir = WORK / "cache" / "jev"
    spend_path = cache_dir / "paid-requests.json"
    if spend_path.exists():
        paid_requests = load_json(spend_path)
    else:
        # Carry forward costs from older per-unit runs that had no request ledger.
        legacy_cost = sum(float(row["usage"]["cost"]) for row in output.values() if "usage" in row)
        paid_requests = {"legacy-output": legacy_cost} if legacy_cost else {}
    spent = sum(float(cost) for cost in paid_requests.values())
    completed = 0
    requests = 0
    for batch in batches:
        states = [state for _, state in batch]
        payload = jev_batch_payload(states, vocabulary)
        batch_hash = digest(payload)
        if all(output.get(unit["id"], {}).get("batchHash") == batch_hash for unit, _ in batch):
            continue
        if completed + len(batch) > args.max_items or spent + args.reserve_usd > args.max_usd:
            break
        batch_cache = cache_dir / "batches" / f"{batch_hash}.json"
        if batch_cache.exists():
            raw_response = load_json(batch_cache)
        else:
            key = openrouter_key()
            if not key:
                raise ValueError("OPENROUTER_API_KEY is missing")
            raw_response = request_jev(payload, key)
            write_json(batch_cache, raw_response)
            requests += 1
        reported_cost = (raw_response.get("usage") or {}).get("cost")
        if not isinstance(reported_cost, (int, float)) or reported_cost < 0 or not math.isfinite(reported_cost):
            raise ValueError("Jev response lacks usable cost; stop batch to protect budget")
        if batch_hash not in paid_requests:
            paid_requests[batch_hash] = float(reported_cost)
            spent += paid_requests[batch_hash]
            write_json(spend_path, paid_requests)
        results = validate_batch_answers(raw_response, vocabulary, len(batch))
        for (unit, state), result in zip(batch, results, strict=True):
            output[unit["id"]] = {**result, "unitId": unit["id"], "postIds": unit["postIds"],
                                  "vocabularyVersion": vocabulary["version"], "vocabularyHash": vocabulary_hash,
                                  "inputHash": digest(state), "batchHash": batch_hash}
            completed += 1
        write_json(args.output, output)
        if requests and requests % 25 == 0:
            print(f"Tagged {completed}/{len(units)} units; {requests} paid requests; recorded total ${spent:.4f}", flush=True)
        if spent > args.max_usd:
            raise RuntimeError("Reported cost exceeded ceiling; stop and use a provider key spending limit for a hard cap")
    print(f"Tagged {completed} new browse units in {requests} paid requests; recorded total ${spent:.6f}; {len(output)} cached records")


def embedding_text(unit: dict[str, Any], observations: dict[str, list[dict[str, Any]]]) -> str:
    state = unit_state(unit, observations)
    text_value = f"Titel: {state['title']}\nTekst: {state['post_text']}"
    for image in state.get("reviewed_images", []):
        text_value += f"\nAfbeelding {image['image_id']}: {image['visual_description']}"
    return text_value


def planned_embedding_batches(units: list[dict[str, Any]], observations: dict[str, list[dict[str, Any]]],
                              batch_size: int, max_payload_chars: int
                              ) -> list[list[tuple[dict[str, Any], str]]]:
    if not 1 <= batch_size <= 32 or max_payload_chars <= 0:
        raise ValueError("embedding batch-size must be 1-32 and max-payload-chars must be positive")
    batches: list[list[tuple[dict[str, Any], str]]] = []
    current: list[tuple[dict[str, Any], str]] = []
    for unit in units:
        record = (unit, embedding_text(unit, observations))
        if len(record[1]) > max_payload_chars:
            raise ValueError(f"embedding input {unit['id']} exceeds {max_payload_chars} characters")
        if current and (len(current) >= batch_size or sum(len(text_value) for _, text_value in current) + len(record[1]) > max_payload_chars):
            batches.append(current)
            current = []
        current.append(record)
    if current:
        batches.append(current)
    return batches


def embed(args: argparse.Namespace) -> None:
    if not args.paid or args.max_items is None or args.max_usd is None or args.price_per_million is None:
        raise ValueError("Paid embeddings require --paid, --max-items, --max-usd and --price-per-million")
    if min(args.max_items, args.max_usd, args.price_per_million) <= 0:
        raise ValueError("embedding limits and price must be positive")
    observations = load_observations(args.observations)
    all_units = load_all_units()
    selected = {row["id"] for row in load_json(args.sample)} if args.sample else None
    valid_unit_ids = {unit["id"] for unit in all_units}
    if selected is not None and selected - valid_unit_ids:
        raise ValueError(f"sample has unknown browse units: {sorted(selected - valid_unit_ids)}")
    units = [unit for unit in all_units if selected is None or unit["id"] in selected]
    batches = planned_embedding_batches(units, observations, args.batch_size, args.max_payload_chars)
    output = load_json(args.output) if args.output.exists() else {}
    output = {unit_id: row for unit_id, row in output.items()
              if unit_id in valid_unit_ids and row.get("requestedModel", row.get("model")) == args.model}
    cache_dir = WORK / "cache" / "embeddings" / "batches"
    spend_path = WORK / "cache" / "embeddings" / "estimated-spend.json"
    paid_requests = load_json(spend_path) if spend_path.exists() else {}
    spent = sum(float(cost) for cost in paid_requests.values())
    completed = requests = 0
    for batch in batches:
        payload = {"model": args.model, "input": [text_value for _, text_value in batch]}
        batch_hash = digest(payload)
        if all(output.get(unit["id"], {}).get("batchHash") == batch_hash for unit, _ in batch):
            continue
        if completed + len(batch) > args.max_items:
            break
        cache_path = cache_dir / f"{batch_hash}.json"
        if cache_path.exists():
            response = load_json(cache_path)
        else:
            if spent + args.reserve_usd > args.max_usd:
                break
            key = openrouter_key()
            if not key:
                raise ValueError("OPENROUTER_API_KEY is missing")
            response = request_embedding(payload, key)
            write_json(cache_path, response)
            requests += 1
        results = validate_embeddings(response, len(batch), args.price_per_million)
        estimated_cost = results[0]["usage"]["batchEstimatedCostUsd"]
        if batch_hash not in paid_requests:
            paid_requests[batch_hash] = estimated_cost
            spent += estimated_cost
            write_json(spend_path, paid_requests)
        for (unit, text_value), result in zip(batch, results, strict=True):
            output[unit["id"]] = {**result, "unitId": unit["id"], "postIds": unit["postIds"],
                                  "requestedModel": args.model,
                                  "inputHash": digest(text_value), "batchHash": batch_hash,
                                  "pricePerMillionUsd": args.price_per_million}
            completed += 1
        if (requests and requests % 25 == 0) or completed == len(units):
            write_json(args.output, output)
            if requests:
                print(f"Embedded {completed}/{len(units)} units; {requests} paid requests; estimated total ${spent:.4f}", flush=True)
        if spent > args.max_usd:
            raise RuntimeError("Estimated embedding spend exceeded ceiling; set a provider key cap for a hard limit")
    write_json(args.output, output)
    print(f"Embedded {completed} new browse units in {requests} paid requests; estimated total ${spent:.6f}; {len(output)} cached records")


def evaluate(args: argparse.Namespace) -> None:
    vocabulary = load_json(args.vocabulary)
    validate_vocabulary(vocabulary)
    report = evaluate_tags(vocabulary, load_json(args.predictions), load_json(args.sample),
                           question_hash(vocabulary), args.split)
    write_json(args.output, report)
    print(f"{args.split}: {report['evaluatedUnits']}/{report['reviewedUnits']} reviewed units evaluated")


def count_tags(args: argparse.Namespace) -> None:
    vocabulary = load_json(args.vocabulary)
    validate_vocabulary(vocabulary)
    report = summarize_tags(vocabulary, load_json(args.predictions), load_all_units(), question_hash(vocabulary))
    write_json(args.output, report)
    print(f"Counted {report['unitsClassified']}/{report['unitsInArchive']} classified browse units")


def preview_bundles(args: argparse.Namespace) -> None:
    vocabulary = load_json(args.vocabulary)
    validate_vocabulary(vocabulary)
    report = bundle_categories(vocabulary, load_json(args.mapping), load_json(args.predictions),
                               load_all_units(), question_hash(vocabulary))
    write_json(args.output, report)
    print(f"Previewed {len(report['categories'])} category bundles over {report['unitsClassified']} units")


def preview_image_inputs(args: argparse.Namespace) -> None:
    rows = load_json(args.sample)
    states = {row["id"]: image_state(row) for row in rows if row.get("descriptionStatus") == "reviewed"}
    write_json(args.output, states)
    print(f"Prepared {len(states)} reviewed image inputs at {args.output}")


def import_captions(args: argparse.Namespace) -> None:
    rows = load_json(args.sample)
    descriptions = load_json(args.input)
    by_id = {row["id"]: row for row in rows}
    if len(by_id) != len(rows) or not isinstance(descriptions, list):
        raise ValueError("sample IDs must be unique and caption input must be a list")
    seen: set[str] = set()
    for item in descriptions:
        image_id = item.get("id")
        if image_id not in by_id or image_id in seen:
            raise ValueError(f"unknown or duplicate image ID: {image_id}")
        seen.add(image_id)
        description = item.get("description")
        tags = item.get("visibleTags", [])
        if not isinstance(description, str) or not description.strip() or not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            raise ValueError(f"invalid description or tags for {image_id}")
        row = by_id[image_id]
        row["description"] = description.strip()
        row["visibleTags"] = [tag.strip() for tag in tags if tag.strip()]
        row["descriptionModel"] = args.model
        row["descriptionStatus"] = "unreviewed"
        row["unclear"] = bool(item.get("unclear", False))
    write_json(args.sample, rows)
    print(f"Imported {len(seen)} descriptions as unreviewed; confirm visible content before classification")


def image_review_page(args: argparse.Namespace) -> None:
    rows = load_json(args.sample)
    cards = []
    for row in rows:
        src = row["src"].replace("/archive-images/", "/archive-thumbs/")
        src = src.rsplit(".", 1)[0] + ".webp"
        url = args.asset_base.rstrip("/") + src
        escape = html.escape
        description = row.get("description") or "Nog geen beeldbeschrijving"
        context = row.get("linkedContext") or {}
        linked = " ".join(f'{link["kind"]}: {link["text"]}' for link in context.get("linkedText", [])) or "Geen tekst direct aan dit beeld gekoppeld"
        series_label = f' · reeks: {context["seriesTitle"]}' if context.get("seriesTitle") else ""
        cards.append(f'<article><img src="{escape(url)}" loading="lazy" alt=""><div><b>{escape(row["id"])}</b><p>{escape(description)}</p><small>Huidige tags: {escape(", ".join(row.get("legacyTags", [])))}</small><br><small>Nieuwe zichtbare tags: {escape(", ".join(row.get("visibleTags", [])))}</small><aside><b>Gekoppelde tekst, geen visueel bewijs</b><p>{escape(linked)}</p><small>Bericht: {escape(context.get("postTitle", ""))}{escape(series_label)}</small><p>{escape(context.get("postExcerpt", ""))}</p></aside></div></article>')
    page = '<!doctype html><html lang="nl"><meta charset="utf-8"><title>Beeldreview</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;background:#faf9f5;color:#282b24}article{display:flex;gap:1rem;padding:1rem;border-bottom:1px solid #ddd}img{width:260px;height:195px;object-fit:contain;background:#eee}p{margin:.5rem 0}small{color:#666}aside{background:#eee;padding:.6rem;margin-top:.7rem;border-radius:.4rem;font-size:.85rem}aside p{margin:.3rem 0}</style><h1>Beeldreview</h1><p>Beschrijvingen met status unreviewed zijn modelvoorstellen. Gekoppelde tekst is alleen context en bewijst niet wat zichtbaar is.</p>' + "".join(cards) + '</html>'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(page, encoding="utf-8")
    print(f"Wrote {args.output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    sample = commands.add_parser("sample", help="Build stratified, reproducible review set")
    sample.add_argument("--posts", type=int, default=150, help="Number of browse units (including curated continuation groups)")
    sample.add_argument("--images", type=int, default=100)
    sample.add_argument("--output", type=Path, default=WORK / "review")
    validate = commands.add_parser("validate-tags")
    validate.add_argument("vocabulary", type=Path)
    classification = commands.add_parser("tag", help="Paid Jev multi-label run; requires explicit limits")
    classification.add_argument("--vocabulary", type=Path, required=True)
    classification.add_argument("--sample", type=Path, help="Browse-unit review sample JSON; omit for full archive")
    classification.add_argument("--observations", type=Path, help="Reviewed image descriptions JSON")
    classification.add_argument("--output", type=Path, default=WORK / "tag-scores.json")
    classification.add_argument("--paid", action="store_true")
    classification.add_argument("--trial", action="store_true", help="Allow a draft vocabulary only for a capped 20-unit sample")
    classification.add_argument("--max-items", type=int)
    classification.add_argument("--batch-size", type=int, default=4, help="Browse units per Jev request (1-8; default 4)")
    classification.add_argument("--max-payload-chars", type=int, default=64000, help="Conservative complete-request size limit")
    classification.add_argument("--max-usd", type=float)
    classification.add_argument("--reserve-usd", type=float, default=0.01, help="Minimum remaining budget before each request")
    tag_plan = commands.add_parser("tag-plan", help="Count Jev requests for full text without spending")
    tag_plan.add_argument("--vocabulary", type=Path, required=True)
    tag_plan.add_argument("--sample", type=Path)
    tag_plan.add_argument("--observations", type=Path)
    tag_plan.add_argument("--batch-size", type=int, default=4)
    tag_plan.add_argument("--max-payload-chars", type=int, default=64000)
    embeddings = commands.add_parser("embed", help="Paid text embeddings for browse-unit similarity")
    embeddings.add_argument("--sample", type=Path, help="Browse-unit review sample JSON; omit for full archive")
    embeddings.add_argument("--observations", type=Path, help="Reviewed image descriptions JSON")
    embeddings.add_argument("--output", type=Path, default=WORK / "embeddings.json")
    embeddings.add_argument("--model", default="qwen/qwen3-embedding-8b")
    embeddings.add_argument("--batch-size", type=int, default=8)
    embeddings.add_argument("--max-payload-chars", type=int, default=100000)
    embeddings.add_argument("--paid", action="store_true")
    embeddings.add_argument("--max-items", type=int)
    embeddings.add_argument("--max-usd", type=float)
    embeddings.add_argument("--price-per-million", type=float, help="Current USD per million input tokens; verify from model listing")
    embeddings.add_argument("--reserve-usd", type=float, default=0.01)
    evaluation = commands.add_parser("evaluate")
    evaluation.add_argument("--sample", type=Path, default=WORK / "review/units.json")
    evaluation.add_argument("--predictions", type=Path, default=WORK / "tag-scores.json")
    evaluation.add_argument("--vocabulary", type=Path, required=True)
    evaluation.add_argument("--split", choices=["development", "holdout"], default="development")
    evaluation.add_argument("--output", type=Path, default=WORK / "evaluation.json")
    counts = commands.add_parser("count-tags", help="Count accepted tags and probability sweeps")
    counts.add_argument("--vocabulary", type=Path, required=True)
    counts.add_argument("--predictions", type=Path, default=WORK / "tag-scores.json")
    counts.add_argument("--output", type=Path, default=WORK / "tag-counts.json")
    bundles = commands.add_parser("bundle", help="Preview UI categories as groups of counted tags")
    bundles.add_argument("--vocabulary", type=Path, required=True)
    bundles.add_argument("--mapping", type=Path, required=True)
    bundles.add_argument("--predictions", type=Path, default=WORK / "tag-scores.json")
    bundles.add_argument("--output", type=Path, default=WORK / "category-preview.json")
    captions = commands.add_parser("import-captions", help="Import model-proposed image descriptions for review")
    captions.add_argument("--sample", type=Path, default=WORK / "review/images.json")
    captions.add_argument("--input", type=Path, required=True)
    captions.add_argument("--model", required=True)
    image_review = commands.add_parser("image-review", help="Render a read-only contact sheet")
    image_review.add_argument("--sample", type=Path, default=WORK / "review/images.json")
    image_review.add_argument("--output", type=Path, default=WORK / "review/images.html")
    image_review.add_argument("--asset-base", default="https://objects.janpeterdhalle.com/wilhalla-vake-blog")
    image_inputs = commands.add_parser("image-inputs", help="Preview visual evidence and linked text for reviewed images")
    image_inputs.add_argument("--sample", type=Path, default=WORK / "review/images.json")
    image_inputs.add_argument("--output", type=Path, default=WORK / "review/image-inputs.json")
    args = parser.parse_args()
    try:
        if args.command == "sample": make_sample(args.posts, args.images, args.output)
        elif args.command == "tag-plan": plan_tags(args)
        elif args.command == "validate-tags":
            validate_vocabulary(load_json(args.vocabulary))
            print("Tag vocabulary is valid")
        elif args.command == "tag": classify(args)
        elif args.command == "embed": embed(args)
        elif args.command == "evaluate": evaluate(args)
        elif args.command == "count-tags": count_tags(args)
        elif args.command == "bundle": preview_bundles(args)
        elif args.command == "import-captions": import_captions(args)
        elif args.command == "image-review": image_review_page(args)
        elif args.command == "image-inputs": preview_image_inputs(args)
    except (ValueError, OSError) as error:
        parser.exit(2, f"archive-ml: {error}\n")


if __name__ == "__main__":
    main()
