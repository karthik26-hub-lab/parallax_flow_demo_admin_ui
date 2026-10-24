// API client for ParallaxFlow OCR

export const getStoredApiKey = () => {
  return localStorage.getItem('parallax_gemini_key') || '';
};

export const setStoredApiKey = (key) => {
  if (key) {
    localStorage.setItem('parallax_gemini_key', key.trim());
  } else {
    localStorage.removeItem('parallax_gemini_key');
  }
};

export async function fetchSystemConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to load system config');
  return res.json();
}

export async function uploadDocument(formData) {
  const apiKey = getStoredApiKey();
  const headers = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers,
    body: formData
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Upload failed');
  }
  return res.json();
}

export async function fetchJobs() {
  const res = await fetch('/api/jobs');
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

export async function fetchJobDetails(jobId) {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error('Failed to fetch job details');
  return res.json();
}

export async function updatePageTranscription(jobId, pageNumber, transcriptionMarkdown) {
  const res = await fetch(`/api/jobs/${jobId}/pages/${pageNumber}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcription_markdown: transcriptionMarkdown })
  });
  if (!res.ok) throw new Error('Failed to update page');
  return res.json();
}

export function getExportUrl(jobId, format, pageNumber = null) {
  let url = `/api/jobs/${jobId}/export/${format}`;
  if (pageNumber !== null) {
    url += `?page=${pageNumber}`;
  }
  return url;
}

export async function triggerSampleRun(engine = 'easyocr', modelName = 'easyocr-v1', scanFilter = 'magic_color') {
  const apiKey = getStoredApiKey();
  const headers = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(`/api/sample?engine=${engine}&model_name=${modelName}&scan_filter=${scanFilter}`, {
    method: 'POST',
    headers
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Sample run failed');
  }
  return res.json();
}

export async function detectCorners(imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'capture.jpg');
  const res = await fetch('/api/scan/detect-corners', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to detect document corners');
  return res.json();
}

export async function previewScan(imageBlob, corners, filterType = 'magic_color') {
  const formData = new FormData();
  formData.append('file', imageBlob, 'capture.jpg');
  if (corners) {
    formData.append('corners_json', JSON.stringify(corners));
  }
  formData.append('filter_type', filterType);

  const res = await fetch('/api/scan/preview', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to preview scan');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function rescanPage(jobId, pageNumber, corners, scanFilter = 'magic_color', customPrompt = '') {
  const apiKey = getStoredApiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(`/api/jobs/${jobId}/pages/${pageNumber}/rescan`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      corners,
      scan_filter: scanFilter,
      custom_prompt: customPrompt
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to rescan page');
  }
  return res.json();
}

export async function uploadCameraBatch(pagesArray, engine = 'gemini', modelName = 'gemini-3.5-flash-lite', scanFilter = 'magic_color', customPrompt = '') {
  const apiKey = getStoredApiKey();
  const formData = new FormData();
  pagesArray.forEach((p, idx) => {
    formData.append('files', p.blob, `page_${idx + 1}.jpg`);
  });
  formData.append('engine', engine);
  formData.append('model_name', modelName);
  formData.append('scan_filter', scanFilter);
  if (customPrompt) formData.append('custom_prompt', customPrompt);

  const headers = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch('/api/scan/batch', {
    method: 'POST',
    headers,
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Batch scan failed');
  }
  return res.json();
}

// Evaluation & Grading API methods
export async function triggerDemoEvaluation(modelName = 'gemini-3.5-flash-lite') {
  const apiKey = getStoredApiKey();
  const headers = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(`/api/evaluate/demo?model_name=${modelName}`, {
    method: 'POST',
    headers
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to trigger demo evaluation');
  }
  return res.json();
}

export async function uploadCustomEvaluation(formData) {
  const apiKey = getStoredApiKey();
  const headers = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch('/api/evaluate/upload', {
    method: 'POST',
    headers,
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Evaluation upload failed');
  }
  return res.json();
}

export async function fetchEvaluationJobDetails(jobId) {
  const res = await fetch(`/api/evaluate/jobs/${jobId}`);
  if (!res.ok) throw new Error('Failed to fetch evaluation job details');
  return res.json();
}

export async function fetchEvaluationJobs() {
  const res = await fetch('/api/evaluate/jobs');
  if (!res.ok) throw new Error('Failed to list evaluation jobs');
  return res.json();
}

export function getEvaluationExportUrl(jobId, format) {
  return `/api/evaluate/jobs/${jobId}/export/${format}`;
}
