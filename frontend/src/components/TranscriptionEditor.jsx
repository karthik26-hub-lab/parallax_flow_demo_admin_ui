import React, { useState, useEffect } from 'react';
import {
  FileText,
  Edit3,
  Eye,
  Copy,
  Check,
  Save,
  Download,
  Search,
  Sparkles,
  Layers,
  Tag,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function TranscriptionEditor({
  job,
  currentPageNum,
  onSaveEdit,
  onOpenExport
}) {
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'edit' | 'metadata' | 'full'
  const [currentText, setCurrentText] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentPage = job?.pages?.find((p) => p.page_number === currentPageNum) || job?.pages?.[0];

  useEffect(() => {
    if (currentPage) {
      setCurrentText(currentPage.transcription_markdown || '');
      setSavedSuccess(false);
    }
  }, [currentPage?.page_number, currentPage?.transcription_markdown]);

  if (!job || !currentPage) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl">
        Select a page to view transcription
      </div>
    );
  }

  const handleCopy = (textToCopy) => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveEdit(currentPage.page_number, currentText);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const confidenceColor =
    currentPage.estimated_confidence_percent >= 80
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : currentPage.estimated_confidence_percent >= 50
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

  return (
    <div className="flex flex-col h-full bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Top Bar */}
      {/* Top Bar */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
              activeTab === 'preview'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Page Preview</span>
          </button>

          <button
            onClick={() => setActiveTab('edit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
              activeTab === 'edit'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Human Edit</span>
          </button>

          <button
            onClick={() => setActiveTab('metadata')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
              activeTab === 'metadata'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Metadata</span>
          </button>

          {job.total_pages > 1 && (
            <button
              onClick={() => setActiveTab('full')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
                activeTab === 'full'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Full Document</span>
            </button>
          )}
        </div>

        {/* Action Buttons: Copy, Save, Export */}
        <div className="flex items-center gap-2">
          {activeTab === 'edit' && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Edits</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => handleCopy(activeTab === 'full' ? job.combined_markdown : currentText)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={onOpenExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Metrics Header Strip */}
      <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-mono">
            Chars: <strong className="text-slate-200">{currentPage.char_count || currentText.length}</strong>
          </span>
          <span className="font-mono">
            Words: <strong className="text-slate-200">{currentPage.word_count || currentText.split(/\s+/).filter(Boolean).length}</strong>
          </span>
          {currentPage.processing_time_sec > 0 && (
            <span className="font-mono">
              Speed: <strong className="text-slate-200">{currentPage.processing_time_sec}s</strong>
            </span>
          )}
        </div>

        {currentPage.estimated_confidence_percent > 0 && (
          <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-medium border ${confidenceColor}`}>
            Confidence: {currentPage.estimated_confidence_percent}% ({currentPage.confidence_rating})
          </span>
        )}
      </div>

      {/* Body Canvas */}
      <div className="flex-1 overflow-auto p-4 text-slate-200">
        {activeTab === 'preview' && (
          <div className="prose prose-invert max-w-none space-y-3 font-sans text-sm leading-relaxed select-text">
            {currentText ? (
              <pre className="whitespace-pre-wrap font-sans bg-transparent p-0 border-0 text-slate-200 leading-relaxed font-normal">
                {currentText}
              </pre>
            ) : (
              <div className="text-slate-500 italic">No text recognized for this page yet.</div>
            )}
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="h-full flex flex-col space-y-2">
            <div className="text-xs text-slate-400">
              Directly edit and proofread the extracted text. Click <strong>Save Edits</strong> above to preserve updates.
            </div>
            <textarea
              value={currentText}
              onChange={(e) => setCurrentText(e.target.value)}
              className="flex-1 w-full min-h-[400px] bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs sm:text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed resize-none"
              placeholder="Page text transcription..."
            />
          </div>
        )}

        {activeTab === 'metadata' && (
          <div className="space-y-3 max-w-xl text-xs">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="font-medium text-slate-300">Page Summary</div>
              <p className="text-slate-400">{currentPage.summary || 'Summary unavailable'}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 block">Handwriting Style</span>
                <span className="font-medium text-slate-200 text-xs">{currentPage.handwriting_style || 'General'}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 block">Document Layout</span>
                <span className="font-medium text-slate-200 text-xs">{currentPage.document_type || 'Standard'}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 block">Engine Used</span>
                <span className="font-medium text-blue-400 text-xs">{currentPage.engine_used || job.engine}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 block">Language</span>
                <span className="font-medium text-slate-200 text-xs">{currentPage.detected_language || 'English'}</span>
              </div>
            </div>

            {currentPage.key_entities && currentPage.key_entities.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-medium text-slate-300">Extracted Topics & Entities</div>
                <div className="flex flex-wrap gap-1">
                  {currentPage.key_entities.map((ent, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[11px]">
                      {ent}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'full' && (
          <div className="prose prose-invert max-w-none space-y-3 font-sans text-sm leading-relaxed">
            <pre className="whitespace-pre-wrap font-sans bg-transparent p-0 border-0 text-slate-200 leading-relaxed font-normal">
              {job.combined_markdown}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
