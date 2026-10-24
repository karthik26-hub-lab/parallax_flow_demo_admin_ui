import React from 'react';
import { Sparkles, Key, History, FileText, Cpu, CheckCircle2, AlertCircle, Camera, GraduationCap } from 'lucide-react';
import { getStoredApiKey } from '../api';

export default function Header({
  systemConfig,
  activeEngine,
  setActiveEngine,
  activeTab = 'grading',
  setActiveTab,
  onOpenSettings,
  onOpenHistory,
  onLoadSample,
  onOpenScanner,
  isProcessing
}) {
  const hasLocalKey = !!getStoredApiKey();
  const hasEnvKey = systemConfig?.hasEnvGeminiKey;
  const isKeyAvailable = hasLocalKey || hasEnvKey;

  return (
    <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-30 px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200">
          <FileText className="w-4 h-4 text-slate-300" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight">
              ParallaxFlow <span className="text-slate-400 font-normal">OCR</span>
            </h1>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              Handwriting & Evaluation
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            Document processing & automated rubric grading
          </p>
        </div>
      </div>

      {/* View Switcher: Document OCR vs AI Grading Studio */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-0.5 flex items-center text-xs">
        <button
          onClick={() => setActiveTab('scanner')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            activeTab === 'scanner'
              ? 'bg-slate-800 text-white border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Document Scanner & OCR Transcription"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Scanner & OCR</span>
        </button>
        <button
          onClick={() => setActiveTab('grading')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
            activeTab === 'grading'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Automated Question & Rubric Grading Studio"
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Grading Studio</span>
          <span className={`text-[10px] px-1 py-0.2 rounded font-medium ${
            activeTab === 'grading'
              ? 'bg-blue-700 text-white'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            Rubric
          </span>
        </button>
        <a
          href="/"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-slate-400 hover:text-white transition"
          title="Open CA Descriptive Answer AI Evaluator Portal"
        >
          <span>CA Portal &rarr;</span>
        </a>
      </div>

      {/* Engine & Action Controls */}
      <div className="flex items-center gap-2">
        {/* Engine Switcher */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-0.5 flex items-center text-xs">
          <button
            onClick={() => setActiveEngine('gemini')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              activeEngine === 'gemini'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Multimodal Vision AI (State of the art accuracy for handwriting)"
          >
            <span>Vision AI</span>
          </button>
          <button
            onClick={() => setActiveEngine('easyocr')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              activeEngine === 'easyocr'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="100% Offline Local Engine (No cloud API required)"
          >
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span>EasyOCR Offline</span>
          </button>
        </div>

        {/* Camera Scanner Button */}
        <button
          onClick={onOpenScanner}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition disabled:opacity-50"
          title="Open Live Camera Scanner with Document Unwarping"
        >
          <Camera className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Camera</span>
        </button>

        {/* Load Sample Demo */}
        <button
          onClick={onLoadSample}
          disabled={isProcessing}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition disabled:opacity-50"
          title="Try with pre-generated 3-page handwritten notebook"
        >
          <span>Demo</span>
        </button>

        {/* Job History */}
        <button
          onClick={onOpenHistory}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition"
          title="Batch History"
        >
          <History className="w-4 h-4" />
        </button>

        {/* API Key Modal Button */}
        <button
          onClick={onOpenSettings}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            isKeyAvailable
              ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              : 'bg-amber-950/40 hover:bg-amber-950/60 text-amber-300 border-amber-800/60'
          }`}
          title="Configure API Keys & Models"
        >
          <Key className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {isKeyAvailable ? 'API Key Active' : 'Set API Key'}
          </span>
          {isKeyAvailable ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>
      </div>
    </header>
  );
}
