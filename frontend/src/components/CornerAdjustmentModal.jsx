import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Wand2, Check, Move, Sliders } from 'lucide-react';
import { rescanPage } from '../api';

export default function CornerAdjustmentModal({
  isOpen,
  onClose,
  job,
  pageNum,
  onPageRescanned
}) {
  const [corners, setCorners] = useState(null);
  const [scanFilter, setScanFilter] = useState('magic_color');
  const [imgDims, setImgDims] = useState({ width: 800, height: 600 });
  const [isRescanning, setIsRescanning] = useState(false);

  const containerRef = useRef(null);
  const draggingPointRef = useRef(null);

  const currentPage = job?.pages?.find((p) => p.page_number === pageNum);

  useEffect(() => {
    if (isOpen && currentPage) {
      setScanFilter(currentPage.scan_filter || job.scan_filter || 'magic_color');
      
      // Load image dimensions
      const img = new Image();
      img.onload = () => {
        setImgDims({ width: img.naturalWidth, height: img.naturalHeight });
        if (currentPage.corners && currentPage.corners.length === 4) {
          setCorners(currentPage.corners);
        } else {
          // Default 4% inset
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          setCorners([
            [w * 0.04, h * 0.04],
            [w * 0.96, h * 0.04],
            [w * 0.96, h * 0.96],
            [w * 0.04, h * 0.96]
          ]);
        }
      };
      img.src = currentPage.original_file;
    }
  }, [isOpen, currentPage?.page_number]);

  if (!isOpen || !currentPage) return null;

  // Draggable corner handles math
  const handleMouseDown = (index) => (e) => {
    e.preventDefault();
    draggingPointRef.current = index;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e) => {
    if (draggingPointRef.current === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = imgDims.width / rect.width;
    const scaleY = imgDims.height / rect.height;

    const imgX = Math.max(0, Math.min(imgDims.width, clientX * scaleX));
    const imgY = Math.max(0, Math.min(imgDims.height, clientY * scaleY));

    setCorners((prev) => {
      const updated = [...prev];
      updated[draggingPointRef.current] = [imgX, imgY];
      return updated;
    });
  };

  const handleMouseUp = () => {
    draggingPointRef.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      const updatedPage = await rescanPage(
        job.job_id,
        currentPage.page_number,
        corners,
        scanFilter
      );
      if (onPageRescanned) onPageRescanned(currentPage.page_number, updatedPage);
      onClose();
    } catch (err) {
      alert(err.message || 'Rescan failed');
    } finally {
      setIsRescanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Adjust Crop & Scan Filter — Page {currentPage.page_number}
              </h3>
              <p className="text-[11px] text-slate-400">
                Drag corner pins to unwarp perspective and choose scanner enhancement
              </p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Interactive Crop Box */}
          <div
            ref={containerRef}
            className="relative w-full max-h-[50vh] aspect-[4/3] bg-black rounded-xl overflow-hidden border border-slate-800 select-none flex items-center justify-center mx-auto"
          >
            <img
              src={currentPage.original_file}
              alt="Original scan"
              className="w-full h-full object-contain pointer-events-none"
            />

            {/* SVG Polygon */}
            {corners && corners.length === 4 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${imgDims.width} ${imgDims.height}`}
                preserveAspectRatio="none"
              >
                <polygon
                  points={`${corners[0][0]},${corners[0][1]} ${corners[1][0]},${corners[1][1]} ${corners[2][0]},${corners[2][1]} ${corners[3][0]},${corners[3][1]}`}
                  fill="rgba(37, 99, 235, 0.25)"
                  stroke="#2563eb"
                  strokeWidth={imgDims.width * 0.005}
                />
              </svg>
            )}

            {/* Corner pins */}
            {corners &&
              corners.map(([x, y], idx) => {
                const leftPct = (x / imgDims.width) * 100;
                const topPct = (y / imgDims.height) * 100;
                const labels = ['TL', 'TR', 'BR', 'BL'];

                return (
                  <div
                    key={idx}
                    onMouseDown={handleMouseDown(idx)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center z-20 group hover:scale-125 transition-transform"
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  >
                    <span className="text-[8px] font-black text-white pointer-events-none">
                      {labels[idx]}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Filter options */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-300">Scanner Filter:</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button
                onClick={() => setScanFilter('magic_color')}
                className={`p-2 rounded-lg border text-left transition ${
                  scanFilter === 'magic_color'
                    ? 'bg-slate-800 border-blue-500 text-white font-medium'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-slate-200 font-medium">Magic Color</div>
                <div className="text-[10px] text-slate-400">Pure white sheet</div>
              </button>

              <button
                onClick={() => setScanFilter('clean_bw')}
                className={`p-2 rounded-lg border text-left transition ${
                  scanFilter === 'clean_bw'
                    ? 'bg-slate-800 border-blue-500 text-white font-medium'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-slate-200 font-medium">Clean B&W</div>
                <div className="text-[10px] text-slate-400">Binary ink contrast</div>
              </button>

              <button
                onClick={() => setScanFilter('grayscale')}
                className={`p-2 rounded-lg border text-left transition ${
                  scanFilter === 'grayscale'
                    ? 'bg-slate-800 border-blue-500 text-white font-medium'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-slate-200 font-medium">Grayscale</div>
                <div className="text-[10px] text-slate-400">Studio lighting</div>
              </button>

              <button
                onClick={() => setScanFilter('enhanced')}
                className={`p-2 rounded-lg border text-left transition ${
                  scanFilter === 'enhanced'
                    ? 'bg-slate-800 border-blue-500 text-white font-medium'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-slate-200 font-medium">Contrast Boost</div>
                <div className="text-[10px] text-slate-400">CLAHE stroke boost</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleRescan}
            disabled={isRescanning}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isRescanning ? 'Unwarping & Re-Transcribing...' : 'Apply & Rescan Page'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
