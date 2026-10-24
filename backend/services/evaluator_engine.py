"""
Priority 4 — Own-Figure Computation Engine & Step-Wise Rubric Evaluator
-----------------------------------------------------------------------
For computation questions marked own_figure: true in the rubric:
1. Extracts the student's computed figure from Step N in the confirmed transcript
2. Runs the model answer forward from their figure
3. Awards marks for correct method regardless of numerical result
All marks are strictly PROVISIONAL until faculty confirmation.
"""

import re
from typing import Dict, Any, List, Optional


def evaluate_own_figure_step(
    student_answer_text: str,
    step_spec: Dict[str, Any],
    prior_extracted_figures: Dict[str, float],
) -> Dict[str, Any]:
    """
    Evaluates a computation step with own-figure forward propagation.
    Example:
    - Q.1 Associate Company threshold: Step 2 extracts candidate's base share capital
      (e.g., candidate misread/wrote 180 instead of 200) and checks if candidate computed
      20% of their own base (0.20 * 180 = 36) or 15% (0.15 * 180 = 27).
    - Q.3 Bonus Share CRR / Capitalization: Step 2 checks if candidate's authorized/issued
      ratio or free reserve sum follows valid statutory method from their Step 1 figure.
    """
    formula_type = step_spec.get("own_figure_formula", "pct_threshold")
    max_marks = float(step_spec.get("maxMarks", 1.0))

    # Extract all numbers from the candidate's answer
    nums = [
        float(m.replace(",", ""))
        for m in re.findall(r"\d+(?:,\d{2,3})*(?:\.\d+)?", student_answer_text or "")
    ]

    if formula_type == "associate_voting_power":
        # Benchmark: 15% of 175 = 26.25 (< 20% threshold).
        # If candidate used a different base (e.g. 180) and computed 15% of 180 = 27 or 20% of 180 = 36:
        for base in nums:
            if 100 <= base <= 500 and base != 175:
                expected_20 = round(base * 0.20, 2)
                expected_15 = round(base * 0.15, 2)
                if any(abs(n - expected_20) <= 0.5 or abs(n - expected_15) <= 0.5 for n in nums):
                    return {
                        "own_figure_applied": True,
                        "awarded_marks": max_marks,
                        "extracted_base": base,
                        "computed_forward": expected_20,
                        "note": (
                            f"OWN-FIGURE CREDIT: Candidate used base figure ₹{base:g} Lakhs and "
                            f"correctly applied the statutory 20% threshold method (₹{expected_20:g} Lakhs)."
                        ),
                    }

    elif formula_type == "bonus_reserves_pool":
        # Benchmark: Free Reserves + Securities Premium + CRR (excluding Revaluation Reserve)
        # If candidate carried an earlier reserve figure and summed eligible reserves without revaluation reserve:
        lower = (student_answer_text or "").lower()
        excluded_reval = "revaluation" in lower and ("not" in lower or "cannot" in lower or "exclud" in lower)
        if excluded_reval and len(nums) >= 2:
            return {
                "own_figure_applied": True,
                "awarded_marks": max_marks,
                "extracted_base": nums[0],
                "computed_forward": sum(nums[:2]),
                "note": (
                    "OWN-FIGURE CREDIT: Candidate correctly excluded Revaluation Reserve and "
                    "applied Section 63(1) method to their own extracted reserve figures."
                ),
            }

    return {"own_figure_applied": False}


def evaluate_question_against_rubric(
    question_spec: Dict[str, Any], student_answer_text: str
) -> Dict[str, Any]:
    """
    Evaluates a segmented candidate answer against the ICAI step rubric,
    running own-figure propagation on computation steps and generating
    provisional step marks + gap observations.
    """
    prior_figures: Dict[str, float] = {}
    evaluated_steps: List[Dict[str, Any]] = []
    answer_lower = (student_answer_text or "").lower()

    for step in question_spec.get("steps", []):
        step_copy = dict(step)
        max_m = float(step_copy.get("maxMarks", 1.0))
        current_m = float(step_copy.get("marks", max_m))

        # Check if Own-Figure logic applies when standard numerical match deducted marks
        if step_copy.get("own_figure") and current_m < max_m:
            of_res = evaluate_own_figure_step(student_answer_text, step_copy, prior_figures)
            if of_res.get("own_figure_applied"):
                step_copy["marks"] = of_res["awarded_marks"]
                step_copy["own_figure_applied"] = True
                step_copy["own_figure_note"] = of_res["note"]
                step_copy["feedback"] = of_res["note"]

        step_copy["status"] = (
            "OWN_FIGURE_PASS"
            if step_copy.get("own_figure_applied")
            else ("PASS" if step_copy["marks"] >= max_m else ("PARTIAL" if step_copy["marks"] > 0 else "FAIL"))
        )
        evaluated_steps.append(step_copy)

    total_awarded = round(sum(float(s["marks"]) for s in evaluated_steps), 1)
    return {
        **question_spec,
        "studentText": student_answer_text or question_spec.get("studentText", ""),
        "awardedMarks": total_awarded,
        "provisional": True,
        "steps": evaluated_steps,
    }
