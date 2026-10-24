import React from 'react';
import { X, ShieldCheck, Cpu, Sparkles } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, systemConfig }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">OCR Engine & Model Settings</h2>
            <p className="text-xs text-slate-400">Server-side handwriting recognition & rubric grading configuration</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Server-Side Gemini Vision Active</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Multimodal Vision OCR and step-wise rubric evaluation are configured via server-side environment credentials (<code>GEMINI_API_KEY</code>).
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span>Deterministic & Offline Fallback Active</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {systemConfig?.appName || 'ParallaxFlow OCR'} automatically falls back to deterministic statutory keyword and rubric grading when running in offline mode.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition shadow-sm"
            >
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
