import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Sliders,
  Sparkles,
  Camera,
  Layers,
  Wand2,
  Move,
  CheckCircle2
} from 'lucide-react';

export default function UploadDropzone({
  onUpload,
  activeEngine,
  onLoadSample,
  onOpenScanner,
  isUploading
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [scanFilter, setScanFilter] = useState('magic_color');
  const [autoWarp, setAutoWarp] = useState(true);
  const [modelName, setModelName] = useState('gemini-3.5-flash-lite');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files[0]);
    }
  };

  const handleFiles = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('engine', activeEngine);
    formData.append('model_name', modelName);
    formData.append('scan_filter', scanFilter);
    formData.append('auto_warp', autoWarp);
    if (customPrompt.trim()) {
      formData.append('custom_prompt', customPrompt.trim());
    }

    onUpload(formData, file.name);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition ${
          isDragOver
            ? 'border-blue-500 bg-blue-500/5'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900/90'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          accept=".pdf,.zip,.png,.jpg,.jpeg,.webp,.tiff"
          className="hidden"
          disabled={isUploading}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <UploadCloud className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white tracking-tight">
              Select or drop handwritten documents
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Supports multi-page PDFs, scanned ZIP archives, or images (PNG, JPG, WEBP)
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {/* Live Camera Scanner Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenScanner();
              }}
              disabled={isUploading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition flex items-center gap-2"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Camera Scanner</span>
            </button>

            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium border border-slate-700 transition flex items-center gap-2"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Browse Files</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLoadSample();
              }}
              disabled={isUploading}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition flex items-center gap-2"
            >
              <span>Try Demo Sample</span>
            </button>
          </div>
        </div>
      </div>

      {/* Production Scanner Filter & Flattening Engine */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-300 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Scanning & Enhancement Options
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition"
          >
            {showAdvanced ? 'Hide Options' : 'Model & Guidance Options'}
          </button>
        </div>

        {/* Scan Filter Picker */}
        <div>
          <span className="text-[11px] font-medium text-slate-400 block mb-2">
            Image Filter Mode:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setScanFilter('magic_color')}
              className={`p-2.5 rounded-lg border text-left transition ${
                scanFilter === 'magic_color'
                  ? 'bg-slate-800 border-blue-500 text-white font-medium'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-medium text-slate-200">
                Magic Color
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Clean white page with vivid ink
              </div>
            </button>

            <button
              type="button"
              onClick={() => setScanFilter('clean_bw')}
              className={`p-2.5 rounded-lg border text-left transition ${
                scanFilter === 'clean_bw'
                  ? 'bg-slate-800 border-blue-500 text-white font-medium'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-medium text-slate-200">
                Clean B&W
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                High-contrast binary document
              </div>
            </button>

            <button
              type="button"
              onClick={() => setScanFilter('enhanced')}
              className={`p-2.5 rounded-lg border text-left transition ${
                scanFilter === 'enhanced'
                  ? 'bg-slate-800 border-blue-500 text-white font-medium'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-medium text-slate-200">
                Contrast Boost
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Boosts faint pencil/pen strokes
              </div>
            </button>

            <button
              type="button"
              onClick={() => setScanFilter('original')}
              className={`p-2.5 rounded-lg border text-left transition ${
                scanFilter === 'original'
                  ? 'bg-slate-800 border-blue-500 text-white font-medium'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-medium text-slate-200">
                Original Scan
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Keeps original camera photo
              </div>
            </button>
          </div>
        </div>

        {/* Perspective unwarp toggle */}
        <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
          <input
            type="checkbox"
            checked={autoWarp}
            onChange={(e) => setAutoWarp(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-700 bg-slate-900"
          />
          <div>
            <div className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-slate-400" />
              <span>Automatic 4-Corner Perspective Correction</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Detects paper boundaries and unwarps angled photos into flat rectangular pages
            </div>
          </div>
        </label>

        {/* Advanced Model & Custom Instructions */}
        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-3 animate-fadeIn">
            {activeEngine === 'gemini' && (
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-xs text-slate-400 font-medium">Vision Model:</span>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="model"
                    value="gemini-3.5-flash-lite"
                    checked={modelName === 'gemini-3.5-flash-lite'}
                    onChange={() => setModelName('gemini-3.5-flash-lite')}
                    className="text-blue-600"
                  />
                  <span>Gemini 3.5 Flash-Lite (Recommended)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="model"
                    value="gemini-2.5-flash"
                    checked={modelName === 'gemini-2.5-flash'}
                    onChange={() => setModelName('gemini-2.5-flash')}
                    className="text-blue-600"
                  />
                  <span>Gemini 2.5 Flash</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="model"
                    value="gemini-2.5-pro"
                    checked={modelName === 'gemini-2.5-pro'}
                    onChange={() => setModelName('gemini-2.5-pro')}
                    className="text-blue-600"
                  />
                  <span>Gemini 2.5 Pro</span>
                </label>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Custom OCR Guidance:
              </label>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. Focus on cursive notes, transcribe tabular columns"
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
