#!/usr/bin/env python3
"""Publish counted tag categories and embedding positions for the static site."""
from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

from archive_ml import POSTS, load_all_units, load_json, question_hash, write_json
from archive_ml_counts import selected_tags


def build_outputs(posts: list[dict], units: list[dict], predictions: dict, vocabulary: dict,
                  mapping: dict, atlas: dict) -> dict[str, object]:
    unit_ids = {unit["id"] for unit in units}
    post_by_id = {post["id"]: post for post in posts}
    atlas_by_id = {point["id"]: point for point in atlas["points"]}
    if set(predictions) != unit_ids or set(atlas_by_id) != unit_ids:
        raise ValueError("tag scores and embedding projection must cover every browse unit")
    if any(predictions[unit_id].get("vocabularyHash") != question_hash(vocabulary) for unit_id in unit_ids):
        raise ValueError("tag scores use a different vocabulary")
    known_tags = {tag["id"] for tag in vocabulary["tags"]}
    categories = mapping["categories"]
    if set.union(*(set(category["tagIds"]) for category in categories)) != known_tags:
        raise ValueError("category mapping must cover every approved tag")
    category_ids = [category["id"] for category in categories]
    if len(category_ids) != len(set(category_ids)) or "overig" in category_ids:
        raise ValueError("category IDs must be unique; overig is reserved")

    member_units: dict[str, list[tuple[float, dict]]] = defaultdict(list)
    post_categories: dict[str, dict] = {}
    map_points: list[dict] = []
    related_posts: dict[str, list[str]] = {}
    primary_by_unit = {unit["id"]: unit["primaryPostId"] for unit in units}
    for unit in units:
        unit_id = unit["id"]
        scores = predictions[unit_id]["tagScores"]
        tags = selected_tags(scores, vocabulary)
        ranked_categories = sorted(
            ((max((scores[tag_id] for tag_id in category["tagIds"] if tag_id in tags), default=0), category["id"])
             for category in categories),
            key=lambda pair: (-pair[0], category_ids.index(pair[1])),
        )
        matches = [category_id for score, category_id in ranked_categories if score > 0]
        primary_category = matches[0] if matches else "overig"
        for score, category_id in ranked_categories:
            if score > 0:
                member_units[category_id].append((score, unit))
        if not matches:
            member_units["overig"].append((0, unit))

        primary_post = post_by_id[unit["primaryPostId"]]
        representative_image = next((post_by_id[post_id]["images"][0] for post_id in unit["postIds"]
                                     if post_by_id[post_id].get("images")), None)
        position = atlas_by_id[unit_id]
        related = [primary_by_unit[neighbor] for neighbor in position["neighbors"] if neighbor in primary_by_unit]
        for post_id in unit["postIds"]:
            post_categories[post_id] = {"unitId": unit_id, "categoryIds": matches or ["overig"],
                                        "primaryCategoryId": primary_category, "tagIds": sorted(tags)}
            related_posts[post_id] = [other for other in [*unit["postIds"], *related]
                                      if other != post_id][:6]
        map_points.append({
            "id": unit_id, "postIds": unit["postIds"], "slug": primary_post["slug"],
            "title": unit["title"], "date": primary_post["date"], "year": primary_post["year"],
            "month": primary_post["month"], "season": primary_post["season"],
            "topicId": primary_category, "categoryIds": matches or ["overig"], "tagIds": sorted(tags),
            "x": position["x"], "y": position["y"], "neighbors": position["neighbors"],
            "imageCount": unit["imageCount"], "image": representative_image,
            "excerpt": primary_post.get("excerpt") or "",
        })

    if set(post_categories) != set(post_by_id):
        raise ValueError("category publication did not cover every raw post")
    published_categories = [
        {"id": category["id"], "label": category["label"], "description": category["description"],
         "tagIds": category["tagIds"], "unitCount": len(member_units[category["id"]]),
         "postCount": sum(len(unit["postIds"]) for _, unit in member_units[category["id"]]),
         "representativePostIds": [unit["primaryPostId"] for _, unit in sorted(member_units[category["id"]],
                                                                                  key=lambda pair: -pair[0])[:5]]}
        for category in categories
    ]
    published_categories.append({
        "id": "overig", "label": "Overig", "description": "Berichten zonder geselecteerd inhoudelijk tag",
        "tagIds": [], "unitCount": len(member_units["overig"]),
        "postCount": sum(len(unit["postIds"]) for _, unit in member_units["overig"]),
        "representativePostIds": [unit["primaryPostId"] for _, unit in member_units["overig"][:5]],
    })
    tag_labels = {tag["id"]: tag["label"] for tag in vocabulary["tags"]}
    topics = [{"id": category["id"], "label": category["label"], "generatedLabel": "",
               "description": category["description"], "postCount": category["postCount"],
               "unitCount": category["unitCount"], "representativePostIds": category["representativePostIds"],
               "textKeywords": [tag_labels[tag_id] for tag_id in category["tagIds"][:8]]}
              for category in published_categories]
    return {
        "manifest.json": {"contractVersion": 3, "postCount": len(posts), "browseUnitCount": len(units),
                          "tagVocabularyVersion": vocabulary["version"], "tagCount": len(known_tags),
                          "categoryMapVersion": mapping["version"], "categoryCount": len(published_categories),
                          "embeddingModel": atlas["model"], "projectionMethod": atlas["method"],
                          "relatedMethod": "exact-cosine-embedding-neighbors", "embeddingInput": "post-text-and-reviewed-image-descriptions"},
        "categories.json": {"version": mapping["version"], "vocabularyVersion": vocabulary["version"],
                            "embeddingModel": atlas["model"], "embeddingMethod": atlas["method"],
                            "categories": published_categories},
        "map-points.json": map_points,
        "topics.json": topics,
        "post-categories.json": post_categories,
        "post-category-ids.json": {post_id: row["categoryIds"] for post_id, row in post_categories.items()},
        "related-posts.json": related_posts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--predictions", type=Path, default=Path("ml-work/tag-scores.json"))
    parser.add_argument("--vocabulary", type=Path, default=Path("ml/tag-vocabulary.approved.json"))
    parser.add_argument("--mapping", type=Path, default=Path("ml/category-map.approved.json"))
    parser.add_argument("--atlas", type=Path, default=Path("ml-work/atlas-preview.json"))
    args = parser.parse_args()
    outputs = build_outputs(load_json(POSTS), load_all_units(), load_json(args.predictions),
                            load_json(args.vocabulary), load_json(args.mapping), load_json(args.atlas))
    for name, value in outputs.items():
        for folder in (Path("src/data/generated"), Path("public/generated")):
            write_json(folder / name, value)
    print(f"Published {len(outputs['map-points.json'])} Atlas stories and {len(outputs['topics.json'])} categories")


if __name__ == "__main__":
    main()
