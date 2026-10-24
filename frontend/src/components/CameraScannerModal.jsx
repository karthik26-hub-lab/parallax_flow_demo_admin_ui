import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  RotateCcw,
  Check,
  Plus,
  Sparkles,
  Layers,
  Wand2,
  Trash2,
  Eye,
  Sliders,
  Move
} from 'lucide-react';
import { detectCorners, previewScan } from '../api';

export default function CameraScannerModal({
  isOpen,
  onClose,
  onSubmitBatch,
  activeEngine
}) {
  const [streamActive, setStreamActive] = useState(false);
  const [capturedPages, setCapturedPages] = useState([]); // [{ blob, url, corners, filterType, previewUrl }]
  const [currentStep, setCurrentStep] = useState('capture'); // 'capture' | 'adjust'
  const [activePhotoBlob, setActivePhotoBlob] = useState(null);
  const [activePhotoUrl, setActivePhotoUrl] = useState(null);
  const [corners, setCorners] = useState(null); // [[x,y], [x,y], [x,y], [x,y]]
  const [imgDims, setImgDims] = useState({ width: 800, height: 600 });
  const [scanFilter, setScanFilter] = useState('magic_color');
  const [previewWarpUrl, setPreviewWarpUrl] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const draggingPointRef = useRef(null);

  // Initialize camera stream when modal opens
  useEffect(() => {
    let stream = null;
    if (isOpen && currentStep === 'capture') {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, currentStep]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStreamActive(true);
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable', err);
      setStreamActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
  };

  const captureFrame = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      stopCamera();
      const url = URL.createObjectURL(blob);
      setActivePhotoBlob(blob);
      setActivePhotoUrl(url);
      setImgDims({ width: canvas.width, height: canvas.height });
      setCurrentStep('adjust');
      await runAutoDetection(blob);
    }, 'image/jpeg', 0.95);
  };

  const handleManualUpload = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
        setImgDims({ width: img.naturalWidth, height: img.naturalHeight });
        setActivePhotoBlob(file);
        setActivePhotoUrl(url);
        stopCamera();
        setCurrentStep('adjust');
        await runAutoDetection(file);
      };
      img.src = url;
    }
  };

  const runAutoDetection = async (blob) => {
    setIsDetecting(true);
    try {
      const data = await detectCorners(blob);
      setCorners(data.corners);
      // Generate initial preview with default filter
      updateScanPreview(blob, data.corners, scanFilter);
    } catch (err) {
      console.error(err);
      // Fallback corners: 5% inset
      const w = imgDims.width;
      const h = imgDims.height;
      const fallback = [
        [w * 0.05, h * 0.05],
        [w * 0.95, h * 0.05],
        [w * 0.95, h * 0.95],
        [w * 0.05, h * 0.95]
      ];
      setCorners(fallback);
      updateScanPreview(blob, fallback, scanFilter);
    } finally {
      setIsDetecting(false);
    }
  };

  const updateScanPreview = async (blob, pts, filter) => {
    try {
      const previewUrl = await previewScan(blob, pts, filter);
      setPreviewWarpUrl(previewUrl);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFilterChange = (newFilter) => {
    setScanFilter(newFilter);
    if (activePhotoBlob && corners) {
      updateScanPreview(activePhotoBlob, corners, newFilter);
    }
  };

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

    // Convert to image coordinates
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
    if (activePhotoBlob && corners) {
      updateScanPreview(activePhotoBlob, corners, scanFilter);
    }
  };

  const addPageToBatch = () => {
    setCapturedPages((prev) => [
      ...prev,
      {
        blob: activePhotoBlob,
        url: activePhotoUrl,
        corners: corners,
        filterType: scanFilter,
        previewUrl: previewWarpUrl || activePhotoUrl
      }
    ]);
    // Reset for next page
    setActivePhotoBlob(null);
    setActivePhotoUrl(null);
    setCorners(null);
    setPreviewWarpUrl(null);
    setCurrentStep('capture');
  };

  const removePageFromBatch = (index) => {
    setCapturedPages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleFinishBatch = async () => {
    // If currently on an adjusted page, add it first
    let allPages = [...capturedPages];
    if (activePhotoBlob && corners) {
      allPages.push({
        blob: activePhotoBlob,
        corners,
        filterType: scanFilter
      });
    }

    if (allPages.length === 0) return;

    setIsSubmitting(true);
    try {
      await onSubmitBatch(allPages, scanFilter);
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to submit batch');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Document Scanner Studio
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Perspective Flattening & Magic Color
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {currentStep === 'capture'
                  ? 'Align document inside frame and capture'
                  : 'Adjust 4 corner handles and select scanning filter'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col space-y-4">
          {/* STEP 1: Camera Viewfinder */}
          {currentStep === 'capture' && (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[380px]">
              <div className="relative w-full max-w-lg aspect-[4/3] bg-black rounded-2xl overflow-hidden border-2 border-dashed border-slate-700 flex items-center justify-center shadow-2xl">
                {streamActive ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Viewfinder frame guide */}
                    <div className="absolute inset-8 border-2 border-white/60 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                      <div className="flex justify-between">
                        <div className="w-4 h-4 border-t-2 border-l-2 border-blue-400" />
                        <div className="w-4 h-4 border-t-2 border-r-2 border-blue-400" />
                      </div>
                      <div className="text-center text-xs text-white/70 font-medium">
                        Fit handwritten page inside box
                      </div>
                      <div className="flex justify-between">
                        <div className="w-4 h-4 border-b-2 border-l-2 border-blue-400" />
                        <div className="w-4 h-4 border-b-2 border-r-2 border-blue-400" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <Camera className="w-12 h-12 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Webcam not detected or permission denied. You can select an image file to scan instead.
                    </p>
                    <label className="inline-block px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow transition">
                      Upload Document Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleManualUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Capture controls */}
              <div className="flex items-center gap-4 mt-4">
                {streamActive && (
                  <button
                    onClick={captureFrame}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow transition transform active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Snap Page</span>
                  </button>
                )}

                <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-semibold cursor-pointer transition">
                  <span>Browse Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleManualUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* STEP 2: Interactive 4-Corner Rectification & CamScanner Filters */}
          {currentStep === 'adjust' && activePhotoUrl && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
              {/* Left Column: Interactive 4-Point Cropping Canvas */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-blue-400" />
                    Drag Corner Pins to Crop Page
                  </span>
                  <button
                    onClick={() => runAutoDetection(activePhotoBlob)}
                    disabled={isDetecting}
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>{isDetecting ? 'Detecting...' : 'Auto-Detect Edge'}</span>
                  </button>
                </div>

                <div
                  ref={containerRef}
                  className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden border border-slate-800 select-none flex items-center justify-center shadow-inner"
                >
                  <img
                    src={activePhotoUrl}
                    alt="Scan capture"
                    className="w-full h-full object-contain pointer-events-none"
                  />

                  {/* SVG polygon and corner pins overlay */}
                  {corners && corners.length === 4 && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${imgDims.width} ${imgDims.height}`}
                      preserveAspectRatio="none"
                    >
                      {/* Polygon shaded area */}
                      <polygon
                        points={`${corners[0][0]},${corners[0][1]} ${corners[1][0]},${corners[1][1]} ${corners[2][0]},${corners[2][1]} ${corners[3][0]},${corners[3][1]}`}
                        fill="rgba(99, 102, 241, 0.25)"
                        stroke="#6366f1"
                        strokeWidth={imgDims.width * 0.005}
                      />
                    </svg>
                  )}

                  {/* Interactive Draggable Corner Pins */}
                  {corners &&
                    corners.map(([x, y], idx) => {
                      const leftPct = (x / imgDims.width) * 100;
                      const topPct = (y / imgDims.height) * 100;
                      const labels = ['TL', 'TR', 'BR', 'BL'];

                      return (
                        <div
                          key={idx}
                          onMouseDown={handleMouseDown(idx)}
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-blue-600 border border-white shadow cursor-grab active:cursor-grabbing flex items-center justify-center z-20 group hover:scale-110 transition-transform"
                          style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                        >
                          <span className="text-[9px] font-bold text-white pointer-events-none">
                            {labels[idx]}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Right Column: Flattened Scan & Filter Preview */}
              <div className="flex flex-col space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium text-slate-300">
                    Flattened Scan Preview
                  </span>
                  <span className="text-[11px] text-slate-500">Perspective Engine</span>
                </div>

                {/* Filter Selector Buttons */}
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button
                    onClick={() => handleFilterChange('magic_color')}
                    className={`p-2 rounded-lg border text-left transition ${
                      scanFilter === 'magic_color'
                        ? 'bg-slate-800 border-blue-500 text-white font-medium'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-medium text-slate-200">Magic Color</div>
                    <div className="text-[10px] text-slate-400">Pure white + vivid ink</div>
                  </button>

                  <button
                    onClick={() => handleFilterChange('clean_bw')}
                    className={`p-2 rounded-lg border text-left transition ${
                      scanFilter === 'clean_bw'
                        ? 'bg-slate-800 border-blue-500 text-white font-medium'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-medium text-slate-200">Clean B&W</div>
                    <div className="text-[10px] text-slate-400">Binary contrast</div>
                  </button>

                  <button
                    onClick={() => handleFilterChange('enhanced')}
                    className={`p-2 rounded-lg border text-left transition ${
                      scanFilter === 'enhanced'
                        ? 'bg-slate-800 border-blue-500 text-white font-medium'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-medium text-slate-200">Contrast Boost</div>
                    <div className="text-[10px] text-slate-400">Stroke boost</div>
                  </button>
                </div>

                {/* Warp Preview Display */}
                <div className="flex-1 min-h-[220px] bg-slate-950 rounded-lg border border-slate-800 p-2 flex items-center justify-center overflow-hidden">
                  {previewWarpUrl ? (
                    <img
                      src={previewWarpUrl}
                      alt="Warp preview"
                      className="max-h-[260px] w-auto rounded object-contain"
                    />
                  ) : (
                    <div className="text-xs text-slate-500">Generating preview...</div>
                  )}
                </div>

                {/* Add Page to Batch button */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      setCurrentStep('capture');
                      startCamera();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition"
                  >
                    Retake
                  </button>
                  <button
                    onClick={addPageToBatch}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add to Stack</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Multi-Page Stack Tray (Bottom Ribbon) */}
          {capturedPages.length > 0 && (
            <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  Scanned Stack: {capturedPages.length} {capturedPages.length === 1 ? 'Page' : 'Pages'}
                </span>
                <span className="text-[11px] text-slate-500">Click x to delete page</span>
              </div>

              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {capturedPages.map((page, idx) => (
                  <div
                    key={idx}
                    className="relative flex-shrink-0 w-16 h-20 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden group"
                  >
                    <img
                      src={page.previewUrl}
                      alt={`Page ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1 left-1 text-[9px] font-mono font-bold bg-black/80 px-1 rounded text-white">
                      P{idx + 1}
                    </div>
                    <button
                      onClick={() => removePageFromBatch(idx)}
                      className="absolute top-1 right-1 p-0.5 rounded bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition shadow"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {currentStep !== 'capture' && (
                  <button
                    onClick={() => {
                      setCurrentStep('capture');
                      startCamera();
                    }}
                    className="flex-shrink-0 w-16 h-20 rounded-lg border-2 border-dashed border-slate-700 hover:border-blue-500 flex flex-col items-center justify-center text-slate-500 hover:text-blue-400 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-[9px] mt-1 font-semibold">Add Page</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Total Pages to Process: <strong className="text-white">{capturedPages.length + (activePhotoBlob && currentStep === 'adjust' ? 1 : 0)}</strong>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800 transition"
            >
              Cancel
            </button>

            <button
              onClick={handleFinishBatch}
              disabled={isSubmitting || (capturedPages.length === 0 && !activePhotoBlob)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? 'Initiating OCR Job...'
                  : `Finish & Run OCR (${capturedPages.length + (activePhotoBlob && currentStep === 'adjust' ? 1 : 0)} Pages)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
