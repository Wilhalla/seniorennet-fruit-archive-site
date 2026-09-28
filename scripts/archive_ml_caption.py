#!/usr/bin/env python3
"""Caption archive thumbnails with the ChatGPT-signed-in Codex CLI.

Captions describe visible content only. Post text is linked later as context.
The command is resumable and does not use OpenRouter.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from archive_ml import load_json, write_json
from archive_ml_units import image_context


IMAGES = Path("src/data/generated/image-index.json")
RAW_POSTS = Path("src/data/posts.json")
SERIES = Path("src/data/post-series.json")
WORK = Path("ml-work")
MODEL = "gpt-6-luna"
PROMPT_VERSION = "visual-caption-nl-1"
ASSET_BASE = "https://objects.janpeterdhalle.com/wilhalla-vake-blog"


def caption_schema() -> dict[str, Any]:
    return {
        "type": "object", "additionalProperties": False, "required": ["captions"],
        "properties": {"captions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["id", "description", "visibleTags", "unclear"],
            "properties": {
                "id": {"type": "string"}, "description": {"type": "string"},
                "visibleTags": {"type": "array", "items": {"type": "string"}},
                "unclear": {"type": "boolean"},
            },
        }}},
    }


def thumbnail_path(source: str) -> str:
    if not source.startswith("/archive-images/") or "." not in source.rsplit("/", 1)[-1]:
        raise ValueError(f"unexpected archive image path: {source}")
    return source.replace("/archive-images/", "/archive-thumbs/").rsplit(".", 1)[0] + ".webp"


def download_image(row: dict[str, Any], cache_dir: Path, asset_base: str) -> Path:
    source = row["src"]
    key = hashlib.sha256(source.encode()).hexdigest()
    thumb = cache_dir / f"{key}.webp"
    original = cache_dir / f"{key}{Path(source).suffix.lower()}"
    for target in (thumb, original):
        if target.exists() and target.stat().st_size > 0:
            return target
    cache_dir.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for remote_path, target in ((thumbnail_path(source), thumb), (source, original)):
        for attempt in range(3):
            try:
                request = urllib.request.Request(asset_base.rstrip("/") + remote_path,
                                                 headers={"User-Agent": "SeniorennetArchiveCaption/1.0"})
                with urllib.request.urlopen(request, timeout=30) as response:
                    data = response.read(25_000_001)
                if not data or len(data) > 25_000_000:
                    raise ValueError(f"empty or oversized image: {source}")
                target.write_bytes(data)
                return target
            except (TimeoutError, urllib.error.URLError, ValueError) as error:
                last_error = error
                time.sleep(2 ** attempt)
    raise RuntimeError(f"could not download image {source}: {last_error}")


def validate_captions(response: dict[str, Any], expected_ids: list[str]) -> list[dict[str, Any]]:
    rows = response.get("captions")
    if not isinstance(rows, list) or len(rows) != len(expected_ids):
        raise ValueError("caption response has incomplete image coverage")
    if [row.get("id") for row in rows if isinstance(row, dict)] != expected_ids:
        raise ValueError("caption IDs or image order differ from the request")
    for row in rows:
        description = row.get("description")
        tags = row.get("visibleTags")
        if (not isinstance(description, str) or not description.strip() or len(description) > 400
                or not isinstance(tags, list) or len(tags) > 6
                or not all(isinstance(tag, str) and tag.strip() for tag in tags)
                or not isinstance(row.get("unclear"), bool)):
            raise ValueError(f"invalid caption for {row.get('id')}")
    return rows


def caption_batch(rows: list[dict[str, Any]], paths: list[Path], cache_dir: Path,
                  model: str) -> list[dict[str, Any]]:
    ids = [row["id"] for row in rows]
    batch_key = hashlib.sha256(json.dumps({"model": model, "version": PROMPT_VERSION,
                                          "images": [(row["id"], hashlib.sha256(path.read_bytes()).hexdigest())
                                                     for row, path in zip(rows, paths, strict=True)]},
                                         sort_keys=True).encode()).hexdigest()
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cache_dir / f"{batch_key}.json"
    if cached.exists():
        return validate_captions(load_json(cached), ids)
    if not shutil.which("codex"):
        raise RuntimeError("Codex CLI is required for ChatGPT subscription captions")
    schema = cache_dir / "schema.json"
    if not schema.exists():
        write_json(schema, caption_schema())
    prompt = (
        "Describe each attached image independently in Dutch, using visible pixels only. "
        f"Image IDs in attachment order: {', '.join(ids)}. "
        "Return one caption per ID in the schema, in the same order. "
        "Each description is one factual sentence of at most 35 words. "
        "Give at most five short Dutch visibleTags. Set unclear true for a blurry or ambiguous subject. "
        "Do not guess a person's identity or relationship, a precise place, or a species you cannot see clearly. "
        "Do not use post text or filenames as evidence. Do not use tools or read other files."
    )
    output = cache_dir / f"{batch_key}.response.json"
    log = cache_dir / f"{batch_key}.log"
    command = ["codex", "exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only",
               "-C", str(cache_dir), "-m", model, "-c", 'model_reasoning_effort="low"',
               "--output-schema", str(schema), "-o", str(output)]
    for path in paths:
        command.extend(("-i", str(path)))
    command.append("-")
    for attempt in range(3):
        with log.open("a", encoding="utf-8") as log_file:
            result = subprocess.run(command, input=prompt, text=True, stdout=log_file,
                                    stderr=subprocess.STDOUT, timeout=600, check=False)
        try:
            if result.returncode != 0:
                raise RuntimeError(f"Codex caption command exited {result.returncode}")
            captions = validate_captions(load_json(output), ids)
            write_json(cached, {"captions": captions})
            return captions
        except (ValueError, OSError, RuntimeError):
            if attempt == 2:
                raise RuntimeError(f"caption batch failed after three attempts; inspect {log}")
            time.sleep(2 ** attempt)
    raise AssertionError("caption retry loop exhausted")


def materialize_observations(images: list[dict[str, Any]], captions_by_source: dict[str, Any],
                             output: Path) -> None:
    raw_by_slug = {post["slug"]: post for post in load_json(RAW_POSTS)}
    series_by_post = {post_id: item for item in load_json(SERIES)["series"] for post_id in item["postIds"]}
    observations = []
    for image in images:
        caption = captions_by_source.get(image["src"])
        if not caption:
            raise ValueError(f"missing caption for {image['id']}")
        raw_post = raw_by_slug[image["postSlug"]]
        observations.append({
            "id": image["id"], "src": image["src"], "postSlug": image["postSlug"],
            "postId": image["postId"], "imageIndex": image["imageIndex"],
            "description": caption["description"], "visibleTags": caption["visibleTags"],
            "unclear": caption["unclear"], "descriptionModel": caption["model"],
            "descriptionStatus": "auto-accepted", "descriptionRole": "visible-content-only",
            "linkedContext": image_context(image, raw_post, series_by_post.get(raw_post["id"])),
        })
    write_json(output, observations)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-images", type=int, help="Capped pilot; omit for all images")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--workers", type=int, default=2, help="Concurrent ChatGPT caption batches")
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--asset-base", default=ASSET_BASE)
    parser.add_argument("--output", type=Path, default=WORK / "image-observations.json")
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 32 or not 1 <= args.workers <= 4 or (args.max_images is not None and args.max_images < 1):
        parser.error("batch-size must be 1-32, workers 1-4, and max-images positive")
    images = load_json(IMAGES)
    selected = images[:args.max_images] if args.max_images else images
    first_by_source = {image["src"]: image for image in selected}
    sources = list(first_by_source)
    state_path = WORK / "image-captions-by-source.json"
    saved = load_json(state_path) if state_path.exists() else {}
    cache = WORK / "cache" / "captions"
    write_json(cache / "batches/schema.json", caption_schema())
    pending = [first_by_source[source] for source in sources if source not in saved]
    batches = [pending[index:index + args.batch_size] for index in range(0, len(pending), args.batch_size)]
    def process_batch(batch: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        with ThreadPoolExecutor(max_workers=min(8, len(batch))) as pool:
            paths = list(pool.map(lambda row: download_image(row, cache / "images", args.asset_base), batch))
        captions = caption_batch(batch, paths, cache / "batches", args.model)
        return batch, captions

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        next_batch = 0
        futures = set()
        while next_batch < min(args.workers, len(batches)):
            futures.add(pool.submit(process_batch, batches[next_batch]))
            next_batch += 1
        completed = 0
        while futures:
            future = next(as_completed(futures))
            futures.remove(future)
            batch, captions = future.result()
            completed += 1
            for image, caption in zip(batch, captions, strict=True):
                saved[image["src"]] = {"description": caption["description"].strip(),
                                       "visibleTags": caption["visibleTags"], "unclear": caption["unclear"],
                                       "model": args.model, "promptVersion": PROMPT_VERSION}
            write_json(state_path, saved)
            print(f"Captioned {len(saved)}/{len(sources)} unique images; batch {completed}/{len(batches)}", flush=True)
            if next_batch < len(batches):
                futures.add(pool.submit(process_batch, batches[next_batch]))
                next_batch += 1
    materialize_observations(selected, saved, args.output)
    print(f"Wrote {len(selected)} linked image observations to {args.output}")


if __name__ == "__main__":
    main()
