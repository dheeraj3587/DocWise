"""Deterministic source labels and citation validation."""

from __future__ import annotations

import re
from typing import Any


_CITATION_PATTERN = re.compile(r"\[\[(S\d+)\]\]")


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
        payloads.append(
            {
                "sourceLabel": label,
                "sourceOrder": order,
                "chunkId": source["id"],
                "fileId": source["file_id"],
                "fileName": source["file_name"],
                "excerpt": source["text"],
                "pageStart": source.get("page_start"),
                "pageEnd": source.get("page_end"),
                "startTime": source.get("start_time"),
                "endTime": source.get("end_time"),
                "retrievalRank": source["rank"],
                "retrievalScore": float(source.get("score") or 0.0),
                "sourceRemoved": False,
            }
        )
    return payloads
