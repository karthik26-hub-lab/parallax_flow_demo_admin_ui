# Parallax Flow — Backend Evaluation Pipeline, Mobile App Ingestion API & Academy Dashboard Plan

This plan architects the backend ingestion and 5-stage evaluation pipeline that receives student answer scripts from the external **Student Mobile App**, evaluates them against **Custom or AI-Generated ICAI Step Rubrics**, streams live evaluation queues to the **Academy Dashboard**, and holds student marks until the Academy Admin confirms flagged scripts and publishes the examination results.

## User Review & Critical Decisions

> [!IMPORTANT]
> The architecture below incorporates your confirmed decisions from our design review:

- **Confirmed Decision 1 — Separate Student Mobile App API + Academy Dashboard**: Students submit scripts from a dedicated external Mobile App via REST API endpoints (`/api/mobile/*`), while this web application serves exclusively as the **Academy Admin & Faculty Dashboard** where incoming mobile submissions land in real time (alongside manual faculty script upload and an API endpoint tester/docs modal for connecting the mobile app).
- **Confirmed Decision 2 — Hybrid Custom + AI-Assisted Rubric Configuration**: When creating an examination, the Admin can either enter/paste custom questions and step rubrics or click **Generate ICAI Rubric with AI** (`POST /api/exams/generate-rubric`) to auto-build a structured step-by-step marking scheme (`Provision`, `Computation / Own-Figure`, `Conclusion`, `Presentation`) before saving the exam.
- **Confirmed Decision 3 — Hold Results Until Published / Confirmed**: Evaluated marks and question breakdowns are held (`status: "UNDER_FACULTY_REVIEW"`) on the student mobile endpoint until the Admin clears/confirms flagged scripts and explicitly publishes the examination (`POST /api/exams/:id/publish`).

---

## 1. Overview & Core Concept

- **What It Does**: Provides a complete backend evaluation engine and Academy Operations Dashboard. The backend exposes clean JSON/multipart endpoints for the external Student Mobile App to fetch active exams, upload handwritten script scans (PDF/images), and poll publication status, while giving Academy Faculty a real-time dashboard to configure rubrics, audit flagged scripts, and publish results.
- **Target Audience / Persona**: CA Coaching Academy Administrators and Faculty Examiners managing mock test series, reviewing flagged OCR/arithmetic exceptions, and releasing verified provisional marksheets to students' mobile apps.
- **Key Value**: Eliminates manual grading bottlenecks while guaranteeing zero silent OCR errors (`Pass 1 vs Pass 2` literal cross-check + deterministic arithmetic verification) and holding all scores behind a strict Faculty Release Gate.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Create Exam & Configure Rubric (Custom + AI-Assisted)**: Admin clicks `+ Create Examination`, enters Exam Code, Title, Subject, and Max Marks, and either enters custom question rubrics or clicks **Generate ICAI Step Rubric with AI** to populate structured questions and step marks, then saves the exam.
  2. **Mobile App Script Ingestion & Live Dashboard Sync**: When a student uploads their script via `POST /api/mobile/submissions` (or when faculty uploads a script via `+ Upload Script`), the 5-stage pipeline runs automatically and updates the Dashboard's **Students Appeared**, **Scripts Evaluated**, and **Reviews Pending** counters.
  3. **Faculty Exception Review & Publishing Gate**: Flagged scripts appear under **Pending Reviews**. Faculty inspect the Two-Pass OCR diff, edit transcripts (`v1` &rarr; `v2`), or override step marks, then click **Confirm Script** and **Publish Exam Results** to release marks to the Student Mobile App.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clean `parallaxflow.in` institutional SaaS precision with a floating rounded glass pill navigation bar and sliding Light/Dark theme switch (icon-only toggle).
  - *Color Palette & Mood*: Light mode uses `#f5f9ff` ice-blue paper canvas, `#fbfdff` cards, `#dce7f5` hairlines, `#0b0b0f` ink, and `#315bce` cobalt accents; Dark mode (`html.dark`) uses `#111722` deep navy canvas, `#182131` elevated slate cards, and `#8eafff` accents.
  - *Typography & Hierarchy*: `Plus Jakarta Sans` / `Inter` for clean UI hierarchy paired with `JetBrains Mono` (`tabular-nums`) for all roll numbers, exam codes, step marks, and API payloads.
  - *Component Styling & Layout*: Full 1360px container grid, 4-card KPI row, two-zone 50/50 split Grading Workbench (60% interactive transcript/scan stage, 40% step-marking rubric & override deck), and explicit status badges (`Pending Review`, `Provisional Ready`, `Published to Mobile App`).
- **Interactive Feedback & Motion**: Live status transitions when publishing exams, spinner state during AI rubric generation and two-pass OCR evaluation, and toast confirmations on every state mutation.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Dedicated Mobile API Namespace (`/api/mobile/*`) vs. Admin Namespace (`/api/*`)**
  - *Chosen Approach*: Separate endpoints for the Student Mobile App (`GET /api/mobile/exams`, `POST /api/mobile/submissions`, `GET /api/mobile/results/:rollNo`, `POST /api/mobile/disputes`) alongside the Academy Admin endpoints.
  - *Why*: Enforces the **Result Release Gate** cleanly—the mobile app endpoint automatically redacts scores and step feedback (`status: "HELD_PENDING_PUBLICATION"`) until `exam.published === true` and `job.flagged === false`, while the Admin Dashboard always sees the full internal evaluation data.
- **Decision 2 — Hybrid Custom + AI Rubric Builder**
  - *Chosen Approach*: Store a structured `questionsRubric` array on every Examination record, populated either by the Admin's custom input or generated via `gemini-3.8-flash` structured JSON output, and pass that exact rubric into Stage 4 of the evaluation pipeline.
  - *Why*: Ensures every student script uploaded for `EXAM-01` is graded against the exact same question prompts, statutory section references, and step mark allocations defined by the academy.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   EXTERNAL STUDENT MOBILE APP (REST CLIENT)                  │
│  • GET  /api/mobile/exams              (Fetch active exams for upload)       │
│  • POST /api/mobile/submissions        (Upload PDF/Image script + Roll No)   │
│  • GET  /api/mobile/results/:rollNo    (Held until Admin publishes exam)     │
│  • POST /api/mobile/disputes           (Submit 7-day transcript dispute)     │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 5-STAGE BACKEND EVALUATION ENGINE (Express)                  │
│  1. Ingestion & Storage   ──► Saves scan & initializes immutable v1 store    │
│  2. Two-Pass Literal OCR  ──► Pass 1 (3.8-flash) vs Pass 2 (3.1-flash-lite)  │
│                               + Rule-Based Arithmetic Engine (A+B=C, X% of Y)│
│  3. Question Segmenter    ──► Maps [Q.1]..[Q.n] + captures UNMAPPED_BLOCKS   │
│  4. ICAI Rubric Evaluator ──► Grades against Exam's Custom/AI Step Rubric    │
│                               + Awards Own-Figure forward computation marks  │
│  5. Rule-Based Flag Gate  ──► Fires 5 triggers -> Flagged vs Provisional     │
│                               Persists to backend/data/portal_store.json     │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ACADEMY ADMIN & FACULTY DASHBOARD                        │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────┐  │
│  │  Academy Overview &    │  │  Exam Candidates Queue │  │ 2-Pane Grading │  │
│  │  Exam/Rubric Builder   │─►│  + Publish Results     │─►│ Workbench &    │  │
│  │  (Custom + AI Rubric)  │  │  Release Gate Toggle   │  │ Versioned v1/v2│  │
│  └────────────────────────┘  └────────────────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State (`portal_store.json`)**:
  - `Examination`: `{ id, code, title, subject, paperCode, date, maxMarks, rubricNotes, questionsRubric: [{ code, title, sectionRef, maxMarks, ownFigure, promptText, icaiModelText, steps: [{ stepNo, title, maxMarks }] }], appeared, evaluated, pending, published, publishedAt }`
  - `EvaluationJob`: `{ id, examId, examCode, examTitle, name, rollNo, regNo, region, center, source: 'MOBILE_APP' | 'ADMIN_DASHBOARD', publishedToStudent, flagged, facultyConfirmed, triggersFired, ocr_report, segmentation_report, transcript_store, questions, observations, audit_log, tests }`
- **Interactive Component & State Mapping**:
  - **Create Exam Modal (`#modal-create-exam`)**: Includes a **"Generate ICAI Step Rubric with AI"** button (`#btn-ai-generate-rubric`) that calls `POST /api/exams/generate-rubric` and populates editable question/step rubric JSON or text before saving to `POST /api/exams`.
  - **Publish Results Action (`POST /api/exams/:id/publish`)**: Button in both the Examinations Table and Exam Candidates header (plus Academy Assistant command) that transitions an exam from `Provisional` to `Published`, unlocking results on `GET /api/mobile/results/:rollNo`.
  - **Mobile API Connection & Webhook Guide Modal (`#modal-mobile-api`)**: Accessible from the Dashboard header so the academy's mobile developer can view live endpoint URLs, copy cURL/JSON request formats, or simulate a student mobile upload directly into the pipeline.
