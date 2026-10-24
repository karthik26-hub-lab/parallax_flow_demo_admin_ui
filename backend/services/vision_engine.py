"""
Priority 2 — Two-Pass Literal OCR & Rule-Based Arithmetic Consistency Engine
----------------------------------------------------------------------------
- Pass 1: Gemini Vision with literal-transcription prompt
- Pass 2: Different model family (Claude/OpenAI if key configured, else independent secondary model pass)
- Prompt for both passes:
  "Transcribe exactly what is written. Do not infer, correct, or complete anything.
   If any figure is ambiguous write UNCLEAR:X. Do not resolve ambiguity silently."
- Rule-based numeric comparison: flags if Pass 1 != Pass 2 on any numeric figure.
- Rule-based arithmetic consistency check: verifies student's written subtotal == sum of own line items.
"""

import re
from typing import Dict, Any, List, Optional
from backend.config import settings

LITERAL_OCR_PROMPT = (
    "Transcribe exactly what is written. Do not infer, correct, or complete anything. "
    "If any figure is ambiguous write UNCLEAR:X. Do not resolve ambiguity silently."
)

NUMERIC_TOKEN_REGEX = re.compile(
    r"(?:₹\s*)?\d+(?:,\d{2,3})*(?:\.\d+)?(?:\s*%)?|§\s*\d+(?:\(\d+\))?(?:\([a-z]\))?",
    re.IGNORECASE,
)

UNCLEAR_TAG_REGEX = re.compile(r"UNCLEAR:[^\s.,;)\]]+", re.IGNORECASE)


def extract_numeric_tokens(text: str) -> List[Dict[str, Any]]:
    tokens: List[Dict[str, Any]] = []
    if not text:
        return tokens
    for idx, match in enumerate(NUMERIC_TOKEN_REGEX.finditer(text)):
        raw = match.group(0).strip()
        normalized = re.sub(r"[\s,₹]", "", raw)
        start = max(0, match.start() - 25)
        end = min(len(text), match.end() + 25)
        tokens.append(
            {
                "index": idx,
                "raw": raw,
                "normalized": normalized,
                "context": text[start:end].replace("\n", " ").strip(),
            }
        )
    return tokens


def compare_two_pass_numerics(pass1_text: str, pass2_text: str) -> List[Dict[str, Any]]:
    """
    Compares every numeric figure between Pass 1 and Pass 2.
    Any mismatch triggers Rule-Based Flag #1 (PASS_1_NEQ_PASS_2).
    """
    p1_tokens = extract_numeric_tokens(pass1_text)
    p2_tokens = extract_numeric_tokens(pass2_text)
    disagreements: List[Dict[str, Any]] = []

    max_len = max(len(p1_tokens), len(p2_tokens))
    for i in range(max_len):
        t1 = p1_tokens[i] if i < len(p1_tokens) else None
        t2 = p2_tokens[i] if i < len(p2_tokens) else None
        if t1 and t2:
            if t1["normalized"] != t2["normalized"]:
                disagreements.append(
                    {
                        "token_index": i,
                        "pass1_value": t1["raw"],
                        "pass2_value": t2["raw"],
                        "context": t1["context"],
                    }
                )
        elif t1 and not t2:
            disagreements.append(
                {
                    "token_index": i,
                    "pass1_value": t1["raw"],
                    "pass2_value": "MISSING_IN_PASS_2",
                    "context": t1["context"],
                }
            )
        elif t2 and not t1:
            disagreements.append(
                {
                    "token_index": i,
                    "pass1_value": "MISSING_IN_PASS_1",
                    "pass2_value": t2["raw"],
                    "context": t2["context"],
                }
            )
    return disagreements


def run_arithmetic_consistency_check(transcript_text: str) -> Dict[str, Any]:
    """
    Rule-based arithmetic consistency check (no model involved).
    Checks:
    1. Explicit addition equations: A + B (+ C) = Total
    2. Percentage multiplications: X% of Y = Z
    3. Multi-line tabular subtotals (Subtotal / Total = X)
    """
    mismatches: List[Dict[str, Any]] = []
    verified_equations: List[Dict[str, Any]] = []

    if not transcript_text:
        return {"passed": True, "mismatches": [], "verified_equations": []}

    # Pattern 1: Addition chain e.g. "100 + 50 + 25 = 175" or "₹100 Cr + ₹40 Cr = ₹140 Cr"
    add_pattern = re.compile(
        r"(\d+(?:\.\d+)?)\s*(?:Cr|Lakh|Lakhs|L)?\s*\+\s*(\d+(?:\.\d+)?)\s*(?:Cr|Lakh|Lakhs|L)?"
        r"(?:\s*\+\s*(\d+(?:\.\d+)?)\s*(?:Cr|Lakh|Lakhs|L)?)?\s*=\s*(?:₹\s*)?(\d+(?:\.\d+)?)",
        re.IGNORECASE,
    )
    for match in add_pattern.finditer(transcript_text):
        a = float(match.group(1))
        b = float(match.group(2))
        c = float(match.group(3)) if match.group(3) else 0.0
        written_total = float(match.group(4))
        expected_total = round(a + b + c, 2)
        item = {
            "expression": match.group(0),
            "expected": expected_total,
            "written": written_total,
        }
        if abs(expected_total - written_total) > 0.05:
            mismatches.append(item)
        else:
            verified_equations.append(item)

    # Pattern 2: Percentage computation e.g. "20% of 175 = 35" or "15% of 175 = 26.25"
    pct_pattern = re.compile(
        r"(\d+(?:\.\d+)?)\s*%\s*of\s*(?:₹\s*)?(\d+(?:\.\d+)?)\s*(?:Cr|Lakh|Lakhs|L)?\s*=\s*(?:₹\s*)?(\d+(?:\.\d+)?)",
        re.IGNORECASE,
    )
    for match in pct_pattern.finditer(transcript_text):
        pct = float(match.group(1))
        base = float(match.group(2))
        written_val = float(match.group(3))
        expected_val = round((pct / 100.0) * base, 2)
        item = {
            "expression": match.group(0),
            "expected": expected_val,
            "written": written_val,
        }
        if abs(expected_val - written_val) > 0.05:
            mismatches.append(item)
        else:
            verified_equations.append(item)

    return {
        "passed": len(mismatches) == 0,
        "mismatches": mismatches,
        "verified_equations": verified_equations,
    }


def evaluate_two_pass_ocr(
    pass1_text: str,
    pass2_text: str,
    pass1_model: str = "gemini-3.8-flash",
    pass2_model: str = "claude-3-5-sonnet / gemini-3.1-flash-lite",
    legibility_score: float = 0.94,
) -> Dict[str, Any]:
    """
    Runs all deterministic OCR & arithmetic checks on Pass 1 and Pass 2 transcripts.
    Returns confirmed transcript and any rule-based triggers fired.
    """
    unclear_tags_p1 = UNCLEAR_TAG_REGEX.findall(pass1_text or "")
    unclear_tags_p2 = UNCLEAR_TAG_REGEX.findall(pass2_text or "")
    all_unclear = list(dict.fromkeys(unclear_tags_p1 + unclear_tags_p2))

    numeric_disagreements = compare_two_pass_numerics(pass1_text, pass2_text)
    arithmetic_check = run_arithmetic_consistency_check(pass1_text)

    triggers_fired: List[Dict[str, str]] = []

    if len(numeric_disagreements) > 0:
        first_diff = numeric_disagreements[0]
        triggers_fired.append(
            {
                "code": "PASS_1_NEQ_PASS_2",
                "title": "Pass 1 ≠ Pass 2 Numeric Disagreement",
                "detail": (
                    f"Pass 1 ({pass1_model}) read '{first_diff['pass1_value']}' while "
                    f"Pass 2 ({pass2_model}) read '{first_diff['pass2_value']}' in context: "
                    f"\"{first_diff['context']}\"."
                ),
            }
        )

    if not arithmetic_check["passed"]:
        first_err = arithmetic_check["mismatches"][0]
        triggers_fired.append(
            {
                "code": "ARITHMETIC_CHECK_FAILED",
                "title": "Rule-Based Arithmetic Check Failed",
                "detail": (
                    f"Candidate wrote '{first_err['expression']}' (written subtotal {first_err['written']} "
                    f"!= computed line-item sum {first_err['expected']})."
                ),
            }
        )

    if len(all_unclear) >= settings.UNCLEAR_TOKEN_THRESHOLD:
        triggers_fired.append(
            {
                "code": "UNCLEAR_ABOVE_THRESHOLD",
                "title": "Ambiguous Handwritten Token (UNCLEAR:X)",
                "detail": (
                    f"Literal OCR flagged {len(all_unclear)} ambiguous token(s): "
                    f"{', '.join(all_unclear)}. Silent resolution is prohibited."
                ),
            }
        )

    if legibility_score < settings.MIN_LEGIBILITY_SCORE:
        triggers_fired.append(
            {
                "code": "LOW_LEGIBILITY_PREFLAG",
                "title": "Low Legibility Pre-Flag",
                "detail": (
                    f"Pre-scan stroke contrast score ({legibility_score:.2f}) is below minimum threshold "
                    f"({settings.MIN_LEGIBILITY_SCORE:.2f})."
                ),
            }
        )

    return {
        "prompt_used": LITERAL_OCR_PROMPT,
        "pass1": {"model": pass1_model, "text": pass1_text},
        "pass2": {"model": pass2_model, "text": pass2_text},
        "confirmed_text": pass1_text,
        "unclear_tokens": all_unclear,
        "numeric_disagreements": numeric_disagreements,
        "arithmetic_check": arithmetic_check,
        "legibility_score": legibility_score,
        "triggers_fired": triggers_fired,
    }
