#!/usr/bin/env python3
"""Review-first archive classification pipeline. Run from the repository root.

No command contacts a paid service unless --paid, --max-items and --max-usd are
all supplied to `classify`. Results are cached by source and taxonomy hashes.
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

POSTS = Path("src/data/generated/posts-index.json")
IMAGES = Path("public/generated/image-index.client.json")
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


def author_text(post: dict[str, Any]) -> str:
    """The legacy index appends imported reactions after the author's post."""
    text = (post.get("cleanedText") or "").strip()
    return re.split(r"\bReacties\s+(?=\d{2}-\d{2}-\d{4})", text, maxsplit=1)[0].strip()


def make_sample(post_count: int, image_count: int, output: Path) -> None:
    posts = sample_evenly(load_json(POSTS), post_count, "topicId", 42)
    images = load_json(IMAGES)
    selected_post_ids = {post["slug"] for post in posts}
    associated = [image for image in images if image.get("postSlug") in selected_post_ids]
    image_pool = sample_evenly(associated, image_count // 2, "year", 43)
    image_pool += sample_evenly(images, image_count, "year", 44)
    sampled_images: list[dict[str, Any]] = []
    used_ids: set[str] = set()
    used_posts: set[str] = set()
    for image in image_pool:
        if image["id"] not in used_ids and image.get("postSlug") not in used_posts:
            sampled_images.append(image)
            used_ids.add(image["id"])
            used_posts.add(image.get("postSlug"))
        if len(sampled_images) == image_count:
            break
    for image in image_pool:
        if len(sampled_images) == image_count:
            break
        if image["id"] not in used_ids:
            sampled_images.append(image)
            used_ids.add(image["id"])
    post_rows = [{
        "id": post["id"], "split": split_for(post["id"]), "title": post["title"],
        "text": author_text(post)[:3500], "date": post.get("date"),
        "imageCount": post.get("imageCount", 0), "legacyTopicId": post.get("topicId"),
        "goldCategoryId": None, "goldFacets": [], "reviewNotes": "",
    } for post in posts]
    image_rows = [{
        "id": image["id"], "split": split_for(image["id"]), "src": image["src"],
        "postSlug": image.get("postSlug"), "postTitle": image.get("postTitle"),
        "legacyTags": image.get("visualTags", []), "description": None,
        "visibleTags": [], "descriptionModel": None, "reviewNotes": "",
    } for image in sampled_images]
    write_json(output / "posts.json", post_rows)
    write_json(output / "images.json", image_rows)
    write_json(output / "sample-manifest.json", {
        "sourceHashes": {"posts": digest(load_json(POSTS)), "images": digest(images)},
        "seed": 42, "postCount": len(post_rows), "imageCount": len(image_rows),
        "note": "Legacy labels are sampling metadata, not ground truth. Holdout labels must stay unseen during taxonomy and threshold tuning.",
    })
    print(f"Wrote {len(post_rows)} posts and {len(image_rows)} images to {output}")


def validate_taxonomy(taxonomy: dict[str, Any]) -> None:
    if not isinstance(taxonomy.get("version"), str) or not taxonomy["version"].strip():
        raise ValueError("taxonomy.version is required")
    categories = taxonomy.get("categories")
    if not isinstance(categories, list) or not categories:
        raise ValueError("taxonomy.categories must be a nonempty list")
    ids: set[str] = set()
    for item in categories:
        if not all(isinstance(item.get(key), str) and item[key].strip() for key in ("id", "label", "definition")):
            raise ValueError("every category needs id, label and definition")
        if item["id"] in ids:
            raise ValueError(f"duplicate category ID: {item['id']}")
        ids.add(item["id"])
    if "other" not in ids:
        raise ValueError("taxonomy must include an 'other' category")
    for item in taxonomy.get("facets", []):
        if not all(isinstance(item.get(key), str) and item[key].strip() for key in ("id", "question")):
            raise ValueError("every facet needs id and question")
        if item["id"] in ids:
            raise ValueError(f"facet/category ID collision: {item['id']}")
        ids.add(item["id"])


def classification_input(post: dict[str, Any], observations: dict[str, list[str]] | None = None) -> dict[str, str]:
    body = author_text(post)[:2500]
    state = {"title": post["title"], "text": body or post.get("excerpt", "")}
    visible = (observations or {}).get(post["slug"], [])
    if visible:
        state["observed_images"] = " | ".join(visible[:5])[:700]
    return state


def jev_payload(state: dict[str, str], taxonomy: dict[str, Any]) -> dict[str, Any]:
    validate_taxonomy(taxonomy)
    questions = {"category": {
        "type": "choice", "instructions": "Which one category best describes the post's main subject? Use image observations only as supporting evidence; the post text and title take priority.",
        "criteria": {item["id"]: item["definition"] for item in taxonomy["categories"]},
    }}
    for facet in taxonomy.get("facets", []):
        questions[facet["id"]] = {"type": "noul", "instructions": facet["question"]}
    return {"model": JEV_MODEL, "state": state, "questions": questions}


def load_observations(path: Path | None) -> dict[str, list[str]]:
    if path is None:
        return {}
    rows = load_json(path)
    result: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        if row.get("description") and row.get("postSlug") and row.get("descriptionStatus") == "reviewed":
            if not row.get("descriptionModel"):
                raise ValueError(f"image {row.get('id')} needs descriptionModel provenance")
            result[row["postSlug"]].append(row["description"].strip())
    return dict(result)


def validate_answer(response: dict[str, Any], taxonomy: dict[str, Any]) -> dict[str, Any]:
    answers = response.get("answers") or {}
    choice = answers.get("category") or {}
    valid_ids = {item["id"] for item in taxonomy["categories"]}
    if choice.get("type") != "choice" or choice.get("choice") not in valid_ids:
        raise ValueError("unexpected Jev category answer")
    confidence = choice.get("confidence")
    if confidence is not None and (not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1):
        raise ValueError("invalid category confidence")
    facets: dict[str, float] = {}
    for facet in taxonomy.get("facets", []):
        answer = answers.get(facet["id"]) or {}
        probability = answer.get("noul")
        if answer.get("type") != "noul" or not isinstance(probability, (int, float)) or not 0 <= probability <= 1:
            raise ValueError(f"invalid facet answer: {facet['id']}")
        facets[facet["id"]] = float(probability)
    usage = response.get("usage") or {}
    cost = usage.get("cost")
    if not isinstance(cost, (int, float)) or cost < 0 or not math.isfinite(cost):
        raise ValueError("Jev response lacks usable cost; stop batch to protect budget")
    return {"categoryId": choice["choice"], "confidence": confidence, "facetScores": facets,
            "model": response.get("model"), "usage": usage}


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
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
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
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise RuntimeError(f"Embeddings HTTP {error.code}: {error.read().decode()[:500]}") from error
            time.sleep(min(15, 2 ** attempt))
    raise RuntimeError("Embeddings retry limit reached")


def validate_embedding(response: dict[str, Any], price_per_million: float) -> dict[str, Any]:
    data = response.get("data") or []
    vector = data[0].get("embedding") if len(data) == 1 else None
    tokens = (response.get("usage") or {}).get("prompt_tokens")
    if not isinstance(vector, list) or not vector or not all(isinstance(value, (int, float)) and math.isfinite(value) for value in vector):
        raise ValueError("invalid embedding vector")
    if not isinstance(tokens, int) or tokens < 0:
        raise ValueError("embedding response has no prompt token count")
    return {"vector": vector, "model": response.get("model"), "usage": {"prompt_tokens": tokens,
            "estimatedCostUsd": tokens * price_per_million / 1_000_000}}


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


def classify(args: argparse.Namespace) -> None:
    taxonomy = load_json(args.taxonomy)
    validate_taxonomy(taxonomy)
    if taxonomy.get("status") != "approved":
        raise ValueError("taxonomy.status must be 'approved' before paid classification")
    if not args.paid or args.max_items is None or args.max_usd is None:
        raise ValueError("Paid classification requires --paid, --max-items and --max-usd")
    if args.max_items <= 0 or args.max_usd <= 0:
        raise ValueError("max-items and max-usd must be positive")
    key = openrouter_key()
    if not key:
        raise ValueError("OPENROUTER_API_KEY is missing")
    observations = load_observations(args.observations)
    posts = load_json(POSTS)
    selected = {row["id"] for row in load_json(args.sample)} if args.sample else None
    if selected is not None:
        posts = [post for post in posts if post["id"] in selected]
    taxonomy_hash = digest(taxonomy)
    output = load_json(args.output) if args.output.exists() else {}
    output = {post_id: row for post_id, row in output.items() if row.get("taxonomyHash") == taxonomy_hash}
    spent = sum(float(row["usage"]["cost"]) for row in output.values() if "usage" in row)
    cache_dir = WORK / "cache" / "jev"
    completed = 0
    for post in posts:
        payload = jev_payload(classification_input(post, observations), taxonomy)
        cache_key = digest(payload)
        previous = output.get(post["id"])
        if previous and previous.get("cacheKey") == cache_key:
            continue
        cache_path = cache_dir / f"{cache_key}.json"
        if cache_path.exists():
            output[post["id"]] = load_json(cache_path)
            write_json(args.output, output)
            continue
        if completed >= args.max_items or spent + args.reserve_usd > args.max_usd:
            break
        response = validate_answer(request_jev(payload, key), taxonomy)
        spent += float(response["usage"]["cost"])
        output[post["id"]] = {**response, "postId": post["id"], "cacheKey": cache_key,
                              "taxonomyVersion": taxonomy["version"], "taxonomyHash": taxonomy_hash,
                              "inputHash": digest(payload["state"])}
        write_json(cache_path, output[post["id"]])
        write_json(args.output, output)
        completed += 1
        if spent > args.max_usd:
            raise RuntimeError("Reported cost exceeded ceiling; stop and use a provider key spending limit for a hard cap")
    print(f"Classified {completed} new posts; recorded total ${spent:.6f}; {len(output)} cached records")


def embed(args: argparse.Namespace) -> None:
    if not args.paid or args.max_items is None or args.max_usd is None or args.price_per_million is None:
        raise ValueError("Paid embeddings require --paid, --max-items, --max-usd and --price-per-million")
    if min(args.max_items, args.max_usd, args.price_per_million) <= 0:
        raise ValueError("embedding limits and price must be positive")
    key = openrouter_key()
    if not key:
        raise ValueError("OPENROUTER_API_KEY is missing")
    observations = load_observations(args.observations)
    posts = load_json(POSTS)
    selected = {row["id"] for row in load_json(args.sample)} if args.sample else None
    if selected is not None:
        posts = [post for post in posts if post["id"] in selected]
    output = load_json(args.output) if args.output.exists() else {}
    spent = sum(float(row["usage"]["estimatedCostUsd"]) for row in output.values())
    completed = 0
    for post in posts:
        state = classification_input(post, observations)
        input_text = f"Titel: {state['title']}\nTekst: {state['text']}"
        if state.get("observed_images"):
            input_text += f"\nZichtbaar op afbeeldingen: {state['observed_images']}"
        payload = {"model": args.model, "input": input_text}
        cache_key = digest(payload)
        if output.get(post["id"], {}).get("cacheKey") == cache_key:
            continue
        cache_path = WORK / "cache" / "embeddings" / f"{cache_key}.json"
        if cache_path.exists():
            output[post["id"]] = load_json(cache_path)
            write_json(args.output, output)
            continue
        if completed >= args.max_items or spent + args.reserve_usd > args.max_usd:
            break
        result = validate_embedding(request_embedding(payload, key), args.price_per_million)
        spent += result["usage"]["estimatedCostUsd"]
        output[post["id"]] = {**result, "postId": post["id"], "cacheKey": cache_key,
                              "inputHash": digest(input_text), "pricePerMillionUsd": args.price_per_million}
        write_json(cache_path, output[post["id"]])
        write_json(args.output, output)
        completed += 1
        if spent > args.max_usd:
            raise RuntimeError("Estimated embedding spend exceeded ceiling; set a provider key cap for a hard limit")
    print(f"Embedded {completed} new posts; estimated total ${spent:.6f}; {len(output)} cached records")


def evaluate(args: argparse.Namespace) -> None:
    taxonomy = load_json(args.taxonomy)
    validate_taxonomy(taxonomy)
    taxonomy_hash = digest(taxonomy)
    gold = [row for row in load_json(args.sample) if row.get("goldCategoryId") and row.get("split") == args.split]
    predictions = load_json(args.predictions)
    paired = [(row, predictions[row["id"]]) for row in gold
              if row["id"] in predictions and predictions[row["id"]].get("taxonomyHash") == taxonomy_hash]
    if not paired:
        raise ValueError("no reviewed examples with predictions in selected split")
    by_category: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    errors = []
    confidence_bands = {"low": {"count": 0, "correct": 0}, "middle": {"count": 0, "correct": 0},
                        "high": {"count": 0, "correct": 0}, "missing": {"count": 0, "correct": 0}}
    for row, prediction in paired:
        actual, predicted = row["goldCategoryId"], prediction["categoryId"]
        confidence = prediction.get("confidence")
        band = "missing" if confidence is None else "low" if confidence < 0.5 else "middle" if confidence < 0.8 else "high"
        confidence_bands[band]["count"] += 1
        confidence_bands[band]["correct"] += int(actual == predicted)
        if actual == predicted:
            by_category[actual]["tp"] += 1
        else:
            by_category[actual]["fn"] += 1
            by_category[predicted]["fp"] += 1
            errors.append({"id": row["id"], "title": row["title"], "gold": actual, "predicted": predicted,
                           "confidence": prediction.get("confidence")})
    category_metrics = {category: {**counts,
                        "precision": counts["tp"] / (counts["tp"] + counts["fp"]) if counts["tp"] + counts["fp"] else None,
                        "recall": counts["tp"] / (counts["tp"] + counts["fn"]) if counts["tp"] + counts["fn"] else None}
                        for category, counts in by_category.items()}
    report = {"split": args.split, "reviewed": len(gold), "evaluated": len(paired),
              "coverage": len(paired) / len(gold), "accuracy": (len(paired) - len(errors)) / len(paired),
              "byCategory": category_metrics, "confidenceBands": confidence_bands, "errors": errors,
              "costUsd": sum(float(prediction["usage"]["cost"]) for _, prediction in paired)}
    write_json(args.output, report)
    print(f"{args.split}: {len(paired)}/{len(gold)} covered, accuracy {report['accuracy']:.1%}, {len(errors)} errors")


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
        cards.append(f'<article><img src="{escape(url)}" loading="lazy" alt=""><div><b>{escape(row["id"])}</b><p>{escape(description)}</p><small>Huidige tags: {escape(", ".join(row.get("legacyTags", [])))}</small><br><small>Nieuwe zichtbare tags: {escape(", ".join(row.get("visibleTags", [])))}</small></div></article>')
    page = '<!doctype html><html lang="nl"><meta charset="utf-8"><title>Beeldreview</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;background:#faf9f5;color:#282b24}article{display:flex;gap:1rem;padding:1rem;border-bottom:1px solid #ddd}img{width:260px;height:195px;object-fit:contain;background:#eee}p{margin:.5rem 0}small{color:#666}</style><h1>Beeldreview</h1><p>Beschrijvingen met status unreviewed zijn modelvoorstellen. Pas de JSON aan na controle.</p>' + "".join(cards) + '</html>'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(page, encoding="utf-8")
    print(f"Wrote {args.output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    sample = commands.add_parser("sample", help="Build stratified, reproducible review set")
    sample.add_argument("--posts", type=int, default=150)
    sample.add_argument("--images", type=int, default=100)
    sample.add_argument("--output", type=Path, default=WORK / "review")
    validate = commands.add_parser("validate-taxonomy")
    validate.add_argument("taxonomy", type=Path)
    classification = commands.add_parser("classify", help="Paid Jev run; requires explicit limits")
    classification.add_argument("--taxonomy", type=Path, required=True)
    classification.add_argument("--sample", type=Path, help="Review sample JSON; omit for full archive")
    classification.add_argument("--observations", type=Path, help="Reviewed image descriptions JSON")
    classification.add_argument("--output", type=Path, default=WORK / "predictions.json")
    classification.add_argument("--paid", action="store_true")
    classification.add_argument("--max-items", type=int)
    classification.add_argument("--max-usd", type=float)
    classification.add_argument("--reserve-usd", type=float, default=0.01, help="Minimum remaining budget before each request")
    embeddings = commands.add_parser("embed", help="Paid text embeddings for post similarity")
    embeddings.add_argument("--sample", type=Path, help="Review sample JSON; omit for full archive")
    embeddings.add_argument("--observations", type=Path, help="Reviewed image descriptions JSON")
    embeddings.add_argument("--output", type=Path, default=WORK / "embeddings.json")
    embeddings.add_argument("--model", default="openai/text-embedding-3-small")
    embeddings.add_argument("--paid", action="store_true")
    embeddings.add_argument("--max-items", type=int)
    embeddings.add_argument("--max-usd", type=float)
    embeddings.add_argument("--price-per-million", type=float, help="Current USD per million input tokens; verify from model listing")
    embeddings.add_argument("--reserve-usd", type=float, default=0.01)
    evaluation = commands.add_parser("evaluate")
    evaluation.add_argument("--sample", type=Path, default=WORK / "review/posts.json")
    evaluation.add_argument("--predictions", type=Path, default=WORK / "predictions.json")
    evaluation.add_argument("--taxonomy", type=Path, required=True)
    evaluation.add_argument("--split", choices=["development", "holdout"], default="development")
    evaluation.add_argument("--output", type=Path, default=WORK / "evaluation.json")
    captions = commands.add_parser("import-captions", help="Import model-proposed image descriptions for review")
    captions.add_argument("--sample", type=Path, default=WORK / "review/images.json")
    captions.add_argument("--input", type=Path, required=True)
    captions.add_argument("--model", required=True)
    image_review = commands.add_parser("image-review", help="Render a read-only contact sheet")
    image_review.add_argument("--sample", type=Path, default=WORK / "review/images.json")
    image_review.add_argument("--output", type=Path, default=WORK / "review/images.html")
    image_review.add_argument("--asset-base", default="https://objects.janpeterdhalle.com/wilhalla-vake-blog")
    args = parser.parse_args()
    try:
        if args.command == "sample": make_sample(args.posts, args.images, args.output)
        elif args.command == "validate-taxonomy":
            validate_taxonomy(load_json(args.taxonomy))
            print("Taxonomy is valid")
        elif args.command == "classify": classify(args)
        elif args.command == "embed": embed(args)
        elif args.command == "evaluate": evaluate(args)
        elif args.command == "import-captions": import_captions(args)
        elif args.command == "image-review": image_review_page(args)
    except (ValueError, OSError) as error:
        parser.exit(2, f"archive-ml: {error}\n")


if __name__ == "__main__":
    main()
