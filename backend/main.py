"""
FastAPI Backend Server for Parallax Flow
----------------------------------------
Exposes:
- GET  /api/jobs
- GET  /api/jobs/{job_id}
- POST /api/upload
- POST /api/jobs/{job_id}/transcript
- POST /api/jobs/{job_id}/override
- POST /api/jobs/{job_id}/confirm
- POST /api/spot-check/run
- GET  /api/jobs/{job_id}/export/{fmt}
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid

from backend.config import settings
from backend.services.vision_engine import evaluate_two_pass_ocr, LITERAL_OCR_PROMPT
from backend.services.question_segmenter import segment_transcript_into_questions
from backend.services.evaluator_engine import evaluate_question_against_rubric
from backend.services.evaluation_job_manager import (
    create_versioned_transcript_store,
    append_transcript_version,
    log_faculty_override,
)

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS_DB = {}


class TranscriptUpdatePayload(BaseModel):
    new_text: str
    changed_by: str
    reason_category: str
    reason: str
    question_code: Optional[str] = None


class FacultyOverridePayload(BaseModel):
    question_code: str
    step_no: int
    new_marks: float
    reason_category: str
    reason_text: str
    faculty_id: str


@app.get("/api/jobs")
def list_jobs():
    return {"jobs": list(JOBS_DB.values())}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in JOBS_DB:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS_DB[job_id]
