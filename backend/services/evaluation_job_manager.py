"""
Priority 5 — Append-Only Versioned Transcript Store, Faculty Override Logger & Spot-Check Engine
------------------------------------------------------------------------------------------------
- Each script gets an append-only versioned transcript record:
  { current_version: 'v1', versions: { 'v1': {...}, 'v2': {...} }, changes: [...] }
- v1 is never deleted or overwritten.
- Dispute creates v2+ with change record and reruns segmentation + own-figure evaluation.
- Faculty override is available on EVERY mark and requires:
  reason_category + reason_text + faculty_id + timestamp.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List


def create_versioned_transcript_store(
    initial_text: str,
    pass1_text: str,
    pass2_text: str,
    pass1_model: str = "gemini-3.8-flash",
    pass2_model: str = "claude-3-5-sonnet",
) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "current_version": "v1",
        "versions": {
            "v1": {
                "version": "v1",
                "text": initial_text,
                "pass1_text": pass1_text,
                "pass2_text": pass2_text,
                "pass1_model": pass1_model,
                "pass2_model": pass2_model,
                "created_at": now_iso,
                "created_by": "TWO_PASS_LITERAL_OCR",
                "immutable_original": True,
            }
        },
        "changes": [],
    }


def append_transcript_version(
    store: Dict[str, Any],
    new_text: str,
    changed_by: str,
    reason_category: str,
    reason_text: str,
) -> Dict[str, Any]:
    """
    Appends v2, v3, etc. without ever deleting or mutating v1.
    """
    existing_nums = [
        int(k.replace("v", "")) for k in store["versions"].keys() if k.startswith("v") and k[1:].isdigit()
    ]
    next_num = (max(existing_nums) if existing_nums else 1) + 1
    next_ver = f"v{next_num}"
    prev_ver = store["current_version"]
    now_iso = datetime.now(timezone.utc).isoformat()

    store["versions"][next_ver] = {
        "version": next_ver,
        "text": new_text,
        "based_on": prev_ver,
        "created_at": now_iso,
        "created_by": changed_by,
        "reason_category": reason_category,
        "reason": reason_text,
        "immutable_original": False,
    }
    store["current_version"] = next_ver
    store["changes"].append(
        {
            "from_version": prev_ver,
            "to_version": next_ver,
            "changed_by": changed_by,
            "reason_category": reason_category,
            "reason": reason_text,
            "timestamp": now_iso,
        }
    )
    return store


def log_faculty_override(
    job_record: Dict[str, Any],
    question_code: str,
    step_no: int,
    previous_marks: float,
    new_marks: float,
    reason_category: str,
    reason_text: str,
    faculty_id: str,
) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    entry = {
        "event_type": "FACULTY_MARK_OVERRIDE",
        "question_code": question_code,
        "step_no": step_no,
        "previous_marks": previous_marks,
        "new_marks": new_marks,
        "delta": round(new_marks - previous_marks, 2),
        "reason_category": reason_category,
        "reason_text": reason_text,
        "faculty_id": faculty_id,
        "timestamp": now_iso,
        "transcript_version": job_record.get("transcript_store", {}).get("current_version", "v1"),
    }
    job_record.setdefault("audit_log", []).insert(0, entry)
    return entry
