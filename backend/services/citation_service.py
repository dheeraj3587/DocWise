"""Deterministic source labels and citation validation."""

from __future__ import annotations

import re
from typing import Any


_CITATION_PATTERN = re.compile(r"\[\[((?:S|W)\d+)\]\]")


def label_sources(chunks: list[dict[str, Any]], file_names: dict[str, str]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for index, chunk in enumerate(chunks, start=1):
        source = {
            **chunk,
            "label": f"S{index}",
            "file_name": file_names.get(str(chunk["file_id"]), "Document"),
            "rank": int(chunk.get("rank") or index),
        }
        sources.append(source)
    return sources


def format_sources(sources: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for source in sources:
        if source.get("source_type") == "web":
            blocks.append(
                f"[{source['label']}] {source.get('web_title') or source.get('web_domain') or 'Web source'} "
                f"({source.get('web_url') or 'web'})\n{source.get('text') or ''}"
            )
            continue

        location = ""
        if source.get("page_start") is not None:
            page_end = source.get("page_end") or source["page_start"]
            location = (
                f"page {source['page_start']}"
                if page_end == source["page_start"]
                else f"pages {source['page_start']}-{page_end}"
            )
        elif source.get("start_time") is not None:
            location = f"{float(source['start_time']):.1f}s-{float(source.get('end_time') or source['start_time']):.1f}s"

        blocks.append(
            f"[{source['label']}] {source['file_name']} ({location or 'document excerpt'})\n"
            f"{source['text']}"
        )
    return "\n\n".join(blocks)


def cited_labels(answer: str) -> list[str]:
    return list(dict.fromkeys(_CITATION_PATTERN.findall(answer)))


def validate_citations(answer: str, sources: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    labels = cited_labels(answer)
    valid = {str(source["label"]) for source in sources}
    unknown = [label for label in labels if label not in valid]
    if unknown:
        return False, unknown
    if sources and not labels and not _is_insufficient_answer(answer):
        return False, []
    return True, []


def strip_unknown_citations(answer: str, sources: list[dict[str, Any]]) -> str:
    """Remove citation markers that do not resolve to collected evidence."""
    valid = {str(source["label"]) for source in sources}
    return _CITATION_PATTERN.sub(
        lambda match: match.group(0) if match.group(1) in valid else "",
        answer,
    ).strip()


def _is_insufficient_answer(answer: str) -> bool:
    normalized = answer.lower()
    phrases = (
        "insufficient context",
        "not enough information",
        "does not contain",
        "cannot determine",
        "unable to determine",
    )
    return any(phrase in normalized for phrase in phrases)


def citation_payloads(answer: str, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    source_by_label = {str(source["label"]): source for source in sources}
    payloads = []
    for order, label in enumerate(cited_labels(answer), start=1):
        source = source_by_label.get(label)
        if source is None:
            continue
        source_type = str(source.get("source_type") or "document")
        payloads.append(
            {
                "sourceLabel": label,
                "sourceOrder": order,
                "sourceType": source_type,
                "chunkId": source.get("id") if source_type == "document" else None,
                "fileId": source.get("file_id"),
                "fileName": source.get("file_name"),
                "excerpt": source.get("text"),
                "pageStart": source.get("page_start"),
                "pageEnd": source.get("page_end"),
                "startTime": source.get("start_time"),
                "endTime": source.get("end_time"),
                "retrievalRank": int(source.get("rank") or order),
                "retrievalScore": float(source.get("score") or 0.0),
                "sourceRemoved": False,
                "webUrl": source.get("web_url"),
                "webTitle": source.get("web_title"),
                "webDomain": source.get("web_domain"),
                "retrievedAt": source.get("retrieved_at"),
            }
        )
    return payloads
