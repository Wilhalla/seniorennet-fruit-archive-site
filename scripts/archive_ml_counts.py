"""Tag frequency, evaluation and category-bundle previews; no network calls."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

SWEEP = (0.3, 0.5, 0.7, 0.9)


def selected_tags(scores: dict[str, float], vocabulary: dict[str, Any]) -> set[str]:
    return {tag["id"] for tag in vocabulary["tags"]
            if scores.get(tag["id"], 0) >= tag.get("threshold", 0.5)}


def summarize_tags(vocabulary: dict[str, Any], predictions: dict[str, Any],
                   units: list[dict[str, Any]], vocabulary_hash: str) -> dict[str, Any]:
    matching = [(unit, predictions[unit["id"]]) for unit in units
                if unit["id"] in predictions and predictions[unit["id"]].get("vocabularyHash") == vocabulary_hash]
    tags = []
    for tag in vocabulary["tags"]:
        tag_id = tag["id"]
        scores = [row["tagScores"][tag_id] for _, row in matching]
        threshold = tag.get("threshold", 0.5)
        selected = [(unit, score) for (unit, _), score in zip(matching, scores) if score >= threshold]
        tags.append({"id": tag_id, "label": tag["label"], "threshold": threshold,
                     "scoreSum": round(sum(scores), 2),
                     "unitCount": len(selected), "postCount": sum(len(unit["postIds"]) for unit, _ in selected),
                     "sweep": {str(value): sum(score >= value for score in scores) for value in SWEEP}})
    tags.sort(key=lambda item: (-item["unitCount"], item["id"]))
    assigned = sum(bool(selected_tags(row["tagScores"], vocabulary)) for _, row in matching)
    return {"vocabularyVersion": vocabulary["version"], "unitsInArchive": len(units),
            "unitsClassified": len(matching), "unitsWithAnyTag": assigned,
            "unitsWithoutTag": len(matching) - assigned, "tags": tags}


def evaluate_tags(vocabulary: dict[str, Any], predictions: dict[str, Any],
                  review_rows: list[dict[str, Any]], vocabulary_hash: str, split: str) -> dict[str, Any]:
    valid_ids = {tag["id"] for tag in vocabulary["tags"]}
    reviewed = [row for row in review_rows if row.get("split") == split and row.get("tagReviewStatus") == "reviewed"]
    for row in reviewed:
        unknown = set(row.get("goldTagIds", [])) - valid_ids
        if unknown:
            raise ValueError(f"reviewed unit {row['id']} has unknown gold tags: {sorted(unknown)}")
    paired = [(row, predictions[row["id"]]) for row in reviewed
              if row["id"] in predictions and predictions[row["id"]].get("vocabularyHash") == vocabulary_hash]
    if not paired:
        raise ValueError("no reviewed units with matching predictions in selected split")
    metrics = []
    for tag in vocabulary["tags"]:
        tag_id = tag["id"]
        def score_at(threshold: float) -> dict[str, Any]:
            tp = fp = fn = 0
            for gold, prediction in paired:
                actual = tag_id in gold["goldTagIds"]
                predicted = prediction["tagScores"][tag_id] >= threshold
                tp += int(actual and predicted)
                fp += int(not actual and predicted)
                fn += int(actual and not predicted)
            return {"tp": tp, "fp": fp, "fn": fn,
                    "precision": tp / (tp + fp) if tp + fp else None,
                    "recall": tp / (tp + fn) if tp + fn else None}
        threshold = tag.get("threshold", 0.5)
        metrics.append({"id": tag_id, "threshold": threshold, **score_at(threshold),
                        "developmentSweep": {str(value): score_at(value) for value in SWEEP} if split == "development" else None})
    exact = sum(selected_tags(prediction["tagScores"], vocabulary) == set(row["goldTagIds"])
                for row, prediction in paired)
    return {"split": split, "reviewedUnits": len(reviewed), "evaluatedUnits": len(paired),
            "coverage": len(paired) / len(reviewed), "exactSetAccuracy": exact / len(paired),
            "byTag": metrics,
            "costUsd": sum(float(prediction["usage"]["cost"]) for _, prediction in paired)}


def bundle_categories(vocabulary: dict[str, Any], mapping: dict[str, Any],
                      predictions: dict[str, Any], units: list[dict[str, Any]], vocabulary_hash: str) -> dict[str, Any]:
    known_tags = {tag["id"] for tag in vocabulary["tags"]}
    categories = mapping.get("categories")
    if not isinstance(categories, list) or not categories:
        raise ValueError("category mapping needs at least one bundle")
    category_ids: set[str] = set()
    mapped_tags: set[str] = set()
    for category in categories:
        if not all(isinstance(category.get(key), str) and category[key].strip() for key in ("id", "label")):
            raise ValueError("each category needs id and label")
        tag_ids = category.get("tagIds")
        if category["id"] in category_ids or not isinstance(tag_ids, list) or not tag_ids:
            raise ValueError(f"duplicate or empty category {category['id']}")
        unknown = set(tag_ids) - known_tags
        if unknown:
            raise ValueError(f"category {category['id']} uses unknown tags: {sorted(unknown)}")
        category_ids.add(category["id"])
        mapped_tags.update(tag_ids)
    matching = [(unit, predictions[unit["id"]]) for unit in units
                if unit["id"] in predictions and predictions[unit["id"]].get("vocabularyHash") == vocabulary_hash]
    counts = defaultdict(lambda: {"unitCount": 0, "postCount": 0})
    overlaps = 0
    unassigned = 0
    for unit, prediction in matching:
        assigned_tags = selected_tags(prediction["tagScores"], vocabulary)
        hits = [category["id"] for category in categories if assigned_tags.intersection(category["tagIds"])]
        overlaps += int(len(hits) > 1)
        unassigned += int(not hits)
        for category_id in hits:
            counts[category_id]["unitCount"] += 1
            counts[category_id]["postCount"] += len(unit["postIds"])
    return {"mappingVersion": mapping.get("version"), "vocabularyVersion": vocabulary["version"],
            "unitsClassified": len(matching), "unitsInMultipleCategories": overlaps,
            "unitsWithoutCategory": unassigned, "unmappedTagIds": sorted(known_tags - mapped_tags),
            "categories": [{"id": category["id"], "label": category["label"],
                            "tagIds": category["tagIds"], **counts[category["id"]]} for category in categories]}
