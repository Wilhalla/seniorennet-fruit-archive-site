#!/usr/bin/env python3
"""Build a static topic × season/month heatmap from semantic atlas outputs."""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SEASONS = ["lente", "zomer", "herfst", "winter"]
MONTHS = list(range(1, 13))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def topic_label(topic: dict[str, Any]) -> str:
    label = str(topic.get("label") or "").strip()
    if label and label != "Nog te benoemen":
        return label
    generated = str(topic.get("generatedLabel") or "").strip()
    return generated or str(topic.get("id"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate topic-calendar.json")
    parser.add_argument("--posts", type=Path, default=Path("src/data/generated/posts-index.json"))
    parser.add_argument("--topics", type=Path, default=Path("src/data/generated/topics.json"))
    parser.add_argument("--output-public", type=Path, default=Path("public/generated/topic-calendar.json"))
    parser.add_argument("--output-data", type=Path, default=Path("src/data/generated/topic-calendar.json"))
    args = parser.parse_args()

    posts = load_json(args.posts)
    topics = load_json(args.topics)
    topics_by_id = {topic["id"]: topic for topic in topics}

    years = sorted({int(post["year"]) for post in posts if post.get("year")}, reverse=True)
    year_keys = [str(year) for year in years]
    counts: dict[str, Any] = defaultdict(lambda: {
        "total": 0,
        "monthsAllYears": Counter(),
        "seasonsAllYears": Counter(),
        "years": defaultdict(lambda: {
            "total": 0,
            "months": Counter(),
            "seasons": Counter(),
        }),
    })

    for post in posts:
        topic_id = post.get("topicId") or "topic-overig"
        year = post.get("year")
        month = post.get("month")
        season = post.get("season") or "winter"
        if not year or not month:
            continue
        year = str(year)
        month = int(month)
        bucket = counts[topic_id]
        bucket["total"] += 1
        bucket["monthsAllYears"][month] += 1
        bucket["seasonsAllYears"][season] += 1
        bucket["years"][year]["total"] += 1
        bucket["years"][year]["months"][month] += 1
        bucket["years"][year]["seasons"][season] += 1

    max_month_count = 0
    max_season_count = 0
    rows = []
    for topic_id, bucket in counts.items():
        topic = topics_by_id.get(topic_id, {"id": topic_id, "label": topic_id, "generatedLabel": ""})
        by_year = {}
        for year in year_keys:
            y = bucket["years"].get(year)
            months = [int(y["months"].get(month, 0)) for month in MONTHS] if y else [0] * 12
            seasons = {season: int(y["seasons"].get(season, 0)) for season in SEASONS} if y else {season: 0 for season in SEASONS}
            max_month_count = max(max_month_count, *months)
            max_season_count = max(max_season_count, *seasons.values())
            by_year[year] = {"total": int(y["total"]) if y else 0, "months": months, "seasons": seasons}

        months_all = [int(bucket["monthsAllYears"].get(month, 0)) for month in MONTHS]
        seasons_all = {season: int(bucket["seasonsAllYears"].get(season, 0)) for season in SEASONS}
        max_month_count = max(max_month_count, *months_all)
        max_season_count = max(max_season_count, *seasons_all.values())
        rows.append({
            "topicId": topic_id,
            "label": topic_label(topic),
            "generatedLabel": topic.get("generatedLabel", ""),
            "postCount": int(topic.get("postCount", bucket["total"])),
            "total": int(bucket["total"]),
            "monthsAllYears": months_all,
            "seasonsAllYears": seasons_all,
            "years": by_year,
        })

    rows.sort(key=lambda row: (-row["total"], row["label"]))
    payload = {
        "generatedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "years": year_keys,
        "months": MONTHS,
        "seasons": SEASONS,
        "maxMonthCount": max_month_count,
        "maxSeasonCount": max_season_count,
        "topics": rows,
    }

    write_json(args.output_public, payload)
    write_json(args.output_data, payload)
    print(f"[topic-calendar] wrote {args.output_public} and {args.output_data}")


if __name__ == "__main__":
    main()
