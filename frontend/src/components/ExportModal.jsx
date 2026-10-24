import React, { useState } from 'react';
import { X, Download, FileText, Code2, Archive, CheckCircle } from 'lucide-react';
import { getExportUrl } from '../api';

export default function ExportModal({ isOpen, onClose, job, currentPageNum }) {
  const [scope, setScope] = useState('full'); // 'full' | 'page'

  if (!isOpen || !job) return null;

  const pageParam = scope === 'page' ? currentPageNum : null;

  const exportOptions = [
    {
      id: 'md',
      title: 'Markdown (.md)',
      desc: 'Clean GitHub-flavored markdown with preserved headings, lists & tables',
      icon: FileText,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    },
    {
      id: 'txt',
      title: 'Plain Text (.txt)',
      desc: 'Raw extracted text with all formatting stripped, ideal for NLP/LLMs',
      icon: FileText,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    },
    {
      id: 'json',
      title: 'Structured JSON (.json)',
      desc: 'Complete document tree with page numbers, confidence ratings & entities',
      icon: Code2,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    },
    {
      id: 'zip',
      title: 'Complete Archive (.zip)',
      desc: 'Full bundle including enhanced 300 DPI page images and individual page files',
      icon: Archive,
      color: 'text-slate-300 bg-slate-800 border-slate-700'
    }
  ];

  const handleDownload = (format) => {
    const url = getExportUrl(job.job_id, format, pageParam);
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Export OCR Transcriptions</h2>
            <p className="text-xs text-slate-400">Download formatted outputs for production workflows</p>
          </div>
        </div>

        {/* Scope selector */}
        {job.total_pages > 1 && (
          <div className="mb-4 bg-slate-950/60 p-1 rounded-xl border border-slate-800 flex items-center text-xs">
            <button
              onClick={() => setScope('full')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                scope === 'full' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Pages ({job.total_pages} Pages Combined)
            </button>
            <button
              onClick={() => setScope('page')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                scope === 'page' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Current Page (Page {currentPageNum}) Only
            </button>
          </div>
        )}

        {/* Export Formats List */}
        <div className="space-y-2.5">
          {exportOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => handleDownload(opt.id)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-950/50 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-700 transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${opt.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-200 group-hover:text-white">
                      {opt.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {opt.desc}
                    </div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition" />
              </button>
            );
          })}
        </div>

        <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
