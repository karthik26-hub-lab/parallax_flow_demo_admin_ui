import React, { useEffect, useState } from 'react';
import { X, History, FileText, CheckCircle2, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { fetchJobs } from '../api';

export default function JobsHistoryModal({ isOpen, onClose, onSelectJob, currentJobId }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchJobs()
        .then((data) => setJobs(data))
        .catch(() => setJobs([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

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
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Batch Jobs History</h2>
            <p className="text-xs text-slate-400">Previously transcribed documents in this session</p>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="text-center py-8 text-xs text-slate-500">Loading jobs...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">No document batches processed yet.</div>
          ) : (
            jobs.map((j) => {
              const isSelected = j.job_id === currentJobId;
              const isDone = j.status === 'COMPLETED';

              return (
                <button
                  key={j.job_id}
                  onClick={() => {
                    onSelectJob(j.job_id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition ${
                    isSelected
                      ? 'bg-blue-600/15 border-blue-500/40'
                      : 'bg-slate-950/40 hover:bg-slate-800/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200 truncate max-w-[200px] sm:max-w-[260px]">
                        {j.filename}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{j.total_pages} {j.total_pages === 1 ? 'Page' : 'Pages'}</span>
                        <span>•</span>
                        <span>{j.engine}</span>
                        {j.total_processing_time > 0 && (
                          <>
                            <span>•</span>
                            <span>{j.total_processing_time}s</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isDone
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {j.status}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
