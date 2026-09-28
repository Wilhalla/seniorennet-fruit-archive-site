"""Archive browse units and provenance-only links between images and source text."""
from __future__ import annotations

import html
import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlsplit


REACTIONS = re.compile(r"\bReacties\s+(?=\d{2}-\d{2}-\d{4})")
NUMBERED_CAPTION = re.compile(r"^\s*(\d+)(?:\s*(?:&|en|[-–])\s*(\d+))?\s*[.)]?\s+(.+)$", re.I)


def author_text(post: dict[str, Any]) -> str:
    text = (post.get("cleanedText") or "").strip()
    return REACTIONS.split(text, maxsplit=1)[0].strip()


def build_units(posts: list[dict[str, Any]], series_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Use the UI's curated continuation groups as browse and labeling units."""
    by_id = {post["id"]: post for post in posts}
    series_by_post: dict[str, dict[str, Any]] = {}
    for series in series_records:
        ids = series["postIds"]
        if len(ids) < 2 or any(post_id not in by_id or post_id in series_by_post for post_id in ids):
            raise ValueError(f"invalid or overlapping series {series['id']}")
        for post_id in ids:
            series_by_post[post_id] = series
    units: list[dict[str, Any]] = []
    for post in posts:
        series = series_by_post.get(post["id"])
        if series and series["primaryPostId"] != post["id"]:
            continue
        members = [by_id[post_id] for post_id in series["postIds"]] if series else [post]
        part_limit = min(2500, max(350, 3600 // len(members)))
        parts = [{"id": member["id"], "slug": member["slug"], "title": member["title"],
                  "text": author_text(member)[:part_limit], "imageCount": member.get("imageCount", 0)}
                 for member in members]
        units.append({
            "id": series["id"] if series else f"post-{post['id']}",
            "primaryPostId": post["id"], "postIds": [member["id"] for member in members],
            "title": series.get("title") or post["title"] if series else post["title"],
            "parts": parts, "seriesSource": series.get("source") if series else None,
            "legacyTopicId": post.get("topicId"),
            "imageCount": sum(member.get("imageCount", 0) for member in members),
        })
    if sum(len(unit["postIds"]) for unit in units) != len(posts):
        raise ValueError("series grouping did not cover each post exactly once")
    return units


def unit_state(unit: dict[str, Any], observations: dict[str, list[str]] | None = None) -> dict[str, str]:
    parts = unit["parts"]
    text = "\n".join(f"Deel {index}: {part['title']} — {part['text']}" for index, part in enumerate(parts, 1))
    state = {"title": unit["title"], "post_text": text[:4500]}
    visible = [description for part in parts for description in (observations or {}).get(part["slug"], [])]
    if visible:
        state["reviewed_image_observations"] = " | ".join(visible[:5])[:700]
    return state


class _PostImageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self._text: list[str] | None = None
        self._tag: str | None = None
        self.images: list[dict[str, str | int]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag in {"p", "li", "figcaption"}:
            self._text = []
            self._tag = tag
        if tag == "img":
            self.images.append({"src": attributes.get("src") or "", "alt": attributes.get("alt") or "",
                                "title": attributes.get("title") or "", "block": len(self.blocks)})

    def handle_data(self, data: str) -> None:
        if self._text is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == self._tag and self._text is not None:
            self.blocks.append(re.sub(r"\s+", " ", "".join(self._text)).strip())
            self._text = None
            self._tag = None


def _image_path(src: str) -> str:
    return urlsplit(html.unescape(src)).path


def image_text_links(raw_post: dict[str, Any], image_src: str, image_index: int) -> list[dict[str, Any]]:
    """Link explicit text to an image; never claim linked text is visually verified."""
    parser = _PostImageParser()
    parser.feed(raw_post.get("html") or "")
    matches = [image for image in parser.images if _image_path(str(image["src"])) == _image_path(image_src)]
    if not matches:
        return []
    image = matches[0]
    links: list[dict[str, Any]] = []
    for field in ("alt", "title"):
        value = str(image[field]).strip()
        if value:
            links.append({"kind": f"image-{field}", "text": value, "sourcePostId": raw_post["id"]})
    ordinal = image_index + 1
    for block in parser.blocks:
        match = NUMBERED_CAPTION.match(block)
        if not match:
            continue
        first, last = int(match.group(1)), int(match.group(2) or match.group(1))
        if first <= ordinal <= last and last - first < 10:
            links.append({"kind": "numbered-caption", "text": match.group(3).strip(),
                          "sourcePostId": raw_post["id"], "imageOrdinal": ordinal})
    return links


def image_context(image: dict[str, Any], raw_post: dict[str, Any], series: dict[str, Any] | None) -> dict[str, Any]:
    index = image.get("imageIndex")
    if not isinstance(index, int):
        raise ValueError(f"image {image['id']} has no ordinal")
    content = re.sub(r"<[^>]+>", " ", raw_post.get("html") or "")
    content = re.sub(r"\s+", " ", html.unescape(content)).strip()
    return {
        "postId": raw_post["id"], "postSlug": raw_post["slug"], "postTitle": raw_post["title"],
        "postExcerpt": content[:500], "seriesId": series["id"] if series else None,
        "seriesTitle": series.get("title") if series else None,
        "seriesPostIds": series["postIds"] if series else [],
        "linkedText": image_text_links(raw_post, image["src"], index),
        "provenance": "archive-html-v1", "role": "linked-context-only",
    }
