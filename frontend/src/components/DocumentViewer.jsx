import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCw, Eye, Sparkles, ChevronLeft, ChevronRight, FileImage, Sliders } from 'lucide-react';

export default function DocumentViewer({
  job,
  currentPageNum,
  onSelectPage,
  onOpenCropModal
}) {
  const [zoom, setZoom] = useState(1);
  const [showEnhanced, setShowEnhanced] = useState(true);

  if (!job || !job.pages || job.pages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 bg-slate-900/30 border border-slate-800 rounded-2xl">
        <FileImage className="w-12 h-12 text-slate-600 mb-2" />
        <p className="text-sm">No document selected</p>
      </div>
    );
  }

  const currentPage = job.pages.find((p) => p.page_number === currentPageNum) || job.pages[0];
  const imageSrc = showEnhanced && currentPage.processed_file
    ? currentPage.processed_file
    : currentPage.original_file;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  return (
    <div className="flex flex-col h-full bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Top Toolbar */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Page Selector & Metadata */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectPage(Math.max(1, currentPageNum - 1))}
            disabled={currentPageNum <= 1}
            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 transition"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-semibold text-white px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            Page {currentPage.page_number} / {job.total_pages}
          </span>

          <button
            onClick={() => onSelectPage(Math.min(job.total_pages, currentPageNum + 1))}
            disabled={currentPageNum >= job.total_pages}
            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 transition"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {currentPage.preprocessing_meta?.skew_angle !== undefined && (
            <span className="hidden sm:inline text-[11px] text-slate-400 font-mono">
              Skew: {currentPage.preprocessing_meta.skew_angle}°
            </span>
          )}
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-2">
          {/* Enhanced vs Original Toggle */}
          {currentPage.processed_file && (
            <button
              onClick={() => setShowEnhanced(!showEnhanced)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                showEnhanced
                  ? 'bg-slate-800 text-white border-slate-700'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
              title="Toggle between enhanced deskewed image and raw scan"
            >
              <span>{showEnhanced ? 'Enhanced View' : 'Original Scan'}</span>
            </button>
          )}

          {/* Adjust Scan & Filter */}
          <button
            onClick={onOpenCropModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
            title="Adjust 4-corner perspective or change scanner filter"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Adjust Scan</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-md p-0.5 text-xs">
            <button
              onClick={handleZoomOut}
              className="p-1 text-slate-400 hover:text-white transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 text-slate-400 hover:text-white transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1 text-slate-400 hover:text-white border-l border-slate-700 transition"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Image Canvas */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/60 relative select-none">
        {imageSrc ? (
          <div
            className="transition-transform duration-150 ease-out flex items-center justify-center"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          >
            <img
              src={imageSrc}
              alt={`Document Page ${currentPage.page_number}`}
              className="max-h-[70vh] w-auto rounded border border-slate-800 paper-texture object-contain"
            />
          </div>
        ) : (
          <div className="text-xs text-slate-500">Image loading...</div>
        )}
      </div>

      {/* Thumbnail Ribbon for Multi-Page Documents */}
      {job.pages.length > 1 && (
        <div className="p-2.5 bg-slate-900 border-t border-slate-800 overflow-x-auto flex items-center gap-2">
          {job.pages.map((p) => {
            const isSelected = p.page_number === currentPageNum;
            const isDone = p.status === 'COMPLETED';

            return (
              <button
                key={p.page_number}
                onClick={() => onSelectPage(p.page_number)}
                className={`relative flex-shrink-0 rounded-md overflow-hidden border transition p-0.5 ${
                  isSelected
                    ? 'border-blue-500'
                    : 'border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                }`}
                title={`Page ${p.page_number}`}
              >
                <div className="w-16 h-20 bg-slate-950 rounded flex items-center justify-center overflow-hidden">
                  {p.thumbnail_file ? (
                    <img
                      src={p.thumbnail_file}
                      alt={`Thumb ${p.page_number}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-600 font-mono">P{p.page_number}</span>
                  )}
                </div>
                <div className="absolute bottom-1 right-1 text-[9px] font-bold px-1 rounded bg-black/80 text-white font-mono">
                  {p.page_number}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
