#!/usr/bin/env python3
"""Count nonexclusive image tags from cached Jev scores before grouping categories."""
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

from archive_ml import WORK, load_json, question_hash, write_json
from archive_ml_counts import SWEEP
from archive_ml_image_tags import selected_image_tags


def summarize_images(observations: list[dict], predictions: dict, vocabulary: dict,
                     post_categories: dict) -> dict:
    vocabulary_hash = question_hash(vocabulary)
    scored = [row for row in observations if row["id"] in predictions
              and predictions[row["id"]].get("vocabularyHash") == vocabulary_hash]
    counts = Counter(tag for row in scored for tag in selected_image_tags(row, predictions[row["id"]], vocabulary, post_categories))
    tags = []
    for tag in vocabulary["tags"]:
        scores = [predictions[row["id"]]["tagScores"][tag["id"]] for row in scored]
        tags.append({"id": tag["id"], "label": tag["label"], "threshold": tag.get("threshold", 0.5),
                     "imageCount": counts[tag["id"]], "scoreSum": round(sum(scores), 2),
                     "sweep": {str(threshold): sum(score >= threshold for score in scores) for threshold in SWEEP}})
    tags.sort(key=lambda row: (-row["imageCount"], row["id"]))
    return {"vocabularyVersion": vocabulary["version"], "imagesInArchive": len(observations),
            "imagesClassified": len(scored), "imagesWithAnyTag": sum(bool(selected_image_tags(row, predictions[row["id"]], vocabulary, post_categories)) for row in scored),
            "tags": tags}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", type=Path, default=WORK / "image-observations.json")
    parser.add_argument("--predictions", type=Path, default=WORK / "image-tag-scores.json")
    parser.add_argument("--vocabulary", type=Path, default=Path("ml/image-vocabulary.approved.json"))
    parser.add_argument("--post-categories", type=Path, default=Path("src/data/generated/post-categories.json"))
    parser.add_argument("--output", type=Path, default=WORK / "image-tag-counts.json")
    args = parser.parse_args()
    report = summarize_images(load_json(args.observations), load_json(args.predictions),
                              load_json(args.vocabulary), load_json(args.post_categories))
    write_json(args.output, report)
    print(f"Counted {report['imagesClassified']}/{report['imagesInArchive']} image scores")


if __name__ == "__main__":
    main()
