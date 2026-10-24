import React, { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  Sparkles,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  UploadCloud,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Award,
  Layers,
  BookOpen,
  Check,
  X,
  RefreshCw,
  Loader2
} from 'lucide-react';
import {
  triggerDemoEvaluation,
  uploadCustomEvaluation,
  fetchEvaluationJobDetails,
  getEvaluationExportUrl
} from '../api';

export default function EvaluationStudio({ activeEngine }) {
  const [activeJob, setActiveJob] = useState(null);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [uploadMode, setUploadMode] = useState('demo'); // 'demo' | 'custom'
  const [errorMessage, setErrorMessage] = useState(null);

  // Custom upload state
  const [examTitle, setExamTitle] = useState('Law Test - 1');
  const [studentFile, setStudentFile] = useState(null);
  const [rubricFile, setRubricFile] = useState(null);

  const pollTimerRef = useRef(null);

  // Poll for job completion while running
  useEffect(() => {
    if (activeJob && (activeJob.status === 'EVALUATING' || activeJob.status === 'EXTRACTING_OCR' || activeJob.status === 'QUEUED')) {
      pollTimerRef.current = setInterval(async () => {
        try {
          const updated = await fetchEvaluationJobDetails(activeJob.job_id);
          setActiveJob(updated);
          if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
            clearInterval(pollTimerRef.current);
            setIsEvaluating(false);
          }
        } catch (err) {
          console.error(err);
        }
      }, 1500);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeJob?.job_id, activeJob?.status]);

  const handleRunDemo = async () => {
    setIsEvaluating(true);
    setErrorMessage(null);
    try {
      const job = await triggerDemoEvaluation('gemini-3.5-flash-lite');
      setActiveJob(job);
      setSelectedQuestionIndex(0);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to start demo evaluation');
      setIsEvaluating(false);
    }
  };

  const handleCustomSubmit = async (e) => {
    e.preventDefault();
    if (!studentFile || !rubricFile) {
      setErrorMessage('Please select both the handwritten answer file and the rubric spreadsheet.');
      return;
    }

    setIsEvaluating(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('student_file', studentFile);
    formData.append('rubric_file', rubricFile);
    formData.append('title', examTitle);
    formData.append('model_name', 'gemini-3.5-flash-lite');
    formData.append('ocr_engine', activeEngine);

    try {
      const job = await uploadCustomEvaluation(formData);
      setActiveJob(job);
      setSelectedQuestionIndex(0);
    } catch (err) {
      setErrorMessage(err.message || 'Custom evaluation failed');
      setIsEvaluating(false);
    }
  };

  const handleDownloadReport = (format) => {
    if (!activeJob) return;
    const url = getEvaluationExportUrl(activeJob.job_id, format);
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedQuestion = activeJob?.questions?.[selectedQuestionIndex] || activeJob?.questions?.[0];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 animate-fadeIn pb-12">
      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="underline text-rose-400 hover:text-rose-200">
            Dismiss
          </button>
        </div>
      )}

      {/* State 1: When no completed evaluation is selected -> Ingestion Hub */}
      {(!activeJob || (activeJob.status !== 'COMPLETED' && !isEvaluating)) && (
        <div className="space-y-5">
          {/* Hero Banner */}
          <div className="text-center space-y-1.5 max-w-2xl mx-auto pt-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium mb-1">
              <Award className="w-3.5 h-3.5 text-slate-400" />
              <span>Automated Rubric & Step-Wise Grading</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Exam & Assignment Evaluation Studio
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Grade handwritten answer sheets against model answers, step-by-step criteria, and mandatory keywords.
            </p>
          </div>

          {/* Mode Selector */}
          <div className="max-w-xs mx-auto bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex items-center text-xs">
            <button
              onClick={() => setUploadMode('demo')}
              className={`flex-1 py-1.5 rounded-md font-medium transition ${
                uploadMode === 'demo' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Demo Set (Law Test - 1)
            </button>
            <button
              onClick={() => setUploadMode('custom')}
              className={`flex-1 py-1.5 rounded-md font-medium transition ${
                uploadMode === 'custom' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Custom Upload
            </button>
          </div>

          {/* Demo Mode Card */}
          {uploadMode === 'demo' && (
            <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
                  <GraduationCap className="w-5 h-5 text-blue-400" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-white">Law Test - 1 (Corporate & Other Laws)</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Includes 8 Questions, 10 handwritten student pages, and the multi-sheet Rubric spreadsheet (29 steps, keywords, and criteria).
                  </p>
                </div>
              </div>

              {/* Data Items Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-slate-500 block text-[11px]">Question Paper</span>
                  <strong className="text-slate-200 block">8 Exam Questions</strong>
                  <span className="text-[11px] text-slate-400">Companies & LLP Act</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-slate-500 block text-[11px]">Answer Sheet</span>
                  <strong className="text-slate-200 block">10 Handwritten Pages</strong>
                  <span className="text-[11px] text-slate-400">Transcribed & Verified</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-0.5">
                  <span className="text-slate-500 block text-[11px]">Rubric Scheme</span>
                  <strong className="text-slate-200 block">42 Total Marks</strong>
                  <span className="text-[11px] text-slate-400">Step Marks & Keywords</span>
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={handleRunDemo}
                  disabled={isEvaluating}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-medium transition disabled:opacity-50"
                >
                  <Award className="w-4 h-4" />
                  <span>Start Step-Wise Evaluation</span>
                </button>
              </div>
            </div>
          )}

          {/* Custom Upload Form */}
          {uploadMode === 'custom' && (
            <form onSubmit={handleCustomSubmit} className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-400">
                  Exam Title / Test Name
                </label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
                  placeholder="e.g. Corporate Law Midterm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* File 1: Student Handwritten Answers */}
                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span>Student Handwritten Script</span>
                  </div>
                  <p className="text-[11px] text-slate-500">PDF, ZIP, or photos of answer pages</p>
                  <label className="block mt-1">
                    <input
                      type="file"
                      accept=".pdf,.zip,.png,.jpg,.jpeg"
                      onChange={(e) => setStudentFile(e.target.files?.[0] || null)}
                      className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                    />
                  </label>
                  {studentFile && (
                    <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono truncate">
                      <Check className="w-3 h-3" /> {studentFile.name}
                    </div>
                  )}
                </div>

                {/* File 2: Rubric Scheme */}
                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                    <span>Rubric & Marking Scheme</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Excel (.xlsx) or CSV with steps & keywords</p>
                  <label className="block mt-1">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => setRubricFile(e.target.files?.[0] || null)}
                      className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                    />
                  </label>
                  {rubricFile && (
                    <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono truncate">
                      <Check className="w-3 h-3" /> {rubricFile.name}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isEvaluating}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-medium transition disabled:opacity-50"
              >
                <Award className="w-4 h-4" />
                <span>Upload & Evaluate Answer Script</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* State 2: Evaluating in progress */}
      {isEvaluating && (
        <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-3 animate-fadeIn">
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 mx-auto">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">Evaluating Answer Script...</h3>
            <p className="text-xs text-slate-400">
              Grading handwritten answers against step-by-step criteria, marks, and mandatory keywords.
            </p>
          </div>
          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div className="h-full bg-blue-600 w-3/4 rounded-full" />
          </div>
        </div>
      )}

      {/* State 3: Completed Evaluation Report Dashboard */}
      {activeJob && activeJob.status === 'COMPLETED' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Top Score Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 flex-shrink-0">
                  <Award className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">{activeJob.title}</h2>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {activeJob.performance_grade || 'Graded'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluated {activeJob.total_questions} questions in {activeJob.evaluation_time_sec}s
                  </p>
                </div>
              </div>

              {/* Score Metric Badges */}
              <div className="flex items-center gap-2.5">
                <div className="bg-slate-950 border border-slate-800 px-3.5 py-1.5 rounded-lg text-right">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Score</span>
                  <div className="text-base font-bold font-mono text-white">
                    {activeJob.total_marks_awarded} <span className="text-xs text-slate-500">/ {activeJob.total_max_marks}</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 px-3.5 py-1.5 rounded-lg text-right">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Result</span>
                  <div className="text-base font-bold font-mono text-blue-400">
                    {activeJob.percentage}%
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Bar & Export Toolbar */}
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex-1 max-w-xs h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${activeJob.percentage}%` }}
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadReport('md')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium transition"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Markdown</span>
                </button>
                <button
                  onClick={() => handleDownloadReport('csv')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={() => handleDownloadReport('json')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium transition"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>JSON</span>
                </button>
                <button
                  onClick={() => setActiveJob(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs font-medium transition ml-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>New Evaluation</span>
                </button>
              </div>
            </div>
          </div>

          {/* Question Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {activeJob.questions?.map((q, idx) => {
              const isSelected = idx === selectedQuestionIndex;
              const isFull = q.marks_awarded >= q.max_marks;

              return (
                <button
                  key={q.question_id || idx}
                  onClick={() => setSelectedQuestionIndex(idx)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition flex-shrink-0 ${
                    isSelected
                      ? 'bg-slate-800 text-white border-slate-700'
                      : 'bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                >
                  <span>Q{q.question_no}</span>
                  <span
                    className={`font-mono text-[10px] px-1 py-0.2 rounded ${
                      isSelected
                        ? 'bg-slate-950 text-white'
                        : isFull
                        ? 'bg-slate-950 text-emerald-400 border border-emerald-900/40'
                        : 'bg-slate-950 text-amber-400 border border-amber-900/40'
                    }`}
                  >
                    {q.marks_awarded}/{q.max_marks}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected Question Detail Studio (Split Workspace) */}
          {selectedQuestion && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Column: Student Handwritten Answer (OCR & Page Info) */}
              <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Student Handwritten Script (Q{selectedQuestion.question_no})</span>
                  </div>
                  {selectedQuestion.page_numbers && selectedQuestion.page_numbers.length > 0 && (
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      Page {selectedQuestion.page_numbers.join(', ')}
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 overflow-y-auto space-y-3.5 max-h-[600px]">
                  {/* Question Statement */}
                  <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block">
                      Question Statement
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {selectedQuestion.question_text}
                    </p>
                    {selectedQuestion.section_reference && (
                      <span className="inline-block text-[10px] text-slate-400 font-mono mt-1">
                        Ref: {selectedQuestion.section_reference}
                      </span>
                    )}
                  </div>

                  {/* Student's Transcribed Text */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                      Transcribed Handwritten Answer:
                    </span>
                    <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                      {selectedQuestion.student_text || '_No answer found for this question._'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Step-Wise Rubric, Keywords & Examiner Critique */}
              <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Rubric Breakdown & Evaluation</span>
                  </div>
                  <span className="text-xs font-mono font-medium text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    {selectedQuestion.marks_awarded} / {selectedQuestion.max_marks} Marks ({selectedQuestion.percentage}%)
                  </span>
                </div>

                <div className="p-4 flex-1 overflow-y-auto space-y-4 max-h-[600px]">
                  {/* Step-by-Step Rubric Table */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                      Step-by-Step Marking Rubric:
                    </span>
                    <div className="space-y-2">
                      {selectedQuestion.steps_evaluation?.map((step) => {
                        const isFull = step.marks_awarded >= step.max_marks;
                        const isZero = step.marks_awarded === 0;

                        return (
                          <div
                            key={step.step_no}
                            className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-medium text-slate-200">
                                Step {step.step_no}: {step.subpart}
                              </span>
                              <span
                                className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                                  isFull
                                    ? 'bg-slate-900 text-emerald-400 border border-emerald-800/40'
                                    : isZero
                                    ? 'bg-slate-900 text-rose-400 border border-rose-800/40'
                                    : 'bg-slate-900 text-amber-400 border border-amber-800/40'
                                }`}
                              >
                                {step.marks_awarded} / {step.max_marks}
                              </span>
                            </div>

                            {step.feedback && (
                              <p className="text-xs text-slate-400 leading-relaxed bg-slate-900/60 p-2 rounded border border-slate-800">
                                {step.feedback}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mandatory Keywords Matrix */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                      Mandatory Keywords Analysis:
                    </span>
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                      {selectedQuestion.keywords_matched?.length > 0 && (
                        <div>
                          <span className="text-[10px] text-emerald-400 font-medium block mb-1">
                            Matched Keywords ({selectedQuestion.keywords_matched.length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {selectedQuestion.keywords_matched.map((kw, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-slate-900 text-emerald-300 border border-emerald-800/40 text-[11px] font-mono"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedQuestion.keywords_missed?.length > 0 && (
                        <div>
                          <span className="text-[10px] text-amber-400 font-medium block mb-1">
                            Omitted Terms ({selectedQuestion.keywords_missed.length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {selectedQuestion.keywords_missed.map((kw, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-slate-900 text-amber-300 border border-amber-800/40 text-[11px] font-mono"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Examiner Remarks */}
                  {selectedQuestion.examiner_remarks && (
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] font-semibold text-slate-300 block">
                        Examiner's Remarks:
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {selectedQuestion.examiner_remarks}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
