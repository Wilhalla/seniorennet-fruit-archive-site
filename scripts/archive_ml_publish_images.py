#!/usr/bin/env python3
"""Publish automatic image descriptions and counted visual categories to the gallery."""
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

from archive_ml import WORK, load_json, question_hash, write_json
from archive_ml_image_tags import selected_image_tags
from archive_ml_units import meaningful_image_text


OUT_DIRS = (Path("src/data/generated"), Path("public/generated"))


def build_image_outputs(source_images: list[dict], client_images: list[dict], observations: list[dict],
                        predictions: dict, vocabulary: dict, mapping: dict, old_manifest: dict,
                        post_categories: dict | None = None) -> dict:
    by_observation = {row["id"]: row for row in observations}
    ids = {row["id"] for row in source_images}
    if len(ids) != len(source_images) or set(by_observation) != ids or set(predictions) != ids:
        raise ValueError("image observations and scores must cover every gallery image")
    if {row["id"] for row in client_images} != ids:
        raise ValueError("client gallery index does not cover the same images")
    hash_value = question_hash(vocabulary)
    if any(predictions[image_id].get("vocabularyHash") != hash_value for image_id in ids):
        raise ValueError("image scores use a different tag vocabulary")
    categories = mapping["categories"]
    category_ids = [category["id"] for category in categories]
    if len(category_ids) != len(set(category_ids)) or "overig" in category_ids:
        raise ValueError("category IDs must be unique; overig is reserved")
    known_tags = {tag["id"] for tag in vocabulary["tags"]}
    if set.union(*(set(category["tagIds"]) for category in categories)) != known_tags:
        raise ValueError("image category mapping must cover every tag")
    if any(not set(category["tagIds"]).issubset(known_tags) for category in categories):
        raise ValueError("image category mapping contains unknown tags")

    selected_by_id = {}
    counts = Counter()
    post_categories = post_categories or {}
    for image_id in ids:
        tags = selected_image_tags(by_observation[image_id], predictions[image_id], vocabulary, post_categories)
        ranked = sorted(((max((predictions[image_id]["tagScores"][tag_id] for tag_id in category["tagIds"]
                               if tag_id in tags), default=0), category["id"])
                         for category in categories), key=lambda pair: (-pair[0], category_ids.index(pair[1])))
        matches = [category_id for score, category_id in ranked if score > 0] or ["overig"]
        selected_by_id[image_id] = {"tagIds": sorted(tags), "categoryIds": matches}
        counts.update(matches)

    def enrich(row: dict) -> dict:
        observation = by_observation[row["id"]]
        context = observation["linkedContext"]
        specific_text = [link["text"] for link in context.get("linkedText", [])
                         if link.get("kind") in {"image-alt", "image-title", "numbered-caption"}
                         and link.get("sourcePostId") == observation["postId"]
                         and meaningful_image_text(link.get("text") or "")][:2]
        assignment = selected_by_id[row["id"]]
        return {**row, "postId": observation["postId"], "seriesId": context.get("seriesId"),
                "seriesTitle": context.get("seriesTitle") if context.get("seriesTitle") != row.get("postTitle") else None,
                "visualDescription": observation["description"],
                "imageSpecificText": specific_text, "imageTagIds": assignment["tagIds"],
                "visualTags": assignment["categoryIds"]}

    source = [enrich(row) for row in source_images]
    client = [enrich(row) for row in client_images]
    published_categories = [{"id": category["id"], "label": category["label"],
                             "description": category["description"], "icon": category["icon"],
                             "tagIds": category["tagIds"], "count": counts[category["id"]]}
                            for category in categories]
    published_categories.append({"id": "overig", "label": "Overig", "description": "Beelden zonder geselecteerde inhoudelijke tag",
                                 "icon": "▦", "tagIds": [], "count": counts["overig"]})
    years = Counter(str(row["year"]) for row in source if row.get("year"))
    seasons = Counter(row["season"] for row in source if row.get("season"))
    groups = {"years": [{"id": year, "label": year, "count": count} for year, count in sorted(years.items(), reverse=True)],
              "seasons": [{"id": season, "label": season, "count": seasons[season]}
                          for season in ("lente", "zomer", "herfst", "winter")],
              "themes": [{"id": category["id"], "label": category["label"], "icon": category["icon"],
                          "count": category["count"]} for category in published_categories]}
    manifest = {**old_manifest, "captionModel": observations[0]["descriptionModel"],
                "captionCoverage": len(observations), "imageTagModel": predictions[observations[0]["id"]]["model"],
                "imageTagVocabularyVersion": vocabulary["version"], "imageCategoryMapVersion": mapping["version"],
                "categoryCount": len(published_categories)}
    return {"image-index.json": source, "image-index.client.json": client,
            "image-index.initial.json": client[:40], "gallery-groups.json": groups,
            "image-categories.json": {"version": mapping["version"], "categories": published_categories},
            "image-manifest.json": manifest}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", type=Path, default=WORK / "image-observations.json")
    parser.add_argument("--predictions", type=Path, default=WORK / "image-tag-scores.json")
    parser.add_argument("--vocabulary", type=Path, default=Path("ml/image-vocabulary.approved.json"))
    parser.add_argument("--mapping", type=Path, default=Path("ml/image-category-map.approved.json"))
    parser.add_argument("--post-categories", type=Path, default=Path("src/data/generated/post-categories.json"))
    args = parser.parse_args()
    source_dir = Path("src/data/generated")
    outputs = build_image_outputs(load_json(source_dir / "image-index.json"),
                                  load_json(source_dir / "image-index.client.json"),
                                  load_json(args.observations), load_json(args.predictions),
                                  load_json(args.vocabulary), load_json(args.mapping),
                                  load_json(source_dir / "image-manifest.json"),
                                  load_json(args.post_categories))
    for name, value in outputs.items():
        for folder in OUT_DIRS:
            if name == "image-index.json" and folder.name == "generated" and folder.parent.name == "public":
                continue
            write_json(folder / name, value)
    print(f"Published {len(outputs['image-index.client.json'])} image descriptions and {len(outputs['image-categories.json']['categories'])} gallery categories")


if __name__ == "__main__":
    main()
