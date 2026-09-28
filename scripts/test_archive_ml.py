import argparse
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import archive_ml
from archive_ml_counts import bundle_categories, evaluate_tags, summarize_tags
from archive_ml_units import build_units, image_context, unit_state


VOCABULARY = {"version": "test-1", "status": "approved", "tags": [
    {"id": "fruit", "label": "Fruit", "question": "Gaat dit over fruit?", "definition": "Fruit als onderwerp.", "threshold": 0.6},
    {"id": "visit", "label": "Bezoek", "question": "Beschrijft dit een bezoek?", "definition": "Een uitstap als onderwerp."},
]}


class ArchiveMlTests(unittest.TestCase):
    def test_sample_is_deterministic_and_balanced(self):
        rows = [{"id": str(i), "topicId": "rare" if i < 2 else "common"} for i in range(12)]
        first = archive_ml.sample_evenly(rows, 5, "topicId", 42)
        self.assertEqual(first, archive_ml.sample_evenly(rows, 5, "topicId", 42))
        self.assertEqual(sum(row["topicId"] == "rare" for row in first), 2)

    def test_series_forms_one_browse_unit_without_reactions(self):
        posts = [
            {"id": "a", "slug": "a", "title": "Peren", "cleanedText": "Bezoek aan een boomgaard.", "imageCount": 1},
            {"id": "b", "slug": "b", "title": "Vervolg", "cleanedText": "Nog meer peren. Reacties 22-04-2020 · spam", "imageCount": 2},
            {"id": "c", "slug": "c", "title": "Los bericht", "cleanedText": "Over appels.", "imageCount": 0},
        ]
        series = [{"id": "series-a", "primaryPostId": "a", "postIds": ["a", "b"], "title": "Boomgaardbezoek", "source": "curated"}]
        units = build_units(posts, series)
        self.assertEqual(len(units), 2)
        self.assertEqual(units[0]["postIds"], ["a", "b"])
        self.assertEqual(units[0]["imageCount"], 3)
        self.assertIn("Nog meer peren", unit_state(units[0])["post_text"])
        self.assertNotIn("spam", unit_state(units[0])["post_text"])

    def test_image_text_is_linked_context_only(self):
        raw = {"id": "a", "slug": "a", "title": "Foto's", "html": '<p>1 &amp; 2 Rode appels</p><img src="/archive-images/a.jpg">'}
        context = image_context({"id": "img-a", "src": "/archive-images/a.jpg", "imageIndex": 0}, raw, None)
        self.assertEqual(context["role"], "linked-context-only")
        self.assertEqual(context["linkedText"][0]["text"], "Rode appels")
        state = unit_state({"title": "Foto's", "parts": [{"slug": "a", "title": "Foto's", "text": ""}]})
        self.assertNotIn("linkedText", state)

    def test_regenerating_sample_preserves_review_work(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            posts, images, raw, series = (root / name for name in ("posts.json", "images.json", "raw.json", "series.json"))
            archive_ml.write_json(posts, [{"id": "one", "slug": "post-one", "title": "Appels", "cleanedText": "Appels", "topicId": "fruit"}])
            archive_ml.write_json(images, [{"id": "image-one", "src": "/archive-images/a.jpg", "postSlug": "post-one", "imageIndex": 0}])
            archive_ml.write_json(raw, [{"id": "one", "slug": "post-one", "title": "Appels", "html": '<img src="/archive-images/a.jpg">'}])
            archive_ml.write_json(series, {"series": []})
            with patch.object(archive_ml, "POSTS", posts), patch.object(archive_ml, "IMAGES", images), patch.object(archive_ml, "RAW_POSTS", raw), patch.object(archive_ml, "SERIES", series):
                output = root / "review"
                archive_ml.make_sample(1, 1, output)
                units = archive_ml.load_json(output / "units.json")
                units[0]["goldTagIds"] = ["fruit"]
                archive_ml.write_json(output / "units.json", units)
                reviewed_images = archive_ml.load_json(output / "images.json")
                reviewed_images[0]["description"] = "Een appel."
                archive_ml.write_json(output / "images.json", reviewed_images)
                archive_ml.make_sample(1, 1, output)
                self.assertEqual(archive_ml.load_json(output / "units.json")[0]["goldTagIds"], ["fruit"])
                self.assertEqual(archive_ml.load_json(output / "images.json")[0]["description"], "Een appel.")

    def test_jev_scores_tags_independently_and_requires_cost(self):
        payload = archive_ml.jev_payload({"title": "Appels"}, VOCABULARY)
        self.assertEqual(set(payload["questions"]), {"fruit", "visit"})
        self.assertTrue(all(question["type"] == "noul" for question in payload["questions"].values()))
        changed_threshold = {**VOCABULARY, "tags": [{**VOCABULARY["tags"][0], "threshold": 0.8}, VOCABULARY["tags"][1]]}
        self.assertEqual(archive_ml.question_hash(VOCABULARY), archive_ml.question_hash(changed_threshold))
        response = {"answers": {"fruit": {"type": "noul", "noul": 0.8}, "visit": {"type": "noul", "noul": 0.2}}}
        with self.assertRaisesRegex(ValueError, "cost"):
            archive_ml.validate_answer(response, VOCABULARY)
        response["usage"] = {"cost": 0.001}
        self.assertEqual(archive_ml.validate_answer(response, VOCABULARY)["tagScores"]["fruit"], 0.8)

    def test_paid_tagging_requires_approved_vocabulary_and_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tags.json"
            archive_ml.write_json(path, {**VOCABULARY, "status": "draft"})
            args = argparse.Namespace(vocabulary=path, paid=True, max_items=1, max_usd=1)
            with patch.object(archive_ml, "request_jev") as network:
                with self.assertRaisesRegex(ValueError, "approved"):
                    archive_ml.classify(args)
                network.assert_not_called()
            archive_ml.write_json(path, VOCABULARY)
            args.paid = False
            with patch.object(archive_ml, "request_jev") as network:
                with self.assertRaisesRegex(ValueError, "requires"):
                    archive_ml.classify(args)
                network.assert_not_called()

    def test_tag_counts_evaluation_and_bundles_use_unit_counts(self):
        units = [{"id": "series-a", "postIds": ["a", "b"]}, {"id": "post-c", "postIds": ["c"]}]
        predictions = {
            "series-a": {"vocabularyHash": "hash", "tagScores": {"fruit": 0.9, "visit": 0.7}, "usage": {"cost": 0.01}},
            "post-c": {"vocabularyHash": "hash", "tagScores": {"fruit": 0.2, "visit": 0.1}, "usage": {"cost": 0.01}},
        }
        counts = summarize_tags(VOCABULARY, predictions, units, "hash")
        self.assertEqual(counts["tags"][0]["unitCount"], 1)
        self.assertEqual(counts["tags"][0]["postCount"], 2)
        review = [{"id": "series-a", "split": "development", "tagReviewStatus": "reviewed", "goldTagIds": ["fruit", "visit"]}]
        self.assertEqual(evaluate_tags(VOCABULARY, predictions, review, "hash", "development")["exactSetAccuracy"], 1)
        mapping = {"version": "draft", "categories": [{"id": "plants", "label": "Planten", "tagIds": ["fruit"]}]}
        bundle = bundle_categories(VOCABULARY, mapping, predictions, units, "hash")
        self.assertEqual(bundle["categories"][0]["unitCount"], 1)
        self.assertEqual(bundle["unmappedTagIds"], ["visit"])

    def test_unreviewed_image_descriptions_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "images.json"
            archive_ml.write_json(path, [
                {"id": "one", "postSlug": "post-a", "description": "Een appel.", "descriptionModel": "test", "descriptionStatus": "unreviewed"},
                {"id": "two", "postSlug": "post-b", "description": "Een peer.", "descriptionModel": "test", "descriptionStatus": "reviewed"},
            ])
            self.assertEqual(archive_ml.load_observations(path), {"post-b": ["Een peer."]})

    def test_embedding_requires_usage_for_budget(self):
        with self.assertRaisesRegex(ValueError, "token count"):
            archive_ml.validate_embedding({"data": [{"embedding": [0.1, 0.2]}]}, 0.02)
        result = archive_ml.validate_embedding({"data": [{"embedding": [0.1, 0.2]}], "usage": {"prompt_tokens": 100}}, 0.02)
        self.assertAlmostEqual(result["usage"]["estimatedCostUsd"], 0.000002)


if __name__ == "__main__":
    unittest.main()
