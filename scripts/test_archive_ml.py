import argparse
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import archive_ml


TAXONOMY = {
    "version": "test-1", "status": "approved",
    "categories": [
        {"id": "fruit", "label": "Fruit", "definition": "Fruit varieties and harvest."},
        {"id": "other", "label": "Overig", "definition": "Unclear or outside the taxonomy."},
    ],
    "facets": [{"id": "visit", "question": "Does this describe a visit?"}],
}


class ArchiveMlTests(unittest.TestCase):
    def test_sample_is_deterministic_and_balanced(self):
        rows = [{"id": str(i), "topicId": "rare" if i < 2 else "common"} for i in range(12)]
        first = archive_ml.sample_evenly(rows, 5, "topicId", 42)
        self.assertEqual(first, archive_ml.sample_evenly(rows, 5, "topicId", 42))
        self.assertEqual(sum(row["topicId"] == "rare" for row in first), 2)
        self.assertEqual(archive_ml.split_for("123"), archive_ml.split_for("123"))

    def test_reactions_do_not_enter_model_input(self):
        post = {"title": "Appels", "slug": "appels", "cleanedText": "Mijn appels zijn rijp. Reacties 22-04-2020 · reclame"}
        self.assertEqual(archive_ml.classification_input(post)["text"], "Mijn appels zijn rijp.")

    def test_regenerating_sample_preserves_review_work(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            posts = root / "posts.json"
            images = root / "images.json"
            archive_ml.write_json(posts, [{"id": "one", "slug": "post-one", "title": "Appels", "cleanedText": "Appels", "topicId": "fruit"}])
            archive_ml.write_json(images, [{"id": "image-one", "src": "/archive-images/a.jpg", "postSlug": "post-one"}])
            with patch.object(archive_ml, "POSTS", posts), patch.object(archive_ml, "IMAGES", images):
                output = root / "review"
                archive_ml.make_sample(1, 1, output)
                reviewed_posts = archive_ml.load_json(output / "posts.json")
                reviewed_posts[0]["goldCategoryId"] = "fruit"
                archive_ml.write_json(output / "posts.json", reviewed_posts)
                reviewed_images = archive_ml.load_json(output / "images.json")
                reviewed_images[0]["description"] = "Een appel."
                archive_ml.write_json(output / "images.json", reviewed_images)
                archive_ml.make_sample(1, 1, output)
                self.assertEqual(archive_ml.load_json(output / "posts.json")[0]["goldCategoryId"], "fruit")
                self.assertEqual(archive_ml.load_json(output / "images.json")[0]["description"], "Een appel.")

    def test_question_contract_separates_category_and_facets(self):
        payload = archive_ml.jev_payload({"title": "Appels"}, TAXONOMY)
        self.assertEqual(payload["questions"]["category"]["type"], "choice")
        self.assertEqual(set(payload["questions"]["category"]["criteria"]), {"fruit", "other"})
        self.assertEqual(payload["questions"]["visit"]["type"], "noul")
        self.assertEqual(payload["model"], archive_ml.JEV_MODEL)

    def test_rejects_unpriced_or_wrong_jev_response(self):
        response = {"answers": {
            "category": {"type": "choice", "choice": "fruit", "confidence": 0.8},
            "visit": {"type": "noul", "noul": 0.2},
        }}
        with self.assertRaisesRegex(ValueError, "cost"):
            archive_ml.validate_answer(response, TAXONOMY)
        response["usage"] = {"cost": 0.001}
        self.assertEqual(archive_ml.validate_answer(response, TAXONOMY)["categoryId"], "fruit")
        response["answers"]["category"]["choice"] = "unknown"
        with self.assertRaisesRegex(ValueError, "category"):
            archive_ml.validate_answer(response, TAXONOMY)

    def test_paid_run_requires_reviewed_taxonomy_and_explicit_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "taxonomy.json"
            archive_ml.write_json(path, {**TAXONOMY, "status": "draft"})
            args = argparse.Namespace(taxonomy=path, paid=True, max_items=1, max_usd=1)
            with patch.object(archive_ml, "request_jev") as network:
                with self.assertRaisesRegex(ValueError, "approved"):
                    archive_ml.classify(args)
                network.assert_not_called()
            archive_ml.write_json(path, TAXONOMY)
            args.paid = False
            with patch.object(archive_ml, "request_jev") as network:
                with self.assertRaisesRegex(ValueError, "requires"):
                    archive_ml.classify(args)
                network.assert_not_called()

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
