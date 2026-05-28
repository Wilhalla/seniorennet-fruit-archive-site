#!/usr/bin/env python3
"""Generate static species/cultivar evidence tags for archive images.

This pipeline is intentionally evidence-first. Exact cultivars are not trusted
from image similarity alone; high confidence requires text/OCR evidence from the
post, caption, filename, or an image label.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None

BROAD_VISUAL_TAGS: dict[str, dict[str, str]] = {
    "appels": {"label": "appel", "type": "fruit_kind"},
    "peren": {"label": "peer", "type": "fruit_kind"},
    "pruimen": {"label": "pruim", "type": "fruit_kind"},
    "bessen": {"label": "bes / kleinfruit", "type": "fruit_kind"},
    "bloesem": {"label": "bloesem", "type": "plant_stage"},
    "tuin": {"label": "tuin / boomgaard", "type": "place_or_habitat"},
    "dieren": {"label": "dier / insect", "type": "animal_broad"},
}

# Seed list: deliberately restricted to species/cultivars likely in this archive.
# More candidates can be added in species-candidates.yml without changing code.
SEED_CANDIDATES: list[dict[str, Any]] = [
    # Apple cultivars / groups
    {"label": "Sterappel", "type": "apple_cultivar", "aliases": ["sterappel", "ster appelen"]},
    {"label": "Bellefleur", "type": "apple_cultivar", "aliases": ["bellefleur", "oude bellefleur"]},
    {"label": "Reinette", "type": "apple_cultivar_group", "aliases": ["reinette", "reinet", "reinetten"]},
    {"label": "Reinette Dubois", "type": "apple_cultivar", "aliases": ["reinette dubois"]},
    {"label": "Notarisappel", "type": "apple_cultivar", "aliases": ["notarisappel"]},
    {"label": "Jacques Lebel", "type": "apple_cultivar", "aliases": ["jacques lebel"]},
    {"label": "Cox Orange", "type": "apple_cultivar", "aliases": ["cox orange", "cox's orange", "cox"]},
    {"label": "Pinova", "type": "apple_cultivar", "aliases": ["pinova"]},
    {"label": "Mutsu", "type": "apple_cultivar", "aliases": ["mutsu"]},
    {"label": "Schone van Boskoop", "type": "apple_cultivar", "aliases": ["schone van boskoop", "boskoop", "goudreinette"]},
    {"label": "Elstar", "type": "apple_cultivar", "aliases": ["elstar"]},
    {"label": "Jonagold", "type": "apple_cultivar", "aliases": ["jonagold"]},
    {"label": "Rubinola", "type": "apple_cultivar", "aliases": ["rubinola"]},
    {"label": "Otava", "type": "apple_cultivar", "aliases": ["otava"]},
    {"label": "Topaz", "type": "apple_cultivar", "aliases": ["topaz"]},
    {"label": "Santana", "type": "apple_cultivar", "aliases": ["santana"]},
    {"label": "Ecolette", "type": "apple_cultivar", "aliases": ["ecolette"]},
    {"label": "Karmijn de Sonnaville", "type": "apple_cultivar", "aliases": ["karmijn de sonnaville", "karmijn de sonneville"]},
    {"label": "Tydeman's Late Orange", "type": "apple_cultivar", "aliases": ["tydeman's late orange", "tydemans late orange"]},
    {"label": "Discovery", "type": "apple_cultivar", "aliases": ["discovery"]},
    {"label": "James Grieve", "type": "apple_cultivar", "aliases": ["james grieve"]},
    {"label": "Alkmene", "type": "apple_cultivar", "aliases": ["alkmene"]},
    {"label": "Transparente Blanche", "type": "apple_cultivar", "aliases": ["transparente blanche"]},
    # Pears
    {"label": "Conference", "type": "pear_cultivar", "aliases": ["conference"]},
    {"label": "Beurré Hardy", "type": "pear_cultivar", "aliases": ["beurré hardy", "beurre hardy"]},
    {"label": "Doyenné du Comice", "type": "pear_cultivar", "aliases": ["doyenné du comice", "doyenne du comice", "comice"]},
    {"label": "Doyenné d'Hiver", "type": "pear_cultivar", "aliases": ["doyenné d'hiver", "doyenne d'hiver"]},
    {"label": "Saint Remy", "type": "pear_cultivar", "aliases": ["saint remy", "saint-rémy", "st remy"]},
    {"label": "Catillac", "type": "pear_cultivar", "aliases": ["catillac"]},
    {"label": "Beth", "type": "pear_cultivar", "aliases": ["beth"]},
    {"label": "Comtesse de Paris", "type": "pear_cultivar", "aliases": ["comtesse de paris"]},
    {"label": "Mahieupeer", "type": "pear_cultivar", "aliases": ["mahieupeer", "mahieu peer"]},
    # Plums / stone fruit
    {"label": "Reine Claude", "type": "plum_cultivar_group", "aliases": ["reine claude", "reine-claude", "reine-claudes"]},
    {"label": "Opal", "type": "plum_cultivar", "aliases": ["opal"]},
    {"label": "Victoria", "type": "plum_cultivar", "aliases": ["victoria"]},
    {"label": "Anna Späth", "type": "plum_cultivar", "aliases": ["anna späth", "anna spath"]},
    {"label": "Prune de Prince", "type": "plum_cultivar", "aliases": ["prune de prince"]},
    {"label": "Excalibur", "type": "plum_cultivar", "aliases": ["excalibur"]},
    {"label": "Reeve's Seedling", "type": "plum_cultivar", "aliases": ["reeve's seedling", "reeves seedling"]},
    {"label": "Czar", "type": "plum_cultivar", "aliases": ["czar"]},
    {"label": "Mirabelle", "type": "plum_cultivar_group", "aliases": ["mirabelle", "mirabellen"]},
    # Berries / small fruit
    {"label": "Taybes", "type": "berry_cultivar", "aliases": ["taybes", "tayberry", "taybessen"]},
    {"label": "Loganbes", "type": "berry_cultivar", "aliases": ["loganbes", "loganberry"]},
    {"label": "Japanse wijnbes", "type": "berry_species", "aliases": ["japanse wijnbes", "wijnbes", "rubus phoenicolasius"]},
    {"label": "Herfstframboos", "type": "berry_group", "aliases": ["herfstframboos", "herfstframbozen"]},
    {"label": "Fallgold", "type": "raspberry_cultivar", "aliases": ["fallgold", "fall gold"]},
    {"label": "Autumn First", "type": "raspberry_cultivar", "aliases": ["autumn first", "autumn bliss"]},
    {"label": "Zwarte bes", "type": "berry_species", "aliases": ["zwarte bes", "zwarte bessen", "ribes nigrum"]},
    {"label": "Rode bes", "type": "berry_species", "aliases": ["rode bes", "rode bessen", "ribes rubrum"]},
    {"label": "Kruisbes", "type": "berry_species", "aliases": ["kruisbes", "kruisbessen"]},
    {"label": "Braam", "type": "berry_species", "aliases": ["braam", "bramen", "rubus fruticosus"]},
    # Species / organisms
    {"label": "Kornoelje", "type": "plant_species", "aliases": ["kornoelje", "kornoeljebes", "cornus mas"]},
    {"label": "Kerspruim / myrobolaan", "type": "plant_species", "aliases": ["kerspruim", "myrobolaan", "prunus cerasifera"]},
    {"label": "Kweepeer", "type": "plant_species", "aliases": ["kweepeer", "kweeperen", "cydonia oblonga"]},
    {"label": "Vijg", "type": "plant_species", "aliases": ["vijg", "vijgen", "ficus carica", "brown turkey"]},
    {"label": "Kiwi", "type": "plant_species", "aliases": ["kiwi", "actinidia"]},
    {"label": "Japanse kwee", "type": "plant_species", "aliases": ["japanse kwee", "chaenomeles japonica"]},
    {"label": "Bij", "type": "animal_species_group", "aliases": ["bijen", "wilde bij", "wilde bijen", "honingbij", "honingbijen"]},
    {"label": "Vlinder", "type": "animal_species_group", "aliases": ["vlinder", "vlinders", "citroenvlinder", "kleine vos", "oranjetipje"]},
    {"label": "Koekoek", "type": "bird_species", "aliases": ["koekoek"]},
    {"label": "Merel", "type": "bird_species", "aliases": ["merel", "merels"]},
    {"label": "Steenuil", "type": "bird_species", "aliases": ["steenuil", "steenuilen"]},
    {"label": "Kip", "type": "animal_species_group", "aliases": ["kip", "kippen"]},
    {"label": "Rups", "type": "animal_species_group", "aliases": ["rups", "rupsen", "spinselrups"]},
    {"label": "Wesp", "type": "animal_species_group", "aliases": ["wesp", "wespen", "pruimenzaagwesp"]},
]

LATIN_RE = re.compile(r"\b([A-Z][a-z]{2,}\s+[a-z][a-z-]{2,})\b")
SPAM_RE = re.compile(r"\b(outlet|shoes|nike|jordan|kors|coach|sunglasses|replica|cheap|wholesale)\b", re.I)


@dataclass
class Candidate:
    id: str
    label: str
    type: str
    aliases: list[str]
    scientificName: str | None = None
    source: str = "seed"
    prompt: str | None = None
    pattern: Any = field(default=None, repr=False)


@dataclass
class EvidenceTag:
    label: str
    type: str
    confidence: str
    sources: set[str] = field(default_factory=set)
    evidence: list[dict[str, str]] = field(default_factory=list)
    candidateId: str | None = None

    def add(self, source: str, field_name: str, snippet: str) -> None:
        self.sources.add(source)
        clean = " ".join(snippet.split())[:220]
        if clean and not any(item["source"] == source and item["field"] == field_name and item["snippet"] == clean for item in self.evidence):
            self.evidence.append({"source": source, "field": field_name, "snippet": clean})


def slugify(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9à-ÿ]+", "-", value).strip("-")
    return value or "tag"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_candidates(items: list[dict[str, Any]], source: str = "seed") -> list[Candidate]:
    candidates = []
    seen = set()
    for item in items:
        label = str(item.get("label", "")).strip()
        if not label:
            continue
        candidate_id = str(item.get("id") or slugify(label))
        if candidate_id in seen:
            continue
        seen.add(candidate_id)
        provided_aliases = [str(alias) for alias in item.get("aliases", [])]
        aliases = provided_aliases or [label]
        candidates.append(Candidate(
            id=candidate_id,
            label=label,
            type=str(item.get("type") or "species"),
            aliases=sorted({alias.lower() for alias in aliases if alias}),
            scientificName=item.get("scientificName"),
            source=str(item.get("source") or source),
            prompt=item.get("prompt"),
        ))
    return candidates


def load_candidate_file(path: Path | None) -> list[Candidate]:
    if not path or not path.exists() or yaml is None:
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    items = data.get("candidates", data) if isinstance(data, dict) else data
    return normalize_candidates(items if isinstance(items, list) else [], source="manual")


def auto_latin_candidates(posts: list[dict[str, Any]], min_count: int) -> list[Candidate]:
    counts: Counter[str] = Counter()
    for post in posts:
        text = " ".join(str(post.get(key) or "") for key in ("title", "excerpt", "cleanedText"))[:8000]
        if SPAM_RE.search(text):
            continue
        for match in LATIN_RE.findall(text):
            if match.split()[0] in {"Daniel", "Seniorennet", "Villeneuve"}:
                continue
            counts[match] += 1
    items = [
        {"label": label, "type": "latin_name", "aliases": [label], "scientificName": label, "source": "auto_latin"}
        for label, count in counts.items()
        if count >= min_count
    ]
    return normalize_candidates(items, source="auto_latin")


def prepare_patterns(candidates: list[Candidate]) -> None:
    for candidate in candidates:
        aliases = [alias for alias in sorted(candidate.aliases, key=len, reverse=True) if len(alias) >= 3]
        if not aliases:
            continue
        candidate.pattern = re.compile(r"(?<![\wà-ÿ])(" + "|".join(re.escape(alias) for alias in aliases) + r")(?![\wà-ÿ])", re.I)


def find_alias(text: str, candidate: Candidate) -> tuple[str, str] | None:
    if candidate.pattern is None:
        return None
    match = candidate.pattern.search(text)
    if match:
        start = max(0, match.start() - 70)
        end = min(len(text), match.end() + 90)
        return match.group(1), text[start:end]
    return None


def confidence_for(sources: set[str], candidate_type: str) -> str:
    if "ocr" in sources:
        return "high"
    if "title" in sources or "caption" in sources:
        return "high"
    if "excerpt" in sources or "post_text" in sources:
        return "high" if "cultivar" in candidate_type or "species" in candidate_type else "medium"
    if "visual_context" in sources:
        return "medium"
    if "image_similarity" in sources:
        return "low"
    return "medium"


def serialize_tags(tags: dict[str, EvidenceTag]) -> list[dict[str, Any]]:
    result = []
    for tag in tags.values():
        tag.confidence = confidence_for(tag.sources, tag.type)
        result.append({
            "label": tag.label,
            "type": tag.type,
            "confidence": tag.confidence,
            "sources": sorted(tag.sources),
            "evidence": tag.evidence[:4],
            "candidateId": tag.candidateId or slugify(tag.label),
        })
    confidence_rank = {"high": 0, "medium": 1, "low": 2}
    result.sort(key=lambda item: (confidence_rank.get(item["confidence"], 9), item["type"], item["label"]))
    return result[:12]


def tag_post(post: dict[str, Any], candidates: list[Candidate]) -> list[dict[str, Any]]:
    tags: dict[str, EvidenceTag] = {}
    fields = [
        ("title", str(post.get("title") or "")),
        ("excerpt", str(post.get("excerpt") or "")),
        ("post_text", str(post.get("cleanedText") or "")[:7000]),
    ]
    for candidate in candidates:
        for field_name, text in fields:
            if not text or SPAM_RE.search(text):
                continue
            found = find_alias(text, candidate)
            if not found:
                continue
            _, snippet = found
            tag = tags.setdefault(candidate.id, EvidenceTag(candidate.label, candidate.type, "medium", candidateId=candidate.id))
            source = "post_text" if field_name == "post_text" else field_name
            tag.add(source, field_name, snippet)
    return serialize_tags(tags)


def tag_image(image: dict[str, Any], post_tags: list[dict[str, Any]], candidates: list[Candidate]) -> list[dict[str, Any]]:
    tags: dict[str, EvidenceTag] = {}

    for post_tag in post_tags:
        tag = EvidenceTag(
            label=post_tag["label"],
            type=post_tag["type"],
            confidence=post_tag["confidence"],
            sources=set(post_tag.get("sources", [])),
            evidence=list(post_tag.get("evidence", [])),
            candidateId=post_tag.get("candidateId"),
        )
        tags[tag.candidateId or slugify(tag.label)] = tag

    for visual_tag in image.get("visualTags", []):
        broad = BROAD_VISUAL_TAGS.get(visual_tag)
        if not broad:
            continue
        key = slugify(broad["label"])
        tag = tags.setdefault(key, EvidenceTag(broad["label"], broad["type"], "medium", candidateId=key))
        tag.add("visual_context", "visualTags", visual_tag)

    # Image-local evidence: caption and filename. These are cheap and can differ
    # per image, unlike post text.
    fields = [("caption", str(image.get("caption") or "")), ("filename", str(image.get("src") or ""))]
    for candidate in candidates:
        for field_name, text in fields:
            if not text or SPAM_RE.search(text):
                continue
            found = find_alias(text, candidate)
            if not found:
                continue
            _, snippet = found
            tag = tags.setdefault(candidate.id, EvidenceTag(candidate.label, candidate.type, "medium", candidateId=candidate.id))
            tag.add(field_name, field_name, snippet)

    return serialize_tags(tags)


def build_groups(image_tags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    meta: dict[str, dict[str, str]] = {}
    for item in image_tags:
        for tag in item["tags"]:
            cid = tag["candidateId"]
            counts[cid][tag["confidence"]] += 1
            meta[cid] = {"id": cid, "label": tag["label"], "type": tag["type"]}
    groups = []
    for cid, counter in counts.items():
        total = sum(counter.values())
        groups.append({**meta[cid], "count": total, "confidenceCounts": dict(counter)})
    groups.sort(key=lambda item: (-item["count"], item["label"]))
    return groups


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate evidence-based species/cultivar tags")
    parser.add_argument("--posts", type=Path, default=Path("src/data/generated/posts-index.json"))
    parser.add_argument("--images", type=Path, default=Path("src/data/generated/image-index.json"))
    parser.add_argument("--candidates", type=Path, default=Path("species-candidates.yml"))
    parser.add_argument("--output-public", type=Path, default=Path("public/generated"))
    parser.add_argument("--output-data", type=Path, default=Path("src/data/generated"))
    parser.add_argument("--auto-latin-min-count", type=int, default=999999, help="Disabled by default; lower to auto-add recurring Latin names from text.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    posts = load_json(args.posts)
    images = load_json(args.images)
    posts_by_id = {str(post.get("id")): post for post in posts}
    candidates = normalize_candidates(SEED_CANDIDATES) + load_candidate_file(args.candidates) + auto_latin_candidates(posts, args.auto_latin_min_count)
    # De-duplicate after merging seed/manual/auto.
    unique: dict[str, Candidate] = {}
    for candidate in candidates:
        unique.setdefault(candidate.id, candidate)
    candidates = list(unique.values())
    prepare_patterns(candidates)

    post_tag_cache = {post_id: tag_post(post, candidates) for post_id, post in posts_by_id.items()}

    image_tags = []
    for image in images:
        post_tags = post_tag_cache.get(str(image.get("postId")), [])
        tags = tag_image(image, post_tags, candidates)
        image_tags.append({"imageId": image["id"], "postId": image.get("postId"), "postSlug": image.get("postSlug"), "tags": tags})

    groups = build_groups(image_tags)
    manifest = {
        "generatedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "imageCount": len(images),
        "taggedImageCount": sum(1 for item in image_tags if item["tags"]),
        "candidateCount": len(candidates),
        "method": "text-caption-filename-visual-context-evidence-resolver",
        "contractVersion": 1,
    }
    outputs = {
        "species-tags.json": image_tags,
        "species-groups.json": groups,
        "species-manifest.json": manifest,
    }
    for output_dir in (args.output_public, args.output_data):
        for filename, payload in outputs.items():
            write_json(output_dir / filename, payload)
    print(f"[species-atlas] wrote {len(groups)} species/cultivar groups for {len(images)} images")


if __name__ == "__main__":
    main()
