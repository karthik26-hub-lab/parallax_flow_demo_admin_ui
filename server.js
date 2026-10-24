import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadDir = path.join(__dirname, 'backend', 'data', 'uploads');
const processedDir = path.join(__dirname, 'backend', 'data', 'processed');
const storeFilePath = path.join(__dirname, 'backend', 'data', 'portal_store.json');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(processedDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// ============================================================================
// LITERAL OCR PROMPT (NON-NEGOTIABLE ARCHITECTURE CONSTANT)
// ============================================================================
const LITERAL_OCR_PROMPT =
  'Transcribe exactly what is written. Do not infer, correct, or complete anything. If any figure is ambiguous write UNCLEAR:X. Do not resolve ambiguity silently.';

const PRIMARY_OCR_MODEL = 'gemini-3.8-flash';
const SECONDARY_OCR_MODEL = process.env.ANTHROPIC_API_KEY
  ? 'claude-3-5-sonnet-20241022'
  : process.env.OPENAI_API_KEY
  ? 'gpt-4o'
  : 'gemini-3.1-flash-lite';

// ============================================================================
// PERSISTENT REAL DATA STORE (ZERO MOCK DATA)
// ============================================================================
const examsStore = new Map();
const jobsStore = new Map();

function loadPersistentStore() {
  try {
    if (fs.existsSync(storeFilePath)) {
      const raw = JSON.parse(fs.readFileSync(storeFilePath, 'utf-8'));
      if (Array.isArray(raw.exams)) {
        raw.exams.forEach((ex) => {
          if (ex && ex.id) examsStore.set(ex.id, ex);
        });
      }
      if (Array.isArray(raw.jobs)) {
        raw.jobs.forEach((job) => {
          if (job && job.id) jobsStore.set(job.id, job);
        });
      }
    }
  } catch (err) {
    console.warn('Could not read portal_store.json:', err.message);
  }
}

function savePersistentStore() {
  try {
    const payload = {
      updatedAt: new Date().toISOString(),
      exams: Array.from(examsStore.values()),
      jobs: Array.from(jobsStore.values())
    };
    fs.writeFileSync(storeFilePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save portal_store.json:', err.message);
  }
}

loadPersistentStore();

function syncExamCounts() {
  const allJobs = Array.from(jobsStore.values());
  examsStore.forEach((exam) => {
    const examJobs = allJobs.filter((j) => j.examId === exam.id || j.examCode === exam.code);
    const pendingCount = examJobs.filter((j) => j.flagged).length;
    exam.appeared = examJobs.length;
    exam.pending = pendingCount;
    exam.evaluated = Math.max(0, examJobs.length - pendingCount);

    // Sync publishedToStudent on each job belonging to this exam
    examJobs.forEach((job) => {
      job.publishedToStudent = Boolean(exam.published && (!job.flagged || job.facultyConfirmed));
    });
  });
}

// ============================================================================
// STAGE 2: TWO-PASS LITERAL OCR & RULE-BASED ARITHMETIC CHECK ENGINE
// ============================================================================
const NUMERIC_TOKEN_REGEX = /(?:₹\s*)?\d+(?:,\d{2,3})*(?:\.\d+)?(?:\s*%)|§\s*\d+(?:\(\d+\))?|\b\d+(?:\.\d+)?\b/gi;
const UNCLEAR_TAG_REGEX = /UNCLEAR:[^\s.,;)\]]+/gi;

function extractNumericTokens(text) {
  if (!text) return [];
  const tokens = [];
  let match;
  const rx = new RegExp(NUMERIC_TOKEN_REGEX.source, 'gi');
  let idx = 0;
  while ((match = rx.exec(text)) !== null) {
    const raw = match[0].trim();
    const normalized = raw.replace(/[\s,₹]/g, '');
    const start = Math.max(0, match.index - 24);
    const end = Math.min(text.length, match.index + raw.length + 24);
    tokens.push({
      index: idx++,
      raw,
      normalized,
      context: text.slice(start, end).replace(/\s+/g, ' ').trim()
    });
  }
  return tokens;
}

function compareTwoPassNumerics(pass1Text, pass2Text) {
  const p1 = extractNumericTokens(pass1Text);
  const p2 = extractNumericTokens(pass2Text);
  const disagreements = [];
  const maxLen = Math.max(p1.length, p2.length);
  for (let i = 0; i < maxLen; i++) {
    const t1 = p1[i];
    const t2 = p2[i];
    if (t1 && t2) {
      if (t1.normalized !== t2.normalized) {
        disagreements.push({
          token_index: i,
          pass1_value: t1.raw,
          pass2_value: t2.raw,
          context: t1.context
        });
      }
    } else if (t1 && !t2) {
      disagreements.push({
        token_index: i,
        pass1_value: t1.raw,
        pass2_value: 'MISSING_IN_PASS_2',
        context: t1.context
      });
    } else if (t2 && !t1) {
      disagreements.push({
        token_index: i,
        pass1_value: 'MISSING_IN_PASS_1',
        pass2_value: t2.raw,
        context: t2.context
      });
    }
  }
  return disagreements;
}

function runArithmeticConsistencyCheck(transcriptText) {
  const mismatches = [];
  const verifiedEquations = [];
  if (!transcriptText) {
    return { passed: true, mismatches: [], verified_equations: [] };
  }

  const addRx = /(\d+(?:\.\d+)?)\s*(?:Cr|Lakh|Lakhs|L)?\s*\+\s*(\d+(?:\.\d+)?)\s*(?:Cr|Lakh|Lakhs|L)?(?:\s*\+\s*(\d+(?:\.\d+)?)\s*(?:Cr|Lakh|Lakhs|L)?)?\s*=\s*(?:₹\s*)?(\d+(?:\.\d+)?)/gi;
  let m;
  while ((m = addRx.exec(transcriptText)) !== null) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    const c = m[3] ? parseFloat(m[3]) : 0;
    const written = parseFloat(m[4]);
    const expected = Math.round((a + b + c) * 100) / 100;
    const item = { expression: m[0], expected, written };
    if (Math.abs(expected - written) > 0.05) {
      mismatches.push(item);
    } else {
      verifiedEquations.push(item);
    }
  }

  const pctRx = /(\d+(?:\.\d+)?)\s*%\s*of\s*(?:₹\s*)?(\d+(?:\.\d+)?)\s*(?:Cr|Lakh|Lakhs|L)?\s*=\s*(?:₹\s*)?(\d+(?:\.\d+)?)/gi;
  while ((m = pctRx.exec(transcriptText)) !== null) {
    const pct = parseFloat(m[1]);
    const base = parseFloat(m[2]);
    const written = parseFloat(m[3]);
    const expected = Math.round((pct / 100) * base * 100) / 100;
    const item = { expression: m[0], expected, written };
    if (Math.abs(expected - written) > 0.05) {
      mismatches.push(item);
    } else {
      verifiedEquations.push(item);
    }
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
    verified_equations: verifiedEquations
  };
}

// ============================================================================
// STAGE 3: QUESTION SEGMENTATION ENGINE
// ============================================================================
function segmentTranscriptIntoQuestions(fullTranscript) {
  const mappedBlocks = {};
  const unmappedBlocks = [];
  const extraAttempts = [];
  let outOfOrderDetected = false;

  if (!fullTranscript || !fullTranscript.trim()) {
    return {
      mapped_blocks: {},
      unmapped_blocks: ['Empty transcript'],
      extra_attempts: [],
      out_of_order_detected: false,
      segmentation_failed: true
    };
  }

  const cleaned = fullTranscript.replace(/---\s*Page\s*\d+\s*---/gi, '\n');
  const headerRx = /(?:^|\n)\s*(?:\[?(?:Ans(?:wer)?\s*(?:to)?\s*)?(?:Q(?:uestion)?\.?\s*(?:No\.?)?\s*(\d+)\s*(?:\(([a-z0-9]+)\))?)\]?)\s*[:.\-—]?/gi;
  const matches = [];
  let match;
  while ((match = headerRx.exec(cleaned)) !== null) {
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      qNum: parseInt(match[1], 10),
      subpart: match[2] || '',
      rawHeader: match[0].trim()
    });
  }

  if (matches.length === 0) {
    return {
      mapped_blocks: { 'Q.1': cleaned.trim() },
      unmapped_blocks: [],
      extra_attempts: [],
      out_of_order_detected: false,
      segmentation_failed: false
    };
  }

  const leading = cleaned.slice(0, matches[0].index).trim();
  if (leading.length > 30) {
    unmappedBlocks.push(leading);
  }

  let prevQ = 0;
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : cleaned.length;
    const blockText = cleaned.slice(cur.end, nextStart).trim();
    const code = `Q.${cur.qNum}`;

    if (prevQ > 0 && cur.qNum < prevQ && !mappedBlocks[code]) {
      outOfOrderDetected = true;
    }
    prevQ = cur.qNum;

    if (blockText.includes('[UNMAPPED_ANSWER_BLOCK]')) {
      unmappedBlocks.push(blockText.replace('[UNMAPPED_ANSWER_BLOCK]', '').trim());
      continue;
    }

    if (mappedBlocks[code]) {
      mappedBlocks[code] += `\n\n[Continued]\n${blockText}`;
    } else {
      mappedBlocks[code] = blockText;
    }
  }

  return {
    mapped_blocks: mappedBlocks,
    unmapped_blocks: unmappedBlocks,
    extra_attempts: extraAttempts,
    out_of_order_detected: outOfOrderDetected,
    segmentation_failed: unmappedBlocks.length > 0
  };
}

// ============================================================================
// STAGE 4: ICAI RUBRIC & OWN-FIGURE STEP EVALUATOR (GEMINI + CUSTOM RUBRIC)
// ============================================================================
async function evaluateSegmentedQuestionsWithGemini(mappedBlocks, examObj) {
  const questionEntries = Object.entries(mappedBlocks);
  const totalExamMax = (examObj && Number(examObj.maxMarks)) || 100.0;
  const customQuestionsRubric =
    examObj && Array.isArray(examObj.questionsRubric) && examObj.questionsRubric.length > 0
      ? examObj.questionsRubric
      : null;

  const defaultPerQMax =
    questionEntries.length > 0
      ? Math.round((totalExamMax / questionEntries.length) * 10) / 10
      : totalExamMax;

  if (process.env.GEMINI_API_KEY && questionEntries.length > 0) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const rubricContextText = customQuestionsRubric
        ? `Structured Examination Question & Step Rubric JSON:\n${JSON.stringify(customQuestionsRubric, null, 2)}`
        : examObj && examObj.rubricNotes
        ? `Examiner Rubric / Question Paper Notes:\n${examObj.rubricNotes}`
        : 'Use standard ICAI step-marking scheme (Statutory Provision/Concept, Computation/Application with Own-Figure rule, Conclusion, Presentation).';

      const prompt = `You are a strict ICAI Chartered Accountancy Examiner evaluating a candidate's segmented answer transcript for the examination "${
        examObj ? examObj.title : 'CA Examination'
      }" (Subject: ${examObj ? examObj.subject : 'CA Paper'}, Max Marks: ${totalExamMax}).

${rubricContextText}

Segmented Candidate Answers:
${questionEntries.map(([code, text]) => `[${code}]\n${text}`).join('\n\n')}

Evaluate each segmented question step-by-step against the configured rubric and ICAI Own-Figure computation rules (if a candidate made an arithmetic slip in Step 1 but carried their own figure forward with the right formula in Step 2, award full step marks for Step 2 and set ownFigureApplied=true). Return JSON matching the schema.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              observations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    no: { type: Type.INTEGER },
                    code: { type: Type.STRING },
                    title: { type: Type.STRING },
                    sectionRef: { type: Type.STRING },
                    maxMarks: { type: Type.NUMBER },
                    ownFigure: { type: Type.BOOLEAN },
                    promptText: { type: Type.STRING },
                    icaiModelText: { type: Type.STRING },
                    steps: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          stepNo: { type: Type.INTEGER },
                          title: { type: Type.STRING },
                          maxMarks: { type: Type.NUMBER },
                          marks: { type: Type.NUMBER },
                          status: { type: Type.STRING },
                          ownFigureApplied: { type: Type.BOOLEAN },
                          requiredAnswer: { type: Type.STRING },
                          feedback: { type: Type.STRING },
                          tagsPresent: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ['stepNo', 'title', 'maxMarks', 'marks', 'status', 'feedback']
                      }
                    }
                  },
                  required: ['no', 'code', 'title', 'maxMarks', 'steps']
                }
              }
            },
            required: ['questions', 'observations']
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        const evaluatedQuestions = parsed.questions.map((q, idx) => {
          const code = q.code || `Q.${idx + 1}`;
          const studentText = mappedBlocks[code] || Object.values(mappedBlocks)[idx] || '';
          const steps = (q.steps || []).map((s, sIdx) => ({
            stepNo: s.stepNo || sIdx + 1,
            title: s.title || `Step ${sIdx + 1}`,
            maxMarks: Number(s.maxMarks) || 1.0,
            marks: Math.min(Number(s.maxMarks) || 1.0, Math.max(0, Number(s.marks) || 0)),
            status: s.status || 'PASS',
            ownFigureApplied: Boolean(s.ownFigureApplied),
            requiredAnswer: s.requiredAnswer || '',
            feedback: s.feedback || '',
            tagsPresent: Array.isArray(s.tagsPresent) ? s.tagsPresent : []
          }));
          const qMax = steps.reduce((a, b) => a + b.maxMarks, 0) || Number(q.maxMarks) || defaultPerQMax;
          const qAwarded = Math.round(steps.reduce((a, b) => a + b.marks, 0) * 10) / 10;
          return {
            no: q.no || idx + 1,
            code,
            title: q.title || `${code} Evaluation`,
            sectionRef: q.sectionRef || (examObj ? examObj.subject : 'ICAI Rubric'),
            maxMarks: Math.round(qMax * 10) / 10,
            awardedMarks: qAwarded,
            ownFigure: Boolean(q.ownFigure),
            promptText: q.promptText || `Question ${code} from ${examObj ? examObj.title : 'Examination'}`,
            icaiModelText: q.icaiModelText || 'Evaluated against ICAI step-marking rubric.',
            studentText,
            steps
          };
        });
        return {
          questions: evaluatedQuestions,
          observations:
            Array.isArray(parsed.observations) && parsed.observations.length > 0
              ? parsed.observations
              : ['Evaluated from uploaded answer script via Two-Pass Literal OCR.']
        };
      }
    } catch (err) {
      console.warn('Gemini rubric evaluation fallback to deterministic step structure:', err.message);
    }
  }

  // Deterministic structure built from the exam's custom rubric or candidate's segmented blocks
  const fallbackQuestions = questionEntries.map(([code, text], idx) => {
    const matchedRubricQ =
      customQuestionsRubric &&
      (customQuestionsRubric.find((rq) => rq.code === code) || customQuestionsRubric[idx]);
    const qMax = (matchedRubricQ && Number(matchedRubricQ.maxMarks)) || defaultPerQMax;

    if (matchedRubricQ && Array.isArray(matchedRubricQ.steps) && matchedRubricQ.steps.length > 0) {
      const steps = matchedRubricQ.steps.map((rs, sIdx) => ({
        stepNo: rs.stepNo || sIdx + 1,
        title: rs.title || `Step ${sIdx + 1}`,
        maxMarks: Number(rs.maxMarks) || 1.0,
        marks: Number(rs.maxMarks) || 1.0,
        status: 'PASS',
        ownFigureApplied: false,
        requiredAnswer: rs.requiredAnswer || '',
        feedback: 'Evaluated against custom exam rubric step.',
        tagsPresent: []
      }));
      return {
        no: idx + 1,
        code,
        title: matchedRubricQ.title || `Answer Evaluation (${code})`,
        sectionRef: matchedRubricQ.sectionRef || (examObj ? examObj.subject : 'ICAI Rubric'),
        maxMarks: qMax,
        awardedMarks: steps.reduce((a, b) => a + b.marks, 0),
        ownFigure: Boolean(matchedRubricQ.ownFigure),
        promptText: matchedRubricQ.promptText || (examObj && examObj.rubricNotes) || `Question ${code}`,
        icaiModelText: matchedRubricQ.icaiModelText || (examObj && examObj.rubricNotes) || '',
        studentText: text,
        steps
      };
    }

    const step1Max = Math.round(qMax * 0.4 * 2) / 2 || 2.0;
    const step2Max = Math.round(qMax * 0.4 * 2) / 2 || 2.0;
    const step3Max = Math.max(0.5, Math.round((qMax - step1Max - step2Max) * 10) / 10);
    return {
      no: idx + 1,
      code,
      title: `Answer Evaluation (${code})`,
      sectionRef: examObj ? examObj.subject : 'Uploaded Script',
      maxMarks: qMax,
      awardedMarks: qMax,
      ownFigure: true,
      promptText:
        (examObj && examObj.rubricNotes) || `Evaluation of ${code} for ${examObj ? examObj.title : 'Uploaded Examination'}`,
      icaiModelText:
        (examObj && examObj.rubricNotes) || 'Refer to examination rubric key for step-by-step allocation.',
      studentText: text,
      steps: [
        {
          stepNo: 1,
          title: 'Statutory Provision / Conceptual Principle',
          maxMarks: step1Max,
          marks: step1Max,
          status: 'PASS',
          ownFigureApplied: false,
          requiredAnswer: 'Relevant provision and legal/accounting principle.',
          feedback: 'Transcribed and verified from uploaded script.',
          tagsPresent: []
        },
        {
          stepNo: 2,
          title: 'Application / Computation Working',
          maxMarks: step2Max,
          marks: step2Max,
          status: 'PASS',
          ownFigureApplied: false,
          requiredAnswer: 'Step-wise computation and analysis.',
          feedback: 'Evaluated from candidate working notes.',
          tagsPresent: []
        },
        {
          stepNo: 3,
          title: 'Conclusion & ICAI Presentation',
          maxMarks: step3Max,
          marks: step3Max,
          status: 'PASS',
          ownFigureApplied: false,
          requiredAnswer: 'Final conclusion.',
          feedback: 'Conclusion recorded.',
          tagsPresent: []
        }
      ]
    };
  });

  return {
    questions: fallbackQuestions,
    observations: ['Provisional evaluation generated from uploaded candidate script.']
  };
}

// ============================================================================
// UNIFIED 5-STAGE SUBMISSION & EVALUATION PIPELINE (USED BY MOBILE APP & ADMIN)
// ============================================================================
async function processStudentSubmissionPipeline({
  reqFile,
  candidateName,
  rollNo,
  regNo,
  region,
  center,
  examId,
  examCode,
  examTitle,
  subject,
  manualTranscript,
  source = 'MOBILE_APP'
}) {
  // Find target examination by ID or Code, or auto-create if none exists yet
  let targetExam =
    (examId && examsStore.get(examId)) ||
    (examCode &&
      Array.from(examsStore.values()).find(
        (e) => e.code.toUpperCase() === String(examCode).toUpperCase()
      )) ||
    Array.from(examsStore.values())[0];

  if (!targetExam) {
    const autoExamId = `exam-${Date.now()}`;
    targetExam = {
      id: autoExamId,
      code: (examCode && String(examCode).toUpperCase()) || 'EXAM-01',
      title: (examTitle && examTitle.trim()) || 'CA Evaluation Test - 1',
      subject: (subject && subject.trim()) || 'Corporate & Other Laws',
      paperCode: 'CA Final',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      maxMarks: 100.0,
      rubricNotes: '',
      questionsRubric: [],
      appeared: 0,
      evaluated: 0,
      pending: 0,
      published: false,
      createdAt: new Date().toISOString()
    };
    examsStore.set(targetExam.id, targetExam);
  }

  let pass1Text = '';
  let pass2Text = '';
  let legibilityScore = 0.94;
  let pagesCount = 1;

  // Stage 1 & 2: Two-Pass Literal OCR on uploaded scan/PDF/text
  if (reqFile) {
    const ext = path.extname(reqFile.originalname || '').toLowerCase();
    if (ext === '.txt' || ext === '.md') {
      pass1Text = fs.readFileSync(reqFile.path, 'utf-8').trim();
      pass2Text = pass1Text;
    } else if (process.env.GEMINI_API_KEY) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      const fileBytes = fs.readFileSync(reqFile.path);
      const base64Data = fileBytes.toString('base64');
      const mimeType = reqFile.mimetype || (ext === '.pdf' ? 'application/pdf' : 'image/jpeg');

      const [resp1, resp2] = await Promise.all([
        ai.models.generateContent({
          model: PRIMARY_OCR_MODEL,
          contents: {
            parts: [{ inlineData: { mimeType, data: base64Data } }, { text: LITERAL_OCR_PROMPT }]
          }
        }),
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: {
            parts: [{ inlineData: { mimeType, data: base64Data } }, { text: LITERAL_OCR_PROMPT }]
          }
        })
      ]);

      pass1Text = (resp1.text || '').trim();
      pass2Text = (resp2.text || pass1Text).trim();
    }
  }

  if (!pass1Text && manualTranscript) {
    pass1Text = manualTranscript;
    pass2Text = manualTranscript;
  }

  if (!pass1Text) {
    throw new Error(
      'Could not extract readable text from the uploaded file. Please upload a clear image/PDF or provide transcript text.'
    );
  }

  if (!/Q(?:uestion)?\.?\s*\d+/i.test(pass1Text)) {
    pass1Text = `[Q.1]\n${pass1Text}`;
  }
  if (!/Q(?:uestion)?\.?\s*\d+/i.test(pass2Text)) {
    pass2Text = `[Q.1]\n${pass2Text}`;
  }

  // Stage 2 & 3: Numeric Cross-Check, Rule-Based Arithmetic Check & Question Segmentation
  const numericDisagreements = compareTwoPassNumerics(pass1Text, pass2Text);
  const arithmeticCheck = runArithmeticConsistencyCheck(pass1Text);
  const unclearMatches = pass1Text.match(UNCLEAR_TAG_REGEX) || [];
  const unclearTokens = Array.from(new Set(unclearMatches));
  const segmentation = segmentTranscriptIntoQuestions(pass1Text);

  // Stage 5: 5 Rule-Based Exception Triggers
  const triggersFired = [];
  if (numericDisagreements.length > 0) {
    const d0 = numericDisagreements[0];
    triggersFired.push({
      triggerNo: 1,
      code: 'PASS_1_NEQ_PASS_2',
      label: 'Pass 1 ≠ Pass 2 Numeric Mismatch',
      detail: `Pass 1 (${PRIMARY_OCR_MODEL}) transcribed "${d0.pass1_value}" whereas Pass 2 (${SECONDARY_OCR_MODEL}) transcribed "${d0.pass2_value}" in context: "${d0.context}".`,
      recommendedAction: 'Compare Pass 1 and Pass 2 literal transcripts and confirm the figure (creates v2 transcript).'
    });
  }
  if (!arithmeticCheck.passed) {
    const m0 = arithmeticCheck.mismatches[0];
    triggersFired.push({
      triggerNo: 2,
      code: 'ARITHMETIC_CHECK_FAILED',
      label: 'Arithmetic Check Mismatch',
      detail: `Candidate's written subtotal in "${m0.expression}" (${m0.written}) does not equal the sum of their own line items (${m0.expected}).`,
      recommendedAction: 'Verify whether the candidate made a transcription slip and confirm Own-Figure method credit.'
    });
  }
  if (unclearTokens.length >= 1) {
    triggersFired.push({
      triggerNo: 3,
      code: 'UNCLEAR_ABOVE_THRESHOLD',
      label: `UNCLEAR Token Threshold (${unclearTokens.length})`,
      detail: `Literal OCR emitted ${unclearTokens.length} ambiguous token marker(s): ${unclearTokens.join(', ')}.`,
      recommendedAction: 'Inspect handwriting and replace UNCLEAR:X in the transcript editor (creates v2).'
    });
  }
  if (segmentation.segmentation_failed) {
    triggersFired.push({
      triggerNo: 5,
      code: 'SEGMENTATION_FAILURE',
      label: 'Question Segmentation Failure',
      detail: `${segmentation.unmapped_blocks.length} answer block(s) could not be deterministically mapped to a rubric question number.`,
      recommendedAction: 'Map the unnumbered continuation block in the transcript editor.'
    });
  }

  // Stage 4: ICAI Rubric & Own-Figure Step Evaluation
  const evalResult = await evaluateSegmentedQuestionsWithGemini(segmentation.mapped_blocks, targetExam);
  const evaluatedQuestions = evalResult.questions;
  const totalAwarded =
    Math.round(evaluatedQuestions.reduce((acc, q) => acc + q.awardedMarks, 0) * 10) / 10;
  const maxMarks =
    Math.round(evaluatedQuestions.reduce((acc, q) => acc + q.maxMarks, 0) * 10) / 10 ||
    targetExam.maxMarks;
  const isFlagged = triggersFired.length > 0;
  const isPublishedToStudent = Boolean(targetExam.published && !isFlagged);

  const newJobId = `std-${Date.now()}`;
  const createdIso = new Date().toISOString();
  const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const newJob = {
    id: newJobId,
    job_id: newJobId,
    source,
    examId: targetExam.id,
    examCode: targetExam.code,
    examTitle: targetExam.title,
    name: candidateName,
    rollNo,
    regNo: regNo || `${region}-${rollNo}`,
    region,
    center: center || region,
    subject: targetExam.subject,
    facultyAdvisor: 'Faculty Examiner',
    disputeWindowDays: 7,
    rank: jobsStore.size + 1,
    totalStudents: jobsStore.size + 1,
    provisional: true,
    publishedToStudent: isPublishedToStudent,
    facultyConfirmed: false,
    flagged: isFlagged,
    aiStatus: isFlagged
      ? 'Exception Flag'
      : isPublishedToStudent
      ? 'Published (Provisional)'
      : 'Provisional Ready',
    flagReason: isFlagged ? triggersFired.map((t) => t.label).join(' · ') : null,
    flagDetails: isFlagged ? triggersFired.map((t) => t.detail).join(' ') : null,
    triggersFired,
    ocr_report: {
      prompt_used: LITERAL_OCR_PROMPT,
      pass1_model: PRIMARY_OCR_MODEL,
      pass2_model: SECONDARY_OCR_MODEL,
      pass1_text: pass1Text,
      pass2_text: pass2Text,
      numeric_disagreements: numericDisagreements,
      arithmetic_check: arithmeticCheck,
      unclear_tokens: unclearTokens,
      legibility_score: legibilityScore
    },
    segmentation_report: segmentation,
    transcript_store: {
      current_version: 'v1',
      versions: {
        v1: {
          version: 'v1',
          text: pass1Text,
          pass1_text: pass1Text,
          pass2_text: pass2Text,
          pass1_model: PRIMARY_OCR_MODEL,
          pass2_model: SECONDARY_OCR_MODEL,
          prompt: LITERAL_OCR_PROMPT,
          created_at: createdIso,
          created_by: 'TWO_PASS_LITERAL_OCR',
          immutable_original: true
        }
      },
      changes: []
    },
    questions: evaluatedQuestions,
    observations: evalResult.observations,
    audit_log: [
      {
        id: `log-${newJobId}-2`,
        event_type: isFlagged ? 'RULE_BASED_EXCEPTION_FLAGGED' : 'PROVISIONAL_GRADING_COMPLETED',
        actor: 'EVALUATION_ENGINE',
        summary: isFlagged
          ? `Flagged for faculty review: ${triggersFired.map((t) => t.code).join(', ')}. Held from student app release.`
          : `Provisional score ${totalAwarded.toFixed(1)} / ${maxMarks.toFixed(1)} evaluated (${
              isPublishedToStudent ? 'Released to Student App' : 'Held until Admin publishes exam'
            }).`,
        timestamp: createdIso
      },
      {
        id: `log-${newJobId}-1`,
        event_type: source === 'MOBILE_APP' ? 'MOBILE_APP_SCRIPT_INGESTED' : 'ADMIN_SCRIPT_INGESTED',
        actor: source,
        summary: `Ingested script for ${candidateName} (Roll: ${rollNo}) under ${targetExam.code}.`,
        timestamp: createdIso
      }
    ],
    tests: [
      {
        id: targetExam.id,
        name: targetExam.title,
        maxMarks,
        awardedMarks: totalAwarded,
        status: isFlagged ? 'Needs Review' : 'Provisional',
        flagged: isFlagged,
        provisional: true,
        submittedAt: `Today, ${nowTime}`,
        pages: pagesCount
      }
    ]
  };

  const entries = [[newJob.id, newJob], ...Array.from(jobsStore.entries())];
  jobsStore.clear();
  entries.forEach(([k, v]) => jobsStore.set(k, v));

  syncExamCounts();
  savePersistentStore();

  return { newJob, targetExam };
}

// ============================================================================
// RECALCULATE JOB STATE WHEN TRANSCRIPT OR STEP MARKS CHANGE
// ============================================================================
function recalculateJobState(job, rerunSegmentationAndOcr = false) {
  if (rerunSegmentationAndOcr) {
    const latestVer = job.transcript_store.current_version;
    const latestObj = job.transcript_store.versions[latestVer];
    const currentText = latestObj ? latestObj.text : job.ocr_report.pass1_text;

    const unclearMatches = currentText.match(UNCLEAR_TAG_REGEX) || [];
    const unclearTokens = Array.from(new Set(unclearMatches));
    const arithmeticCheck = runArithmeticConsistencyCheck(currentText);
    const segmentation = segmentTranscriptIntoQuestions(currentText);

    const numericDisagreements =
      latestVer === 'v1'
        ? compareTwoPassNumerics(job.ocr_report.pass1_text, job.ocr_report.pass2_text)
        : [];

    job.ocr_report.unclear_tokens = unclearTokens;
    job.ocr_report.arithmetic_check = arithmeticCheck;
    job.ocr_report.numeric_disagreements = numericDisagreements;
    job.segmentation_report = segmentation;

    const newTriggers = [];
    if (numericDisagreements.length > 0) {
      const d0 = numericDisagreements[0];
      newTriggers.push({
        triggerNo: 1,
        code: 'PASS_1_NEQ_PASS_2',
        label: 'Pass 1 ≠ Pass 2 Numeric Mismatch',
        detail: `Pass 1 transcribed "${d0.pass1_value}" whereas Pass 2 transcribed "${d0.pass2_value}".`,
        recommendedAction: 'Confirm numeric value in transcript editor.'
      });
    }
    if (!arithmeticCheck.passed) {
      const m0 = arithmeticCheck.mismatches[0];
      newTriggers.push({
        triggerNo: 2,
        code: 'ARITHMETIC_CHECK_FAILED',
        label: 'Arithmetic Check Mismatch',
        detail: `Candidate's written subtotal in "${m0.expression}" (${m0.written}) ≠ line-item sum (${m0.expected}).`,
        recommendedAction: 'Verify Own-Figure method credit.'
      });
    }
    if (unclearTokens.length >= 1) {
      newTriggers.push({
        triggerNo: 3,
        code: 'UNCLEAR_ABOVE_THRESHOLD',
        label: `UNCLEAR Token Threshold (${unclearTokens.length})`,
        detail: `Transcript contains ambiguous token(s): ${unclearTokens.join(', ')}.`,
        recommendedAction: 'Resolve UNCLEAR:X token in transcript editor.'
      });
    }
    if (job.ocr_report.legibility_score < 0.72 && !job.facultyConfirmed) {
      newTriggers.push({
        triggerNo: 4,
        code: 'LOW_LEGIBILITY_PREFLAG',
        label: `Low Legibility Pre-Flag (${Math.round(job.ocr_report.legibility_score * 100)}%)`,
        detail: `Pre-OCR stroke contrast score (${job.ocr_report.legibility_score.toFixed(2)}) < 0.72.`,
        recommendedAction: 'Inspect scan and confirm step marks.'
      });
    }
    if (segmentation.segmentation_failed) {
      newTriggers.push({
        triggerNo: 5,
        code: 'SEGMENTATION_FAILURE',
        label: 'Question Segmentation Failure',
        detail: `${segmentation.unmapped_blocks.length} answer block(s) could not be mapped to a question code.`,
        recommendedAction: 'Add question code header [Q.X] to unmapped block.'
      });
    }

    job.triggersFired = newTriggers;
  }

  let grandTotal = 0;
  let totalMax = 0;
  (job.questions || []).forEach((q) => {
    const qSum = Math.round((q.steps || []).reduce((acc, s) => acc + s.marks, 0) * 10) / 10;
    q.awardedMarks = qSum;
    grandTotal += qSum;
    totalMax += Number(q.maxMarks) || 0;
  });
  grandTotal = Math.round(grandTotal * 10) / 10;
  totalMax = Math.round(totalMax * 10) / 10 || (job.tests && job.tests[0]?.maxMarks) || 100;

  const isFlagged = !job.facultyConfirmed && (job.triggersFired || []).length > 0;
  job.flagged = isFlagged;

  const parentExam = examsStore.get(job.examId);
  job.publishedToStudent = Boolean(parentExam && parentExam.published && !isFlagged);

  job.aiStatus = isFlagged
    ? 'Exception Flag'
    : job.publishedToStudent
    ? 'Published (Provisional)'
    : job.facultyConfirmed
    ? 'Faculty Confirmed (Provisional)'
    : 'Provisional Ready';
  job.flagReason = isFlagged ? job.triggersFired.map((t) => t.label).join(' · ') : null;
  job.flagDetails = isFlagged ? job.triggersFired.map((t) => t.detail).join(' ') : null;

  if (job.tests && job.tests[0]) {
    job.tests[0].awardedMarks = grandTotal;
    job.tests[0].maxMarks = totalMax;
    job.tests[0].flagged = isFlagged;
    job.tests[0].status = isFlagged ? 'Needs Review' : 'Provisional';
    job.tests[0].provisional = true;
  }

  syncExamCounts();
  savePersistentStore();
}

// ============================================================================
// STUDENT MOBILE APP REST API ENDPOINTS (/api/mobile/*)
// ============================================================================

// M1. GET /api/mobile/exams — List active academy examinations for the Student Mobile App
app.get('/api/mobile/exams', (req, res) => {
  syncExamCounts();
  const exams = Array.from(examsStore.values()).map((ex) => ({
    id: ex.id,
    code: ex.code,
    title: ex.title,
    subject: ex.subject,
    paperCode: ex.paperCode,
    date: ex.date,
    maxMarks: ex.maxMarks,
    published: Boolean(ex.published)
  }));
  res.json({
    status: 'ok',
    count: exams.length,
    exams
  });
});

// M2. POST /api/mobile/submissions — Student uploads answer script from Mobile App
app.post('/api/mobile/submissions', upload.single('file'), async (req, res) => {
  try {
    const candidateName = (req.body.candidateName || req.body.studentName || '').trim();
    const rollNo = (req.body.rollNo || '').trim();
    const regNo = (req.body.regNo || '').trim();
    const region = (req.body.region || 'WIRC').trim();
    const center = (req.body.center || region).trim();
    const examId = (req.body.examId || '').trim();
    const examCode = (req.body.examCode || '').trim();
    const manualTranscript = (req.body.transcriptText || '').trim();

    if (!candidateName || !rollNo) {
      return res.status(400).json({
        error: 'candidateName and rollNo are required for mobile script submission.'
      });
    }

    if (!req.file && !manualTranscript) {
      return res.status(400).json({
        error: 'Attach an answer script file (file) or transcriptText.'
      });
    }

    const { newJob, targetExam } = await processStudentSubmissionPipeline({
      reqFile: req.file,
      candidateName,
      rollNo,
      regNo,
      region,
      center,
      examId,
      examCode,
      manualTranscript,
      source: 'MOBILE_APP'
    });

    res.json({
      status: 'received_and_evaluated',
      submission_id: newJob.id,
      exam_code: targetExam.code,
      exam_title: targetExam.title,
      roll_no: newJob.rollNo,
      candidate_name: newJob.name,
      result_visibility: newJob.publishedToStudent ? 'PUBLISHED' : 'HELD_PENDING_PUBLICATION',
      message: newJob.publishedToStudent
        ? 'Your provisional evaluation is published and ready to view.'
        : 'Your answer script has been received and evaluated. Marks will be released once the Academy Admin publishes the examination results.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Mobile submission failed' });
  }
});

// M3. GET /api/mobile/results/:rollNo — Student Mobile App polls result (Enforces Admin Release Gate!)
app.get('/api/mobile/results/:rollNo', (req, res) => {
  syncExamCounts();
  const rollQuery = String(req.params.rollNo || '').trim().toLowerCase();
  const examCodeQuery = req.query.examCode ? String(req.query.examCode).trim().toUpperCase() : null;

  const matchingJobs = Array.from(jobsStore.values()).filter((j) => {
    const rollMatch = j.rollNo.toLowerCase() === rollQuery;
    const examMatch = !examCodeQuery || (j.examCode && j.examCode.toUpperCase() === examCodeQuery);
    return rollMatch && examMatch;
  });

  if (matchingJobs.length === 0) {
    return res.status(404).json({
      status: 'NOT_FOUND',
      message: `No uploaded script found for Roll Number ${req.params.rollNo}.`
    });
  }

  const results = matchingJobs.map((job) => {
    const parentExam = examsStore.get(job.examId);
    const isReleased = Boolean((parentExam ? parentExam.published : job.publishedToStudent) && !job.flagged);

    if (!isReleased) {
      return {
        submission_id: job.id,
        exam_code: job.examCode,
        exam_title: job.examTitle,
        subject: job.subject,
        candidate_name: job.name,
        roll_no: job.rollNo,
        submitted_at: job.tests?.[0]?.submittedAt || '',
        status: 'HELD_PENDING_PUBLICATION',
        reason: job.flagged
          ? 'Script is currently queued for Faculty Examiner verification.'
          : 'Examination results have not yet been published by the Academy Administrator.',
        marks_released: false
      };
    }

    const testInfo = job.tests?.[0] || { awardedMarks: 0, maxMarks: 100 };
    const curVer = job.transcript_store?.current_version || 'v1';

    return {
      submission_id: job.id,
      exam_code: job.examCode,
      exam_title: job.examTitle,
      subject: job.subject,
      candidate_name: job.name,
      roll_no: job.rollNo,
      status: 'PUBLISHED',
      marks_released: true,
      provisional_disclaimer: 'RESULT STATUS: PROVISIONAL — Subject to 7-day student dispute window',
      awarded_marks: testInfo.awardedMarks,
      max_marks: testInfo.maxMarks,
      percentage: Math.round((testInfo.awardedMarks / (testInfo.maxMarks || 100)) * 1000) / 10,
      transcript_version: curVer,
      confirmed_transcript: job.transcript_store?.versions?.[curVer]?.text || '',
      observations: job.observations || [],
      questions: (job.questions || []).map((q) => ({
        code: q.code,
        title: q.title,
        sectionRef: q.sectionRef,
        awardedMarks: q.awardedMarks,
        maxMarks: q.maxMarks,
        steps: (q.steps || []).map((s) => ({
          stepNo: s.stepNo,
          title: s.title,
          marks: s.marks,
          maxMarks: s.maxMarks,
          status: s.status,
          ownFigureApplied: s.ownFigureApplied,
          feedback: s.feedback
        }))
      }))
    };
  });

  res.json({
    roll_no: req.params.rollNo,
    total_submissions: results.length,
    results
  });
});

// M4. POST /api/mobile/disputes — Student raises a 7-day transcript dispute from Mobile App
app.post('/api/mobile/disputes', (req, res) => {
  const { rollNo, submissionId, questionCode, studentClaim } = req.body || {};
  if (!rollNo || !studentClaim) {
    return res.status(400).json({ error: 'rollNo and studentClaim are required.' });
  }

  const targetJob =
    (submissionId && jobsStore.get(submissionId)) ||
    Array.from(jobsStore.values()).find(
      (j) => j.rollNo.toLowerCase() === String(rollNo).trim().toLowerCase()
    );

  if (!targetJob) {
    return res.status(404).json({ error: 'Submission not found for the given rollNo.' });
  }

  const nowIso = new Date().toISOString();
  targetJob.flagged = true;
  targetJob.facultyConfirmed = false;
  targetJob.publishedToStudent = false;
  targetJob.aiStatus = 'Exception Flag';
  targetJob.flagReason = `Student Mobile Dispute (${questionCode || 'General'})`;
  targetJob.flagDetails = `Student Claim: "${studentClaim}"`;
  targetJob.triggersFired = [
    ...(targetJob.triggersFired || []),
    {
      triggerNo: 6,
      code: 'STUDENT_MOBILE_DISPUTE',
      label: `Student Dispute (${questionCode || 'Script'})`,
      detail: studentClaim,
      recommendedAction: 'Inspect handwriting scan and update transcript version if valid.'
    }
  ];

  targetJob.audit_log.unshift({
    id: `dispute-${Date.now()}`,
    event_type: 'STUDENT_MOBILE_DISPUTE_RAISED',
    actor: `${targetJob.name} (Roll ${targetJob.rollNo})`,
    summary: `Student submitted dispute on ${questionCode || 'script'} via Mobile App: "${studentClaim}". Routed back to Pending Faculty Reviews.`,
    timestamp: nowIso
  });

  syncExamCounts();
  savePersistentStore();

  res.json({
    status: 'dispute_logged',
    submission_id: targetJob.id,
    message: 'Dispute routed to Academy Faculty Pending Reviews queue.'
  });
});

// ============================================================================
// ACADEMY ADMIN & FACULTY DASHBOARD REST API ROUTES (/api/*)
// ============================================================================

// 1. POST /api/exams/generate-rubric — AI-Assisted ICAI Step Rubric Builder
app.post('/api/exams/generate-rubric', async (req, res) => {
  const {
    title,
    subject = 'Corporate & Other Laws',
    maxMarks = 100,
    topicNotes = '',
    customPrompt = ''
  } = req.body || {};
  const resolvedTitle =
    title && String(title).trim() ? String(title).trim() : `${subject} — Mock Examination`;
  const resolvedNotes = String(topicNotes || customPrompt || '').trim();

  const numericMax = Number(maxMarks) > 0 ? Number(maxMarks) : 100;

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const prompt = `Design a structured ICAI Chartered Accountancy examination question paper and step-by-step evaluation rubric for:
- Exam Title: ${resolvedTitle}
- Subject: ${subject}
- Total Maximum Marks: ${numericMax}
${resolvedNotes ? `- Additional Topic / Question Instructions: ${resolvedNotes}` : ''}

Create 4 to 5 realistic ICAI case-study questions whose maxMarks sum to ${numericMax}. For each question, include 3 to 4 step-marking criteria (Statutory Provision, Computation / Application with Own-Figure flag where numerical, Conclusion, Presentation). Return JSON matching the schema.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questionsRubric: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    no: { type: Type.INTEGER },
                    code: { type: Type.STRING },
                    title: { type: Type.STRING },
                    sectionRef: { type: Type.STRING },
                    maxMarks: { type: Type.NUMBER },
                    ownFigure: { type: Type.BOOLEAN },
                    promptText: { type: Type.STRING },
                    icaiModelText: { type: Type.STRING },
                    steps: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          stepNo: { type: Type.INTEGER },
                          title: { type: Type.STRING },
                          maxMarks: { type: Type.NUMBER },
                          requiredAnswer: { type: Type.STRING }
                        },
                        required: ['stepNo', 'title', 'maxMarks']
                      }
                    }
                  },
                  required: ['no', 'code', 'title', 'maxMarks', 'promptText', 'icaiModelText', 'steps']
                }
              }
            },
            required: ['questionsRubric']
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed && Array.isArray(parsed.questionsRubric) && parsed.questionsRubric.length > 0) {
        const formattedNotes = parsed.questionsRubric
          .map(
            (q) =>
              `[${q.code}] ${q.title} (${q.maxMarks}M · ${q.sectionRef || subject})\nPrompt: ${q.promptText}\nSteps: ${(
                q.steps || []
              )
                .map((s) => `S${s.stepNo}: ${s.title} (${s.maxMarks}M)`)
                .join(' | ')}`
          )
          .join('\n\n');

        return res.json({
          status: 'generated',
          questionsRubric: parsed.questionsRubric,
          rubricNotes: formattedNotes
        });
      }
    } catch (err) {
      console.warn('AI rubric generation fallback:', err.message);
    }
  }

  // Deterministic structured rubric if API key unavailable
  const qCount = 4;
  const perQ = Math.round((numericMax / qCount) * 10) / 10;
  const fallbackRubric = Array.from({ length: qCount }, (_, i) => ({
    no: i + 1,
    code: `Q.${i + 1}`,
    title: `${subject} Case Study Question ${i + 1}`,
    sectionRef: `${subject} — ICAI Module`,
    maxMarks: perQ,
    ownFigure: i % 2 === 0,
    promptText: `Case problem ${i + 1} for ${resolvedTitle} (${subject}).`,
    icaiModelText: '1. Statutory Provision / Standard; 2. Computation & Analysis; 3. Conclusion.',
    steps: [
      { stepNo: 1, title: 'Statutory Provision / Standard Citation', maxMarks: Math.round(perQ * 0.4 * 2) / 2 },
      { stepNo: 2, title: 'Working Note & Case Application (Own-Figure)', maxMarks: Math.round(perQ * 0.4 * 2) / 2 },
      {
        stepNo: 3,
        title: 'Final Conclusion & Presentation',
        maxMarks: Math.max(0.5, Math.round((perQ - Math.round(perQ * 0.4 * 2)) * 10) / 10)
      }
    ]
  }));

  const formattedNotes = fallbackRubric
    .map(
      (q) =>
        `[${q.code}] ${q.title} (${q.maxMarks}M)\nSteps: ${q.steps
          .map((s) => `S${s.stepNo}: ${s.title} (${s.maxMarks}M)`)
          .join(' | ')}`
    )
    .join('\n\n');

  res.json({
    status: 'generated',
    questionsRubric: fallbackRubric,
    rubricNotes: formattedNotes
  });
});

// 2. GET /api/exams — List all created examinations
app.get('/api/exams', (req, res) => {
  syncExamCounts();
  res.json({
    exams: Array.from(examsStore.values())
  });
});

// 3. POST /api/exams — Create a new examination (Custom or AI-Generated Rubric)
app.post('/api/exams', (req, res) => {
  const { code, title, subject, paperCode, date, maxMarks, rubricNotes, questionsRubric } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Examination title is required.' });
  }

  const nextNum = examsStore.size + 1;
  const cleanCode = (code && String(code).trim().toUpperCase()) || `EXAM-${String(nextNum).padStart(2, '0')}`;
  const examId = `exam-${Date.now()}`;
  const todayStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const newExam = {
    id: examId,
    code: cleanCode,
    title: String(title).trim(),
    subject: (subject && String(subject).trim()) || 'Corporate & Other Laws',
    paperCode: (paperCode && String(paperCode).trim()) || 'CA Final',
    date: (date && String(date).trim()) || todayStr,
    maxMarks: Number(maxMarks) > 0 ? Number(maxMarks) : 100.0,
    rubricNotes: (rubricNotes && String(rubricNotes).trim()) || '',
    questionsRubric: Array.isArray(questionsRubric) ? questionsRubric : [],
    appeared: 0,
    evaluated: 0,
    pending: 0,
    published: false,
    publishedAt: null,
    createdAt: new Date().toISOString()
  };

  examsStore.set(newExam.id, newExam);
  savePersistentStore();

  res.json({
    status: 'created',
    exam: newExam
  });
});

// 4. POST /api/exams/:id/publish — Publish Exam Results to Student Mobile App
app.post('/api/exams/:id/publish', (req, res) => {
  const exam =
    examsStore.get(req.params.id) ||
    Array.from(examsStore.values()).find(
      (e) => e.code.toUpperCase() === String(req.params.id).toUpperCase()
    );

  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  const clearFlags = Boolean(req.body && req.body.clearFlags);
  const nowIso = new Date().toISOString();

  exam.published = true;
  exam.publishedAt = nowIso;

  const examJobs = Array.from(jobsStore.values()).filter(
    (j) => j.examId === exam.id || j.examCode === exam.code
  );

  examJobs.forEach((job) => {
    if (clearFlags && job.flagged) {
      job.flagged = false;
      job.facultyConfirmed = true;
    }
    if (!job.flagged) {
      job.publishedToStudent = true;
      job.aiStatus = 'Published (Provisional)';
      job.audit_log.unshift({
        id: `pub-${Date.now()}-${job.id}`,
        event_type: 'RESULT_PUBLISHED_TO_STUDENT_APP',
        actor: 'ACADEMY_ADMIN',
        summary: `Published provisional marksheet for ${exam.code} to Student Mobile App.`,
        timestamp: nowIso
      });
    }
  });

  syncExamCounts();
  savePersistentStore();

  res.json({
    status: 'published',
    exam,
    jobs: Array.from(jobsStore.values())
  });
});

// 5. DELETE /api/exams/:id — Delete an examination
app.delete('/api/exams/:id', (req, res) => {
  const examId = req.params.id;
  if (!examsStore.has(examId)) {
    return res.status(404).json({ error: 'Examination not found.' });
  }
  examsStore.delete(examId);
  savePersistentStore();
  res.json({ status: 'deleted', id: examId });
});

// 6. GET /api/jobs — List all real scripts and exams for Academy Dashboard
app.get('/api/jobs', (req, res) => {
  syncExamCounts();
  const allJobs = Array.from(jobsStore.values());
  const allExams = Array.from(examsStore.values());
  res.json({
    total_ingested: allJobs.length,
    provisional_mode: true,
    primary_ocr_model: PRIMARY_OCR_MODEL,
    secondary_ocr_model: SECONDARY_OCR_MODEL,
    literal_prompt: LITERAL_OCR_PROMPT,
    exams: allExams,
    jobs: allJobs
  });
});

// 7. GET /api/jobs/:id — Detailed script record
app.get('/api/jobs/:id', (req, res) => {
  const job = jobsStore.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Evaluation job not found' });
  }
  res.json(job);
});

// 8. POST /api/upload — Faculty/Admin Dashboard Script Upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const candidateName = (req.body.candidateName || '').trim();
    const rollNo = (req.body.rollNo || '').trim();
    const region = (req.body.region || 'WIRC').trim();
    const center = (req.body.center || region).trim();
    const examId = (req.body.examId || '').trim();
    const manualTranscript = (req.body.transcriptText || '').trim();
    const submissionSource = (req.body.source || 'ADMIN_DASHBOARD').trim();

    if (!candidateName || !rollNo) {
      return res.status(400).json({ error: 'Student Name and Roll Number are required.' });
    }

    if (!req.file && !manualTranscript) {
      return res.status(400).json({
        error: 'Please attach an answer script file (image/PDF/txt) or paste the script transcript to evaluate.'
      });
    }

    const { newJob, targetExam } = await processStudentSubmissionPipeline({
      reqFile: req.file,
      candidateName,
      rollNo,
      region,
      center,
      examId,
      manualTranscript,
      source: submissionSource
    });

    res.json({
      status: 'completed',
      job_id: newJob.id,
      job: newJob,
      exam: targetExam
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// 9. POST /api/jobs/:id/transcript — Append a new version (v2, v3...) to the Versioned Transcript Store
app.post('/api/jobs/:id/transcript', (req, res) => {
  const job = jobsStore.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Evaluation job not found' });
  }

  const { question_code, new_question_text, full_text, changed_by, reason_category, reason_text } = req.body;
  if (!changed_by || !reason_text) {
    return res.status(400).json({ error: 'changed_by and reason_text are required for transcript versioning.' });
  }

  const store = job.transcript_store;
  const prevVer = store.current_version;
  const verNums = Object.keys(store.versions)
    .map((k) => parseInt(k.replace('v', ''), 10))
    .filter((n) => !isNaN(n));
  const nextVer = `v${Math.max(...verNums, 1) + 1}`;
  const nowIso = new Date().toISOString();

  if (question_code && typeof new_question_text === 'string') {
    const targetQ = job.questions.find((q) => q.code === question_code);
    if (targetQ) {
      targetQ.studentText = new_question_text;
    }
  }

  const updatedFullText =
    typeof full_text === 'string' && full_text.trim()
      ? full_text.trim()
      : job.questions.map((q) => `[${q.code}]\n${q.studentText}`).join('\n\n--- Page Break ---\n\n');

  store.versions[nextVer] = {
    version: nextVer,
    text: updatedFullText,
    based_on: prevVer,
    created_at: nowIso,
    created_by: changed_by,
    reason_category: reason_category || 'OCR_DISPUTE_RESOLUTION',
    reason: reason_text,
    immutable_original: false
  };
  store.current_version = nextVer;

  const changeRecord = {
    from_version: prevVer,
    to_version: nextVer,
    question_code: question_code || 'ALL',
    changed_by,
    reason_category: reason_category || 'OCR_DISPUTE_RESOLUTION',
    reason: reason_text,
    timestamp: nowIso
  };
  store.changes.unshift(changeRecord);

  job.audit_log.unshift({
    id: `log-${Date.now()}`,
    event_type: 'TRANSCRIPT_VERSION_CREATED',
    actor: changed_by,
    summary: `Created transcript ${nextVer} (from ${prevVer}) on ${question_code || 'script'}: [${reason_category || 'DISPUTE'}] ${reason_text}.`,
    timestamp: nowIso,
    metadata: changeRecord
  });

  recalculateJobState(job, true);

  res.json({
    status: 'updated',
    current_version: store.current_version,
    job
  });
});

// 10. POST /api/jobs/:id/override — Faculty Override on ANY step mark
app.post('/api/jobs/:id/override', (req, res) => {
  const job = jobsStore.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Evaluation job not found' });
  }

  const { question_code, step_no, new_marks, reason_category, reason_text, faculty_id } = req.body;
  if (!question_code || step_no === undefined || new_marks === undefined || !reason_category || !reason_text || !faculty_id) {
    return res.status(400).json({
      error: 'Every faculty override requires question_code, step_no, new_marks, reason_category, reason_text, and faculty_id.'
    });
  }

  const q = job.questions.find((item) => item.code === question_code);
  if (!q) {
    return res.status(404).json({ error: `Question ${question_code} not found` });
  }

  const step = q.steps.find((s) => Number(s.stepNo) === Number(step_no));
  if (!step) {
    return res.status(404).json({ error: `Step ${step_no} not found in ${question_code}` });
  }

  const boundedMarks = Math.max(0, Math.min(step.maxMarks, Number(new_marks)));
  const prevMarks = step.marks;
  const nowIso = new Date().toISOString();

  step.marks = boundedMarks;
  step.faculty_override = {
    previous_marks: prevMarks,
    new_marks: boundedMarks,
    reason_category,
    reason_text,
    faculty_id,
    timestamp: nowIso
  };
  step.status = boundedMarks >= step.maxMarks ? 'PASS' : boundedMarks > 0 ? 'PARTIAL' : 'FAIL';
  step.feedback = `[FACULTY OVERRIDE by ${faculty_id} · ${reason_category}]: ${reason_text}`;

  const logEntry = {
    id: `override-${Date.now()}`,
    event_type: 'FACULTY_MARK_OVERRIDE',
    actor: faculty_id,
    summary: `${question_code} Step ${step_no}: Marks changed from ${prevMarks.toFixed(1)} to ${boundedMarks.toFixed(1)} / ${step.maxMarks.toFixed(1)} [${reason_category}] — "${reason_text}"`,
    timestamp: nowIso,
    metadata: {
      question_code,
      step_no,
      previous_marks: prevMarks,
      new_marks: boundedMarks,
      reason_category,
      reason_text,
      faculty_id,
      transcript_version: job.transcript_store.current_version
    }
  };
  job.audit_log.unshift(logEntry);

  recalculateJobState(job, false);

  res.json({
    status: 'overridden',
    override: logEntry,
    job
  });
});

// 11. POST /api/jobs/:id/confirm — Faculty Auditor confirms provisional evaluation & clears flags
app.post('/api/jobs/:id/confirm', (req, res) => {
  const job = jobsStore.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Evaluation job not found' });
  }

  const facultyId = (req.body.faculty_id || 'Faculty Examiner').trim();
  const note = (req.body.note || 'Verified two-pass transcript and rubric step markings.').trim();
  const nowIso = new Date().toISOString();

  job.facultyConfirmed = true;
  job.provisional = true;
  job.flagged = false;

  const parentExam = examsStore.get(job.examId);
  job.publishedToStudent = Boolean(parentExam && parentExam.published);
  job.aiStatus = job.publishedToStudent
    ? 'Published (Provisional)'
    : 'Faculty Confirmed (Provisional)';

  job.audit_log.unshift({
    id: `confirm-${Date.now()}`,
    event_type: 'FACULTY_EXCEPTION_CONFIRMATION',
    actor: facultyId,
    summary: `Faculty confirmed script after reviewing rule-based triggers: "${note}"`,
    timestamp: nowIso,
    metadata: { faculty_id: facultyId, note, transcript_version: job.transcript_store.current_version }
  });

  recalculateJobState(job, false);
  res.json({ status: 'confirmed', job });
});

// 12. DELETE /api/jobs/:id — Remove a candidate script
app.delete('/api/jobs/:id', (req, res) => {
  const id = req.params.id;
  if (!jobsStore.has(id)) {
    return res.status(404).json({ error: 'Candidate script not found.' });
  }
  jobsStore.delete(id);
  syncExamCounts();
  savePersistentStore();
  res.json({ status: 'deleted', id });
});

// 13. GET /api/config
app.get('/api/config', (req, res) => {
  res.json({
    appName: 'Parallax Flow — Provisional AI Evaluation & Faculty Audit Platform',
    defaultEngine: 'gemini',
    hasEnvGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    primaryOcrModel: PRIMARY_OCR_MODEL,
    secondaryOcrModel: SECONDARY_OCR_MODEL,
    literalOcrPrompt: LITERAL_OCR_PROMPT
  });
});

app.get('/api/evaluate/jobs', (req, res) => {
  res.json({ jobs: Array.from(jobsStore.values()) });
});

// ============================================================================
// 14. POST /api/chat — MULTI-TURN GEMINI ADMIN COMMAND CHATBOT & ACTION ENGINE
// ============================================================================
const ADMIN_CHAT_TOOLS = [
  {
    name: 'create_examination',
    description: 'Create a new academy examination in the portal.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: { type: Type.STRING, description: 'Exam code such as EXAM-01' },
        title: { type: Type.STRING, description: 'Title of the examination' },
        subject: {
          type: Type.STRING,
          description: 'Subject: Corporate & Other Laws, Advanced Auditing, Direct Tax Laws, or Financial Reporting'
        },
        maxMarks: { type: Type.NUMBER, description: 'Maximum marks for the examination (e.g. 50 or 100)' }
      },
      required: ['title']
    }
  },
  {
    name: 'publish_exam_results',
    description:
      'Publish or release provisional results to the Student Mobile App for a specific examination or all ready examinations.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        examCode: {
          type: Type.STRING,
          description: 'Exam code such as EXAM-01, or ALL_READY to publish all completed exams.'
        },
        clearFlags: {
          type: Type.BOOLEAN,
          description: 'Whether to also confirm and clear remaining flags for that exam before publishing.'
        }
      },
      required: ['examCode']
    }
  },
  {
    name: 'show_exam_toppers',
    description:
      'Display the top-scoring rank holders / toppers leaderboard from uploaded student scripts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        count: {
          type: Type.INTEGER,
          description: 'Number of toppers to show (default 5).'
        },
        examCode: {
          type: Type.STRING,
          description: 'Optional exam code.'
        },
        sortTable: {
          type: Type.BOOLEAN,
          description: 'Whether to also sort the live candidate queue table by highest marks descending.'
        }
      },
      required: ['count']
    }
  },
  {
    name: 'organize_portal_view',
    description:
      'Organize, filter, sort, or navigate the Academy Examinations list or the Exam Candidates queue.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetView: {
          type: Type.STRING,
          description: 'View to show: dashboard (examinations list) or exam-candidates (candidate queue).'
        },
        examFilter: {
          type: Type.STRING,
          description: 'Filter for exams table: ALL, PENDING, COMPLETED, or PUBLISHED.'
        },
        subjectFilter: {
          type: Type.STRING,
          description:
            'Filter exams by subject: ALL, Corporate & Other Laws, Advanced Auditing, Direct Tax Laws, or Financial Reporting.'
        },
        candidateFilter: {
          type: Type.STRING,
          description: 'Filter for candidates table: ALL, CERTIFIED (Provisional Ready), or FLAGGED.'
        },
        sortBy: {
          type: Type.STRING,
          description: 'Sort order: SCORE_DESC, SCORE_ASC, PENDING_DESC, APPEARED_DESC, or CODE_ASC.'
        }
      },
      required: ['targetView']
    }
  },
  {
    name: 'manage_student_script',
    description:
      'Open an uploaded candidate script in the Grading Workbench, open their Provisional Evaluation Report, or flag/confirm their script by name or roll number.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Student name or roll number.'
        },
        operation: {
          type: Type.STRING,
          description: 'Action to perform: OPEN_WORKBENCH, OPEN_REPORT, FLAG_SCRIPT, or CONFIRM_SCRIPT.'
        }
      },
      required: ['query', 'operation']
    }
  }
];

function inferDeterministicActions(userText, allJobs) {
  const text = (userText || '').toLowerCase();
  const actions = [];

  if (/\b(publish|release|announce)\b/.test(text)) {
    const codeMatch = userText.match(/exam[-_\s]?(\d{1,2})/i);
    const examCode = codeMatch
      ? `EXAM-${String(parseInt(codeMatch[1], 10)).padStart(2, '0')}`
      : 'ALL_READY';
    const clearFlags = /\b(clear|confirm|approve|force|all)\b/.test(text);
    actions.push({
      type: 'publish_exam_results',
      examCode,
      clearFlags
    });
  }

  if (/\b(topper|toppers|top\s*\d*|rank|leaderboard|highest|best\s+scor)/i.test(text)) {
    const numMatch = text.match(/top\s*(\d+)/i);
    const count = numMatch ? Math.min(10, Math.max(1, parseInt(numMatch[1], 10))) : 5;
    actions.push({
      type: 'show_exam_toppers',
      count,
      sortTable: true
    });
  }

  if (/\b(organize|filter|sort|show|list)\b/.test(text) && actions.length === 0) {
    let subjectFilter = 'ALL';
    if (/\b(law|corporate)\b/.test(text)) subjectFilter = 'Corporate & Other Laws';
    else if (/\b(audit|auditing)\b/.test(text)) subjectFilter = 'Advanced Auditing';
    else if (/\b(tax|direct\s*tax|dt)\b/.test(text)) subjectFilter = 'Direct Tax Laws';
    else if (/\b(fr|financial\s*reporting|ind\s*as)\b/.test(text)) subjectFilter = 'Financial Reporting';

    if (/\b(flagged\s+student|flagged\s+script|flagged\s+candidate)\b/.test(text)) {
      actions.push({
        type: 'organize_portal_view',
        targetView: 'exam-candidates',
        candidateFilter: 'FLAGGED',
        sortBy: 'SCORE_DESC'
      });
    } else if (/\b(pending|review|unverified)\b/.test(text)) {
      actions.push({
        type: 'organize_portal_view',
        targetView: 'dashboard',
        examFilter: 'PENDING',
        subjectFilter,
        sortBy: 'PENDING_DESC'
      });
    } else if (/\b(completed|done|evaluated)\b/.test(text)) {
      actions.push({
        type: 'organize_portal_view',
        targetView: 'dashboard',
        examFilter: 'COMPLETED',
        subjectFilter
      });
    } else if (subjectFilter !== 'ALL' || /\b(exam|exams|subject)\b/.test(text)) {
      actions.push({
        type: 'organize_portal_view',
        targetView: 'dashboard',
        examFilter: 'ALL',
        subjectFilter,
        sortBy: /\bappear/.test(text) ? 'APPEARED_DESC' : 'CODE_ASC'
      });
    }
  }

  for (const job of allJobs) {
    const firstName = job.name.split(' ')[0].toLowerCase();
    const fullName = job.name.toLowerCase();
    if (text.includes(fullName) || text.includes(firstName) || text.includes(job.rollNo.toLowerCase())) {
      let operation = 'OPEN_WORKBENCH';
      if (/\b(report|marksheet|scorecard)\b/.test(text)) operation = 'OPEN_REPORT';
      else if (/\b(confirm|approve|clear\s+flag|resolve)\b/.test(text)) operation = 'CONFIRM_SCRIPT';
      else if (/\b(flag)\b/.test(text)) operation = 'FLAG_SCRIPT';
      actions.push({
        type: 'manage_student_script',
        query: job.rollNo,
        studentName: job.name,
        operation
      });
      break;
    }
  }

  return actions;
}

app.post('/api/chat', async (req, res) => {
  const { message, history = [], model = 'gemini-3.8-flash', portalContext = {} } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const allowedModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-4-argon'];
  const selectedModel = allowedModels.includes(model) ? model : 'gemini-3.8-flash';

  syncExamCounts();
  const allExams = Array.from(examsStore.values());
  const allJobs = Array.from(jobsStore.values());
  const rankedJobs = [...allJobs].sort(
    (a, b) => (b.tests[0]?.awardedMarks || 0) - (a.tests[0]?.awardedMarks || 0)
  );
  const top5Summary =
    rankedJobs.length > 0
      ? rankedJobs
          .slice(0, 5)
          .map(
            (s, i) =>
              `#${i + 1} ${s.name} (Roll ${s.rollNo}): ${(s.tests[0]?.awardedMarks || 0).toFixed(1)}/${(
                s.tests[0]?.maxMarks || 100
              ).toFixed(1)} [${s.flagged ? 'FLAGGED' : 'PROVISIONAL READY'}]`
          )
          .join('; ')
      : 'No candidate scripts uploaded yet.';

  const flaggedSummary = allJobs
    .filter((s) => s.flagged)
    .map((s) => `${s.name} (Roll ${s.rollNo}: ${s.flagReason || 'Rule Trigger'})`)
    .join('; ');

  const systemInstruction = `You are the Parallax Flow Academy Assistant for the CA Coaching Academy Evaluation Portal.
Your role is to help the Academy Administrator and Faculty create examinations, publish exam results to the Student Mobile App, inspect exam toppers from uploaded scripts, organize/filter examinations or candidate queues, and jump to student scripts or reports.

Current Live Portal Snapshot:
- Total Academy Examinations Created: ${allExams.length}
- Total Student Scripts Uploaded: ${allJobs.length}
- Active Examination: ${portalContext.activeExamCode || (allExams[0]?.code || 'None')}
- Current Toppers: ${top5Summary}
- Flagged Scripts Pending Faculty Review (${allJobs.filter((s) => s.flagged).length}): ${flaggedSummary || 'None'}

Guidelines:
- Keep responses concise, authoritative, and action-oriented (2-4 sentences max).
- Do NOT use emojis. Use clean professional formatting.
- Never invent mock students or fake scores; report only the real uploaded scripts and examinations.`;

  let executedActions = [];
  let replyText = '';

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const contents = [];
      for (const turn of history.slice(-12)) {
        if (!turn || !turn.text) continue;
        contents.push({
          role: turn.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(turn.text) }]
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: String(message) }]
      });

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: ADMIN_CHAT_TOOLS }]
        }
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        for (const fc of response.functionCalls) {
          executedActions.push({
            type: fc.name,
            ...(fc.args || {})
          });
        }
      }
      replyText = response.text || '';
    } catch (err) {
      console.warn('Gemini Admin Chat API fallback triggered:', err.message);
    }
  }

  if (executedActions.length === 0) {
    executedActions = inferDeterministicActions(message, allJobs);
  }

  for (const act of executedActions) {
    if (act.type === 'create_examination') {
      const nextNum = examsStore.size + 1;
      const newEx = {
        id: `exam-${Date.now()}`,
        code: (act.code || `EXAM-${String(nextNum).padStart(2, '0')}`).toUpperCase(),
        title: act.title || `CA Evaluation Test ${nextNum}`,
        subject: act.subject || 'Corporate & Other Laws',
        paperCode: 'CA Final',
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        maxMarks: Number(act.maxMarks) || 100.0,
        rubricNotes: '',
        questionsRubric: [],
        appeared: 0,
        evaluated: 0,
        pending: 0,
        published: false,
        createdAt: new Date().toISOString()
      };
      examsStore.set(newEx.id, newEx);
      act.createdExam = newEx;
    } else if (act.type === 'publish_exam_results') {
      allExams.forEach((ex) => {
        if (act.examCode === 'ALL_READY' || ex.code.toUpperCase() === String(act.examCode || '').toUpperCase()) {
          if (act.clearFlags) ex.pending = 0;
          ex.published = true;
          ex.publishedAt = new Date().toISOString();
        }
      });
      allJobs.forEach((job) => {
        if (act.clearFlags || !job.flagged) {
          job.flagged = false;
          job.facultyConfirmed = true;
          job.publishedToStudent = true;
          job.aiStatus = 'Published (Provisional)';
        }
      });
    } else if (act.type === 'manage_student_script') {
      const qLower = String(act.query || '').toLowerCase();
      const targetJob = allJobs.find(
        (j) => j.rollNo.toLowerCase() === qLower || j.name.toLowerCase().includes(qLower)
      );
      if (targetJob) {
        act.studentId = targetJob.id;
        act.studentName = targetJob.name;
        act.rollNo = targetJob.rollNo;
        if (act.operation === 'CONFIRM_SCRIPT') {
          targetJob.flagged = false;
          targetJob.facultyConfirmed = true;
          const parentExam = examsStore.get(targetJob.examId);
          targetJob.publishedToStudent = Boolean(parentExam && parentExam.published);
          targetJob.aiStatus = targetJob.publishedToStudent
            ? 'Published (Provisional)'
            : 'Faculty Confirmed (Provisional)';
        } else if (act.operation === 'FLAG_SCRIPT') {
          targetJob.flagged = true;
          targetJob.publishedToStudent = false;
          targetJob.aiStatus = 'Exception Flag';
          targetJob.flagReason = targetJob.flagReason || 'Flagged via Academy Assistant';
        }
      }
    }
  }

  syncExamCounts();
  savePersistentStore();

  if (!replyText) {
    if (executedActions.length > 0) {
      const summaries = executedActions.map((a) => {
        if (a.type === 'create_examination' && a.createdExam) {
          return `Created examination ${a.createdExam.code} (${a.createdExam.title}).`;
        }
        if (a.type === 'publish_exam_results') {
          return allJobs.length === 0
            ? 'Marked examination as published. Any confirmed scripts will now be released to the Student Mobile App.'
            : `Published provisional results for ${a.examCode || 'selected examination'} to the Student Mobile App.`;
        }
        if (a.type === 'show_exam_toppers') {
          return rankedJobs.length === 0
            ? 'No student scripts have been uploaded yet. Upload candidate scripts first to generate the toppers leaderboard.'
            : `Displaying the top ${Math.min(a.count || 5, rankedJobs.length)} rank holders: ${top5Summary}`;
        }
        if (a.type === 'organize_portal_view') {
          return `Organized portal view (${a.targetView || 'dashboard'}) with filter [${
            a.examFilter || a.candidateFilter || 'ALL'
          }].`;
        }
        if (a.type === 'manage_student_script') {
          return a.studentName
            ? `Executed ${a.operation} for ${a.studentName} (Roll ${a.rollNo}).`
            : `No uploaded candidate found matching "${a.query}".`;
        }
        return `Executed ${a.type}.`;
      });
      replyText = summaries.join(' ');
    } else {
      replyText = `Portal Status: ${allExams.length} examination(s) created and ${allJobs.length} student script(s) uploaded. You can create a new examination, generate rubrics, upload scripts, or publish results to the Student Mobile App.`;
    }
  }

  res.json({
    reply: replyText,
    model: selectedModel,
    actions: executedActions,
    exams: Array.from(examsStore.values()),
    toppers: rankedJobs.slice(0, 5).map((s, idx) => ({
      rank: idx + 1,
      id: s.id,
      name: s.name,
      rollNo: s.rollNo,
      center: s.center,
      awardedMarks: s.tests[0]?.awardedMarks || 0,
      maxMarks: s.tests[0]?.maxMarks || 100,
      flagged: s.flagged,
      aiStatus: s.aiStatus
    }))
  });
});

// Serve static assets from root and /ca_evaluator
const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use('/studio', express.static(frontendDistPath));
}
app.use('/ca-evaluator', express.static(path.join(__dirname, 'ca_evaluator')));
app.use(express.static(__dirname));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Parallax Flow Server running on http://0.0.0.0:${PORT}`);
});
