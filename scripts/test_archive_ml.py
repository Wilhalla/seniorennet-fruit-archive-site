import argparse
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import archive_ml
from archive_ml_publish import build_outputs
from archive_ml_counts import bundle_categories, evaluate_tags, summarize_tags
from archive_ml_units import build_units, image_context, image_state, unit_state


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

    def test_jev_batch_scores_named_records_and_allocates_exact_total_cost(self):
        payload = archive_ml.jev_batch_payload([{"title": "Appels"}, {"title": "Bezoek"}], VOCABULARY)
        self.assertEqual(set(payload["questions"]), {"r0__fruit", "r0__visit", "r1__fruit", "r1__visit"})
        self.assertEqual(payload["state"]["records"][1]["id"], "r1")
        response = {"answers": {
            "r0__fruit": {"type": "noul", "noul": 0.9}, "r0__visit": {"type": "noul", "noul": 0.1},
            "r1__fruit": {"type": "noul", "noul": 0.2}, "r1__visit": {"type": "noul", "noul": 0.8},
        }, "usage": {"cost": 0.002}}
        results = archive_ml.validate_batch_answers(response, VOCABULARY, 2)
        self.assertEqual(results[0]["tagScores"], {"fruit": 0.9, "visit": 0.1})
        self.assertEqual(results[1]["tagScores"], {"fruit": 0.2, "visit": 0.8})
        self.assertAlmostEqual(sum(row["usage"]["cost"] for row in results), 0.002)
        del response["answers"]["r1__visit"]
        with self.assertRaisesRegex(ValueError, "visit"):
            archive_ml.validate_batch_answers(response, VOCABULARY, 2)

    def test_long_posts_are_complete_and_get_smaller_batches(self):
        posts = [{"id": str(index), "slug": str(index), "title": "Lang verhaal",
                  "cleanedText": "Appels " * (1300 if index == 0 else 20)} for index in range(3)]
        units = build_units(posts, [])
        self.assertEqual(unit_state(units[0])["post_text"].count("Appels"), 1300)
        solo_size = len(archive_ml.json.dumps(archive_ml.jev_batch_payload([unit_state(units[0])], VOCABULARY)))
        batches = archive_ml.planned_tag_batches(units, {}, VOCABULARY, 3, solo_size + 100)
        self.assertEqual([len(batch) for batch in batches], [1, 2])
        with self.assertRaisesRegex(ValueError, "above limit"):
            archive_ml.planned_tag_batches(units, {}, VOCABULARY, 3, solo_size - 1)

    def test_tagging_batches_units_and_reuses_per_unit_cache(self):
        units = [
            {"id": f"post-{index}", "postIds": [str(index)], "title": f"Post {index}",
             "parts": [{"slug": str(index), "title": f"Post {index}", "text": "Appels"}]}
            for index in range(3)
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            vocabulary = root / "tags.json"
            output = root / "scores.json"
            archive_ml.write_json(vocabulary, VOCABULARY)
            args = argparse.Namespace(vocabulary=vocabulary, paid=True, max_items=3, max_usd=1,
                                      reserve_usd=0.01, batch_size=2, observations=None,
                                      sample=None, output=output)
            payload_sizes = []

            def respond(payload, _key):
                size = len(payload["state"]["records"])
                payload_sizes.append(size)
                return {"answers": {f"r{index}__{tag['id']}": {"type": "noul", "noul": 0.8}
                                    for index in range(size) for tag in VOCABULARY["tags"]},
                        "usage": {"cost": size * 0.001}}

            with patch.object(archive_ml, "WORK", root / "work"), \
                 patch.object(archive_ml, "load_all_units", return_value=units), \
                 patch.object(archive_ml, "openrouter_key", return_value="test-key"), \
                 patch.object(archive_ml, "request_jev", side_effect=respond):
                archive_ml.classify(args)
                self.assertEqual(payload_sizes, [2, 1])
                rows = archive_ml.load_json(output)
                self.assertEqual(len(rows), 3)
                self.assertAlmostEqual(sum(row["usage"]["cost"] for row in rows.values()), 0.003)
                with patch.object(archive_ml, "openrouter_key", return_value=None):
                    archive_ml.classify(args)
                self.assertEqual(payload_sizes, [2, 1])
                args.batch_size = 1
                archive_ml.classify(args)
                # The original final unit was already sent alone, so its raw
                # request is reused while the two grouped units are rescored.
                self.assertEqual(payload_sizes, [2, 1, 1, 1])
                ledger = archive_ml.load_json(root / "work/cache/jev/paid-requests.json")
                self.assertAlmostEqual(sum(ledger.values()), 0.005)

    def test_paid_tagging_requires_approved_vocabulary_and_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tags.json"
            archive_ml.write_json(path, {**VOCABULARY, "status": "draft"})
            args = argparse.Namespace(vocabulary=path, paid=True, max_items=1, max_usd=1)
            with patch.object(archive_ml, "request_jev") as network:
                with self.assertRaisesRegex(ValueError, "draft vocabulary"):
                    archive_ml.classify(args)
                network.assert_not_called()
            args.trial = True
            args.sample = path
            with patch.object(archive_ml, "request_jev") as network:
                with self.assertRaisesRegex(ValueError, "draft vocabulary"):
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
                {"id": "two", "postSlug": "post-b", "description": "Een peer.", "descriptionModel": "test",
                 "descriptionStatus": "reviewed", "linkedContext": {"postId": "b", "linkedText": [
                     {"kind": "numbered-caption", "text": "Peer van opa", "sourcePostId": "b"},
                     {"kind": "numbered-caption", "text": "Wrong post", "sourcePostId": "a"},
                 ]}},
            ])
            observations = archive_ml.load_observations(path)
            self.assertEqual(set(observations), {"post-b"})
            state = unit_state({"title": "Peren", "parts": [{"slug": "post-b", "title": "Peren", "text": ""}]}, observations)
            self.assertEqual(state["reviewed_images"][0]["image_id"], "two")
            self.assertEqual(state["reviewed_images"][0]["visual_description"], "Een peer.")
            self.assertEqual(state["reviewed_images"][0]["linked_context"], [
                {"kind": "numbered-caption", "text": "Peer van opa", "sourcePostId": "b", "role": "linked-context-only"},
            ])

    def test_image_state_separates_visual_and_family_context(self):
        row = {"id": "image-1", "description": "Twee mensen aan tafel.", "descriptionStatus": "reviewed",
               "linkedContext": {"postId": "post-1", "postTitle": "Verjaardag van opa",
                                 "postExcerpt": "Opa vierde zijn verjaardag met de familie.",
                                 "linkedText": [{"kind": "numbered-caption", "text": "Opa en zijn kleinkind",
                                                 "sourcePostId": "post-1"}]}}
        state = image_state(row)
        self.assertEqual(state["visual_evidence"]["description"], "Twee mensen aan tafel.")
        self.assertNotIn("opa", str(state["visual_evidence"]).lower())
        self.assertEqual(state["linked_context"]["image_specific_text"][0]["text"], "Opa en zijn kleinkind")
        row["descriptionStatus"] = "unreviewed"
        with self.assertRaisesRegex(ValueError, "reviewed"):
            image_state(row)

    def test_embedding_requires_usage_for_budget(self):
        with self.assertRaisesRegex(ValueError, "token count"):
            archive_ml.validate_embedding({"data": [{"index": 0, "embedding": [0.1, 0.2]}]}, 0.02)
        result = archive_ml.validate_embedding({"data": [{"index": 0, "embedding": [0.1, 0.2]}], "usage": {"prompt_tokens": 100}}, 0.02)
        self.assertAlmostEqual(result["usage"]["estimatedCostUsd"], 0.000002)

    def test_embedding_batches_keep_complete_text_and_response_order(self):
        units = [{"id": f"post-{index}", "title": "Titel", "parts": [{"slug": str(index), "title": "Titel", "text": "appel " * (500 if index == 0 else 10)}]}
                 for index in range(3)]
        first_size = len(archive_ml.embedding_text(units[0], {}))
        batches = archive_ml.planned_embedding_batches(units, {}, 3, first_size + 20)
        self.assertEqual([len(batch) for batch in batches], [1, 2])
        response = {"data": [{"index": 1, "embedding": [0.2, 0.8]}, {"index": 0, "embedding": [0.9, 0.1]}],
                    "model": "test", "usage": {"prompt_tokens": 100}}
        results = archive_ml.validate_embeddings(response, 2, 0.01)
        self.assertEqual(results[0]["vector"], [0.9, 0.1])
        self.assertAlmostEqual(sum(row["usage"]["estimatedCostUsd"] for row in results), 0.000001)

    def test_published_categories_keep_series_together_and_overlap(self):
        posts = [{"id": post_id, "slug": post_id, "title": post_id, "date": "2020-01-01", "year": 2020,
                  "month": 1, "season": "winter", "imageCount": 1 if post_id == "b" else 0,
                  "images": ["/image-b.jpg"] if post_id == "b" else [], "excerpt": ""}
                 for post_id in ("a", "b", "c")]
        units = [{"id": "series-a", "primaryPostId": "a", "postIds": ["a", "b"], "title": "Familiefruit", "imageCount": 1},
                 {"id": "post-c", "primaryPostId": "c", "postIds": ["c"], "title": "Overig", "imageCount": 0}]
        predictions = {
            "series-a": {"vocabularyHash": archive_ml.question_hash(VOCABULARY), "tagScores": {"fruit": 0.9, "visit": 0.8}},
            "post-c": {"vocabularyHash": archive_ml.question_hash(VOCABULARY), "tagScores": {"fruit": 0.1, "visit": 0.1}},
        }
        mapping = {"version": "test", "categories": [
            {"id": "fruit", "label": "Fruit", "description": "Fruit", "tagIds": ["fruit"]},
            {"id": "visit", "label": "Bezoek", "description": "Bezoek", "tagIds": ["visit"]},
        ]}
        atlas = {"model": "test", "method": "umap", "points": [
            {"id": "series-a", "x": 0.1, "y": 0.2, "neighbors": ["post-c"]},
            {"id": "post-c", "x": 0.3, "y": 0.4, "neighbors": ["series-a"]},
        ]}
        result = build_outputs(posts, units, predictions, VOCABULARY, mapping, atlas)
        self.assertEqual(len(result["map-points.json"]), 2)
        self.assertEqual(result["map-points.json"][0]["image"], "/image-b.jpg")
        self.assertEqual(result["post-categories.json"]["b"]["categoryIds"], ["fruit", "visit"])
        self.assertEqual(result["post-category-ids.json"]["b"], ["fruit", "visit"])
        self.assertEqual(result["post-categories.json"]["c"]["categoryIds"], ["overig"])
        self.assertEqual(result["related-posts.json"]["b"], ["a", "c"])
        self.assertEqual(result["manifest.json"]["browseUnitCount"], 2)


if __name__ == "__main__":
    unittest.main()
