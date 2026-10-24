import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import UploadDropzone from './components/UploadDropzone';
import BatchProgressBanner from './components/BatchProgressBanner';
import DocumentViewer from './components/DocumentViewer';
import TranscriptionEditor from './components/TranscriptionEditor';
import SettingsModal from './components/SettingsModal';
import ExportModal from './components/ExportModal';
import JobsHistoryModal from './components/JobsHistoryModal';
import CameraScannerModal from './components/CameraScannerModal';
import CornerAdjustmentModal from './components/CornerAdjustmentModal';
import EvaluationStudio from './components/EvaluationStudio';
import {
  fetchSystemConfig,
  uploadDocument,
  fetchJobDetails,
  updatePageTranscription,
  getStoredApiKey,
  triggerSampleRun,
  uploadCameraBatch
} from './api';
import {
  FileText,
  Sparkles,
  ShieldCheck,
  Zap,
  Layers,
  ArrowLeft,
  ArrowRight,
  Camera,
  Sliders,
  GraduationCap
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('grading'); // 'grading' | 'scanner'
  const [systemConfig, setSystemConfig] = useState(null);
  const [activeEngine, setActiveEngine] = useState('gemini');
  const [currentJob, setCurrentJob] = useState(null);
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);

  // Load config on mount
  useEffect(() => {
    fetchSystemConfig()
      .then((cfg) => {
        setSystemConfig(cfg);
        const hasKey = !!getStoredApiKey() || cfg.hasEnvGeminiKey;
        if (!hasKey) {
          setActiveEngine('easyocr');
        }
      })
      .catch(() => {});
  }, []);

  // Poll for job updates while processing
  const pollTimerRef = useRef(null);

  useEffect(() => {
    if (currentJob && (currentJob.status === 'PROCESSING' || currentJob.status === 'QUEUED')) {
      pollTimerRef.current = setInterval(async () => {
        try {
          const updated = await fetchJobDetails(currentJob.job_id);
          setCurrentJob(updated);
          if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
            clearInterval(pollTimerRef.current);
          }
        } catch (err) {
          console.error('Polling error', err);
        }
      }, 1500);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [currentJob?.job_id, currentJob?.status]);

  const handleUpload = async (formData, filename) => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const job = await uploadDocument(formData);
      setCurrentJob(job);
      setCurrentPageNum(1);
    } catch (err) {
      setErrorMessage(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCameraBatchSubmit = async (pagesArray, scanFilter) => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const job = await uploadCameraBatch(
        pagesArray,
        activeEngine,
        'gemini-3.5-flash-lite',
        scanFilter
      );
      setCurrentJob(job);
      setCurrentPageNum(1);
    } catch (err) {
      setErrorMessage(err.message || 'Camera batch submission failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLoadSample = async () => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const job = await triggerSampleRun(activeEngine, 'easyocr-v1', 'magic_color');
      setCurrentJob(job);
      setCurrentPageNum(1);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to trigger sample test');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveEdit = async (pageNum, newMarkdown) => {
    if (!currentJob) return;
    const updatedPage = await updatePageTranscription(currentJob.job_id, pageNum, newMarkdown);
    setCurrentJob((prev) => {
      if (!prev) return prev;
      const newPages = prev.pages.map((p) =>
        p.page_number === pageNum ? { ...p, ...updatedPage } : p
      );
      return { ...prev, pages: newPages };
    });
  };

  const handlePageRescanned = (pageNum, updatedPage) => {
    setCurrentJob((prev) => {
      if (!prev) return prev;
      const newPages = prev.pages.map((p) =>
        p.page_number === pageNum ? { ...p, ...updatedPage } : p
      );
      return { ...prev, pages: newPages };
    });
  };

  const handleSelectJobFromHistory = async (jobId) => {
    try {
      const job = await fetchJobDetails(jobId);
      setCurrentJob(job);
      setCurrentPageNum(1);
    } catch (err) {
      setErrorMessage('Could not load historical job');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <Header
        systemConfig={systemConfig}
        activeEngine={activeEngine}
        setActiveEngine={setActiveEngine}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHistory={() => setShowHistory(true)}
        onLoadSample={handleLoadSample}
        onOpenScanner={() => setShowCameraScanner(true)}
        isProcessing={isUploading || currentJob?.status === 'PROCESSING'}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {errorMessage && (
          <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center justify-between animate-fadeIn">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs underline text-rose-400 hover:text-rose-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab 1: AI Grading & Rubric Studio */}
        {activeTab === 'grading' ? (
          <EvaluationStudio activeEngine={activeEngine} />
        ) : (
          /* Tab 2: Document Scanner & OCR Transcription */
          !currentJob ? (
            <div className="flex-1 flex flex-col justify-center items-center py-4 space-y-6 animate-fadeIn">
              {/* Callout to switch to Grading Studio */}
              <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                      <span>Exam Grading & Rubric Studio</span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.2 rounded font-medium">Available</span>
                    </h4>
                    <p className="text-xs text-slate-400">
                      Evaluate student handwritten answer sheets against rubric schemes, step marks, and keywords from Excel.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('grading')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex-shrink-0 transition"
                >
                  <span>Open Grading Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Clean Hero Copy */}
              <div className="text-center space-y-1.5 max-w-2xl">
                <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  Handwritten Document OCR & Processing
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Automatic edge detection, perspective flattening, clean background enhancement, and high-accuracy text extraction.
                </p>
              </div>

              {/* Ingestion Dropzone & Live Camera Action */}
              <UploadDropzone
                onUpload={handleUpload}
                activeEngine={activeEngine}
                onLoadSample={handleLoadSample}
                onOpenScanner={() => setShowCameraScanner(true)}
                isUploading={isUploading}
              />

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl w-full pt-2">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-semibold text-white">4-Corner Perspective Unwarp</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Automatic paper boundary detection and keystone correction straightens angled camera photos into flat sheets.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-semibold text-white">Document Image Cleaning</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Background subtraction eliminates shadow glare and discolored paper while keeping pen ink crisp and readable.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-semibold text-white">Side-by-Side Review</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Instant split-screen inspection with live crop readjustment, single-page rescanning, and multi-format export.
                  </p>
                </div>
              </div>
            </div>
        ) : (
          /* View 2: When Job is Active / Finished -> Full Side-by-Side Verification Studio */
          <div className="flex-1 flex flex-col space-y-4 animate-fadeIn">
            {/* Top Navigation Row: Back to Upload + Progress Banner */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setCurrentJob(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Upload New Batch</span>
              </button>

              <div className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">
                Batch: <strong className="text-white">{currentJob.filename}</strong>
              </div>
            </div>

            {/* Batch Progress Banner */}
            <BatchProgressBanner job={currentJob} />

            {/* Split Screen Workspace (50% Viewer, 50% Editor) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[600px]">
              {/* Left Column: Interactive Document Canvas */}
              <div className="h-full min-h-[480px]">
                <DocumentViewer
                  job={currentJob}
                  currentPageNum={currentPageNum}
                  onSelectPage={setCurrentPageNum}
                  onOpenCropModal={() => setShowCropModal(true)}
                />
              </div>

              {/* Right Column: Transcription & Human Review */}
              <div className="h-full min-h-[480px]">
                <TranscriptionEditor
                  job={currentJob}
                  currentPageNum={currentPageNum}
                  onSaveEdit={handleSaveEdit}
                  onOpenExport={() => setShowExport(true)}
                />
              </div>
            </div>
          </div>
        ))}
      </main>

      {/* Modals */}
      <CameraScannerModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onSubmitBatch={handleCameraBatchSubmit}
        activeEngine={activeEngine}
      />

      <CornerAdjustmentModal
        isOpen={showCropModal}
        onClose={() => setShowCropModal(false)}
        job={currentJob}
        pageNum={currentPageNum}
        onPageRescanned={handlePageRescanned}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        systemConfig={systemConfig}
        onSaveKey={() => {}}
      />

      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        job={currentJob}
        currentPageNum={currentPageNum}
      />

      <JobsHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelectJob={handleSelectJobFromHistory}
        currentJobId={currentJob?.job_id}
      />
    </div>
  );
}
