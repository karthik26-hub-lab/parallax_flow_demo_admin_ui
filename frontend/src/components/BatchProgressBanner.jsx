import React from 'react';
import { Loader2, CheckCircle, AlertTriangle, Clock, Layers } from 'lucide-react';

export default function BatchProgressBanner({ job }) {
  if (!job) return null;

  const total = job.total_pages || 1;
  const completed = job.completed_pages || 0;
  const percent = Math.min(100, Math.round((completed / total) * 100));
  const isFinished = job.status === 'COMPLETED';
  const isFailed = job.status === 'FAILED';

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-2.5">
      {/* Top row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            {isFinished ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : isFailed ? (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-semibold text-white tracking-tight">
                {isFinished
                  ? `Extraction Complete (${total} ${total === 1 ? 'Page' : 'Pages'})`
                  : isFailed
                  ? 'Batch Extraction Error'
                  : `Processing Document: ${job.filename}`}
              </h3>
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                  isFinished
                    ? 'bg-slate-950 text-emerald-400 border border-emerald-800/40'
                    : isFailed
                    ? 'bg-slate-950 text-rose-400 border border-rose-800/40'
                    : 'bg-slate-950 text-blue-400 border border-blue-800/40'
                }`}
              >
                {job.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Engine: <span className="text-slate-300">{job.engine}</span>
              {job.total_processing_time > 0 && ` • Completed in ${job.total_processing_time}s`}
            </p>
          </div>
        </div>

        {/* Progress percent counter */}
        <div className="text-right">
          <div className="text-xs sm:text-sm font-mono font-medium text-slate-200">
            {completed} / {total} Pages ({percent}%)
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isFinished
              ? 'bg-emerald-500'
              : isFailed
              ? 'bg-rose-500'
              : 'bg-blue-600'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Individual Page Micro-Status Chips */}
      {job.pages && job.pages.length > 1 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {job.pages.map((p) => {
            const isPageDone = p.status === 'COMPLETED';
            const isPageActive = p.status === 'PREPROCESSING' || p.status === 'TRANSCRIBING';
            const isPageErr = p.status === 'ERROR';

            return (
              <div
                key={p.page_number}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 transition ${
                  isPageDone
                    ? 'bg-slate-950 text-emerald-400 border-emerald-900/40'
                    : isPageErr
                    ? 'bg-slate-950 text-rose-400 border-rose-900/40'
                    : isPageActive
                    ? 'bg-slate-950 text-blue-300 border-blue-900/50'
                    : 'bg-slate-950 text-slate-500 border-slate-800'
                }`}
                title={`Page ${p.page_number}: ${p.status}`}
              >
                {isPageActive && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                <span>P{p.page_number}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
