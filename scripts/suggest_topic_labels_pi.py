#!/usr/bin/env python3
"""Suggest human-quality topic labels by batching clusters through `pi -p`.

This is intentionally a post-processing step. It does not recluster. It reads
existing atlas JSON, asks a strong LLM to rename each cluster from representative
posts/keywords/visual concepts, and writes reviewable suggestions.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except Exception:  # pragma: no cover
    yaml = None


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def short(value: Any, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + "…"


def broad_category(topic: dict[str, Any]) -> str:
    label = str(topic.get("label") or topic.get("generatedLabel") or "")
    first = label.split(",", 1)[0].strip()
    known = {
        "Reizen & Erfgoed",
        "Fruit & Rassen",
        "Tuin & Teelt",
        "Dieren & Insecten",
        "Mensen & Familie",
        "Documenten & Bronnen",
    }
    return first if first in known else "Onbekend"


def topic_payload(topic: dict[str, Any], posts_by_id: dict[str, dict[str, Any]], representative_count: int) -> dict[str, Any]:
    reps = []
    for post_id in topic.get("representativePostIds", [])[:representative_count]:
        post = posts_by_id.get(str(post_id))
        if not post:
            continue
        reps.append(
            {
                "title": short(post.get("title"), 100),
                "date": post.get("date") or "",
                "excerpt": short(post.get("excerpt") or post.get("cleanedText"), 260),
                "imageCount": post.get("imageCount", 0),
            }
        )
    return {
        "topicId": topic.get("id"),
        "postCount": topic.get("postCount"),
        "currentLabel": topic.get("label"),
        "generatedLabel": topic.get("generatedLabel"),
        "broadCategory": broad_category(topic),
        "textKeywords": topic.get("textKeywords", []),
        "visualKeywords": topic.get("visualKeywords", []),
        "representativePosts": reps,
    }


def prompt_for_batch(batch: list[dict[str, Any]]) -> str:
    return f"""You are naming topic clusters for a Dutch/Flemish historical fruit blog archive.

Task:
- For each cluster, create ONE concise Dutch label for archive browsing.
- Prefer conceptual labels over keyword soup.
- Good: "Culturele daguitstappen", "Appelrassen", "Snoei en enten", "Kippen en tuinleven".
- Bad: "Rijden, Kerk, Antwerpen", "Appels, Zeer, Nieuwe".
- Keep labels short: max 4 words, ideally 2-3.
- Do not invent details not supported by the evidence.
- If evidence is mixed, choose the best browsing label, not a perfect summary.
- Preserve the broad category if it is clearly right, but make the label more specific when possible.
- Return STRICT JSON only. No markdown, no comments.

Return schema:
[
  {{
    "topicId": "topic-01",
    "label": "Culturele daguitstappen",
    "confidence": "high|medium|low",
    "reason": "Short English explanation of why this label fits."
  }}
]

Clusters:
{json.dumps(batch, ensure_ascii=False, indent=2)}
"""


def extract_json(text: str) -> Any:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        return json.loads(fenced.group(1))
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError(f"Could not parse JSON from pi output:\n{text[:1000]}")


def run_pi(prompt: str, args: argparse.Namespace) -> str:
    cmd = ["pi", "-p", "--no-tools", "--no-context-files", "--no-skills", "--no-prompt-templates"]
    if args.provider:
        cmd.extend(["--provider", args.provider])
    if args.model:
        cmd.extend(["--model", args.model])
    if args.thinking:
        cmd.extend(["--thinking", args.thinking])
    cmd.append(prompt)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=args.timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"pi failed with exit code {proc.returncode}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
    return proc.stdout


def write_outputs(suggestions: list[dict[str, Any]], args: argparse.Namespace) -> None:
    args.output_json.write_text(json.dumps(suggestions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    topics_mapping = {
        item["topicId"]: {
            "label": item["label"],
            "confidence": item.get("confidence", ""),
            "reason": item.get("reason", ""),
        }
        for item in suggestions
    }
    payload = {
        "#": "Review these suggestions, then copy accepted labels to topics.yml. Topic IDs can shift after reclustering.",
        "topics": topics_mapping,
    }
    if yaml is not None:
        args.output_yml.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")
    else:
        args.output_yml.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Suggest atlas topic labels using `pi -p`.")
    parser.add_argument("--topics", type=Path, default=Path("src/data/generated/topics.json"))
    parser.add_argument("--posts", type=Path, default=Path("src/data/generated/posts-index.json"))
    parser.add_argument("--output-yml", type=Path, default=Path("topic-label-suggestions.yml"))
    parser.add_argument("--output-json", type=Path, default=Path("topic-label-suggestions.json"))
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--representative-count", type=int, default=5)
    parser.add_argument("--provider", default="", help="Optional pi provider, e.g. openai")
    parser.add_argument("--model", default="", help="Optional pi model/pattern, e.g. openai/gpt-5.5")
    parser.add_argument("--thinking", default="", help="Optional thinking level")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--dry-run", action="store_true", help="Print first prompt and exit without calling pi")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    topics = load_json(args.topics)
    posts = load_json(args.posts)
    posts_by_id = {str(post["id"]): post for post in posts}
    payloads = [topic_payload(topic, posts_by_id, args.representative_count) for topic in topics]
    batches = [payloads[i : i + args.batch_size] for i in range(0, len(payloads), args.batch_size)]
    if args.dry_run:
        print(prompt_for_batch(batches[0]))
        return

    suggestions: list[dict[str, Any]] = []
    for index, batch in enumerate(batches, start=1):
        print(f"[topic-labels] pi batch {index}/{len(batches)} ({len(batch)} topics)", file=sys.stderr)
        output = run_pi(prompt_for_batch(batch), args)
        parsed = extract_json(output)
        if not isinstance(parsed, list):
            raise ValueError(f"Expected a JSON list, got {type(parsed).__name__}")
        suggestions.extend(parsed)

    seen = {str(item.get("topicId")) for item in suggestions}
    missing = [payload["topicId"] for payload in payloads if str(payload["topicId"]) not in seen]
    if missing:
        print(f"[topic-labels] WARNING missing labels for: {', '.join(missing)}", file=sys.stderr)
    write_outputs(suggestions, args)
    print(f"[topic-labels] wrote {args.output_yml} and {args.output_json}")


if __name__ == "__main__":
    main()
