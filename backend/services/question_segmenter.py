"""
Priority 3 — Deterministic Question Segmenter
---------------------------------------------
Input: Full confirmed transcript (assembled from all pages)
Output: Dict mapping canonical question codes (Q.1, Q.2, ...) to text blocks.
Handles:
- Out-of-order answers
- Partial answers continued across pages
- Extra/duplicate attempts
- On failure: fires SEGMENTATION_FAILURE trigger back to rule-based queue —
  never silently drops an answer block.
"""

import re
from typing import Dict, Any, List

QUESTION_HEADER_REGEX = re.compile(
    r"(?:^|\n)\s*(?:\[?(?:Ans(?:wer)?\s*(?:to)?\s*)?(?:Q(?:uestion)?\.?\s*(?:No\.?)?\s*(\d+)\s*(?:\(([a-z0-9]+)\))?)\]?)\s*[:.\-—]?",
    re.IGNORECASE,
)


def normalize_question_code(q_num: str, subpart: str = "") -> str:
    return f"Q.{int(q_num)}"


def segment_transcript_into_questions(
    full_transcript: str, expected_codes: List[str]
) -> Dict[str, Any]:
    """
    Segments a full multi-page transcript into canonical question blocks.
    Never drops unmapped blocks silently: any text block that cannot be mapped
    to a rubric question code fires Trigger #5 (SEGMENTATION_FAILURE).
    """
    mapped_blocks: Dict[str, str] = {}
    unmapped_blocks: List[str] = []
    extra_attempts: List[str] = []
    out_of_order_detected = False

    if not full_transcript or not full_transcript.strip():
        return {
            "mapped_blocks": {},
            "unmapped_blocks": ["Empty transcript submitted"],
            "extra_attempts": [],
            "out_of_order_detected": False,
            "segmentation_failed": True,
            "trigger": {
                "code": "SEGMENTATION_FAILURE",
                "title": "Question Segmentation Failure",
                "detail": "Transcript contains no recognizable question headers.",
            },
        }

    # Remove page markers like "--- Page 2 ---" while preserving text continuity
    cleaned = re.sub(r"---\s*Page\s*\d+\s*---", "\n", full_transcript, flags=re.IGNORECASE)

    matches = list(QUESTION_HEADER_REGEX.finditer(cleaned))
    if not matches:
        # Entire transcript cannot be mapped to any question header
        unmapped_blocks.append(cleaned.strip())
        return {
            "mapped_blocks": {},
            "unmapped_blocks": unmapped_blocks,
            "extra_attempts": [],
            "out_of_order_detected": False,
            "segmentation_failed": True,
            "trigger": {
                "code": "SEGMENTATION_FAILURE",
                "title": "Question Segmentation Failure",
                "detail": "1 answer block could not be mapped to a valid question number.",
            },
        }

    # Check if there is orphan text before the first question header
    leading_text = cleaned[: matches[0].start()].strip()
    if leading_text and len(leading_text) > 25:
        unmapped_blocks.append(leading_text)

    seen_order: List[int] = []

    for idx, match in enumerate(matches):
        q_num = match.group(1)
        subpart = match.group(2) or ""
        canonical_code = normalize_question_code(q_num, subpart)
        q_int = int(q_num)

        if seen_order and q_int < seen_order[-1] and canonical_code not in mapped_blocks:
            out_of_order_detected = True
        seen_order.append(q_int)

        block_start = match.end()
        block_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
        block_text = cleaned[block_start:block_end].strip()

        if expected_codes and canonical_code not in expected_codes:
            unmapped_blocks.append(f"[{canonical_code}] {block_text}")
            extra_attempts.append(canonical_code)
            continue

        # Stitch partial answers across pages if the candidate continued the same question later
        if canonical_code in mapped_blocks:
            mapped_blocks[canonical_code] = (
                mapped_blocks[canonical_code] + "\n\n[Continued]\n" + block_text
            )
        else:
            mapped_blocks[canonical_code] = block_text

    segmentation_failed = len(unmapped_blocks) > 0
    trigger = None
    if segmentation_failed:
        trigger = {
            "code": "SEGMENTATION_FAILURE",
            "title": "Question Segmentation Failure",
            "detail": (
                f"{len(unmapped_blocks)} answer block(s) could not be mapped to a rubric question code "
                f"and require manual assignment."
            ),
        }

    return {
        "mapped_blocks": mapped_blocks,
        "unmapped_blocks": unmapped_blocks,
        "extra_attempts": extra_attempts,
        "out_of_order_detected": out_of_order_detected,
        "segmentation_failed": segmentation_failed,
        "trigger": trigger,
    }
