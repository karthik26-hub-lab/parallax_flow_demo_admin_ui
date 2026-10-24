# ParallaxFlow OCR - Production Multi-Page Handwriting & Document Scanner

An end-to-end, high-production OCR, Document Scanner, and Handwritten Text Recognition (HTR) system designed specifically for **multi-page handwritten documents**, scanned notebook batches, exams, letters, and mobile camera captures.

---

## 🌟 Advanced Scanning & Recognition Capabilities

### 1. 📷 Live Camera Scanner with 4-Corner Perspective Unwarp
- **Camera Viewfinder**: Live in-browser camera/webcam capture with document guide framing.
- **Automatic 4-Corner Paper Detection**: Finds the polygon boundary of the paper against desks or backgrounds.
- **Draggable 4-Point Keystone Handles**: Interactive `TL`, `TR`, `BR`, `BL` corner pins allow micro-adjusting page crops before extraction.
- **Keystone Perspective Flattening**: Transforms tilted, angled photographs into crisp, top-down rectangular documents via `cv2.warpPerspective`.
- **Multi-Page Sequence Tray**: Snap Page 1, adjust crop, snap Page 2, adjust crop, snap Page 3... then process all pages together in a single batch!

### 2. ✨ CamScanner-Grade Scanning Filters
- **Magic Color (Default)**: Morphological background division completely eliminates yellowed paper, phone shadows, and desk lamp glare while keeping colored ink (blue, red, black, green pens) vibrant and legible.
- **Clean B&W**: High-contrast binary document mode that strips all paper discoloration and back-page ink bleed-through.
- **Grayscale Clean**: Studio-grade balanced monochrome document scan.
- **Contrast Boost**: CLAHE stroke contrast enhancement for faint pencil or light ballpoint ink.
- **Original Scan**: Raw perspective-flattened capture.

### 3. ✂️ Per-Page Re-Crop & Re-Filter Studio
- In the Document Viewer, click **"Adjust Scan & Filter"** on any page to readjust corner pins or switch filters (e.g. from Magic Color to Clean B&W).
- The page is immediately re-warped and re-transcribed on the fly!

### 4. 🧠 Dual OCR Engine Architecture
- **Primary: Gemini Multimodal Vision AI (`gemini-2.5-flash` / `gemini-2.5-pro`)**:
  - State-of-the-art accuracy for cursive handwriting, complex notes, struck-through corrections (`~~text~~`), formulas, and tables.
  - Generates structured Markdown with headers, bullet points, entities, and confidence scores.
- **Secondary: Local Deep Learning (`EasyOCR`)**:
  - 100% offline fallback running locally with PyTorch without any cloud API keys.

---

## 🚀 Quick Start

### 1. Launch the Server
Double-click `run.bat` or run:
```powershell
.\run.bat
```
Open your browser at:
```
http://127.0.0.1:8000
```

### 2. Using the Document Scanner
- Click **"Camera Scanner"** in the top navigation or upload area.
- Point your camera at a notebook page or upload a document photo.
- The 4 corners will be auto-detected — drag any corner pin to adjust.
- Select your filter (**Magic Color**, **Clean B&W**, etc.) and inspect the live preview.
- Click **"Add to Multi-Page Stack"** to scan more pages, then click **"Finish & Run OCR"**!

---

## 🔌 REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/scan/detect-corners` | Detect 4 paper corners and dimensions from image |
| `POST` | `/api/scan/preview` | Generate live preview of perspective unwarp + filter |
| `POST` | `/api/scan/batch` | Upload ordered array of camera-captured pages |
| `POST` | `/api/jobs/{id}/pages/{page}/rescan` | Re-crop corners, change filter, and re-transcribe page |
| `POST` | `/api/upload` | Upload multi-page PDF or image bundle with filter options |
| `POST` | `/api/sample` | Run automated test on 3-page handwritten demo |
| `GET` | `/api/jobs/{id}` | Real-time status and extracted pages |
| `GET` | `/api/jobs/{id}/export/{format}` | Export as `md`, `txt`, `json`, or `zip` |
