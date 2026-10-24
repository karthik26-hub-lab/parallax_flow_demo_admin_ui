/**
 * Parallax Flow • CA Coaching Academy Evaluation Portal
 *
 * Hierarchy:
 * 1. Login -> Academy Overview (Total Exams Posted, Total Students Appeared, Scripts Evaluated, Pending Reviews + Examinations List)
 * 2. Click Exam -> Exam Candidates Queue (Search student by Name / Roll No, Filter Flagged/Ready, Flag/Unflag, Upload Script)
 * 3. Secondary Drill-Down -> Grading Workbench (Step Rubric, Transcript Editor v1/v2+, Mark Overrides)
 * 4. Secondary Drill-Down -> Student Evaluation Report (Printable Provisional Marksheet)
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. APPLICATION STATE (ZERO MOCK DATA — 100% BACKEND DRIVEN)
  // ==========================================================================
  let examsList = [];
  let studentsList = [];
  let activeExam = null;
  let isAllExamsCandidateSearchMode = false;
  let activeExamFilter = 'ALL'; // 'ALL' | 'PENDING' | 'COMPLETED'
  let activeExamSubject = 'ALL';
  let currentExamSearchQuery = '';

  let activeStudent = null;
  let activeQuestionIndex = 0;
  let activeMode = 'ocr';
  let selectedTranscriptVersion = 'v1';
  let currentStudentSearchQuery = '';
  let activeCandidateFilter = 'ALL'; // 'ALL' | 'CERTIFIED' | 'FLAGGED'
  let pendingGeneratedRubric = [];

  const dom = {};

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message, isError = false) {
    if (!dom.toast) return;
    if (dom.toastMsg) dom.toastMsg.textContent = message;
    const toastIcon = document.getElementById('toast-icon');
    if (toastIcon) {
      toastIcon.innerHTML = isError
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    }
    dom.toast.classList.add('show');
    setTimeout(() => {
      dom.toast.classList.remove('show');
    }, 3200);
  }

  function getActiveQuestions() {
    if (activeStudent && Array.isArray(activeStudent.questions) && activeStudent.questions.length > 0) {
      return activeStudent.questions;
    }
    return [];
  }

  function getFilteredStudentsForActiveExam() {
    if (isAllExamsCandidateSearchMode || !activeExam) {
      return studentsList;
    }
    return studentsList.filter(
      (s) => s.examId === activeExam.id || s.examCode === activeExam.code
    );
  }

  // ==========================================================================
  // 2. BACKEND SYNC (GET /api/jobs)
  // ==========================================================================
  async function loadJobsFromBackend(preserveStudentId = null) {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      examsList = Array.isArray(data.exams) ? data.exams : [];
      studentsList = Array.isArray(data.jobs) ? data.jobs : [];

      if (activeExam) {
        activeExam = examsList.find((e) => e.id === activeExam.id) || examsList[0] || null;
      } else {
        activeExam = examsList[0] || null;
      }

      const targetId = preserveStudentId || (activeStudent && activeStudent.id);
      activeStudent = studentsList.find((s) => s.id === targetId) || studentsList[0] || null;
      selectedTranscriptVersion =
        (activeStudent &&
          activeStudent.transcript_store &&
          activeStudent.transcript_store.current_version) ||
        'v1';
    } catch (err) {
      console.warn('Could not fetch from backend:', err.message);
    }

    populateUploadExamSelect();
    populateWorkbenchCandidateSelect();
    updateAcademyKpiTotals();
    renderAcademyExamsTable();
    renderExamCandidatesView();
    renderWorkbenchQuestion(activeQuestionIndex);
    renderReport();
  }

  // ==========================================================================
  // 3. INITIALIZATION & DOM CACHE
  // ==========================================================================
  const SUN_SVG =
    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const MOON_SVG =
    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('pf_theme', isDark ? 'dark' : 'light');
    } catch (_) {}

    const currentLabel = isDark ? 'Dark' : 'Light';
    const currentIcon = isDark ? MOON_SVG : SUN_SVG;
    if (dom.btnThemeToggle) dom.btnThemeToggle.setAttribute('aria-checked', String(isDark));
    if (dom.btnLoginThemeToggle) dom.btnLoginThemeToggle.setAttribute('aria-checked', String(isDark));
    if (dom.themeToggleLabel) dom.themeToggleLabel.textContent = currentLabel;
    if (dom.themeToggleIcon) dom.themeToggleIcon.innerHTML = currentIcon;
    if (dom.loginThemeToggleLabel) dom.loginThemeToggleLabel.textContent = currentLabel;
    if (dom.loginThemeToggleIcon) dom.loginThemeToggleIcon.innerHTML = currentIcon;
  }

  function initTheme() {
    let saved = 'light';
    try {
      saved = localStorage.getItem('pf_theme') || 'light';
    } catch (_) {}
    applyTheme(saved);
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    applyTheme(isDark ? 'light' : 'dark');
  }

  let chatHistory = [
    {
      role: 'model',
      text: 'Welcome to the Parallax Flow Academy Assistant. You can type commands here to create examinations, publish exam results, view batch toppers, or filter and review uploaded student scripts.',
      actions: [],
      toppers: null,
      timestamp: 'Ready'
    }
  ];

  function init() {
    cacheDom();
    initTheme();
    bindEvents();
    populateUploadExamSelect();
    populateWorkbenchCandidateSelect();
    updateAcademyKpiTotals();
    renderAcademyExamsTable();
    renderExamCandidatesView();
    renderWorkbenchQuestion(0);
    renderReport();
    renderChatThread();
    switchView('login');
    loadJobsFromBackend();
  }

  function cacheDom() {
    // Views
    dom.viewLogin = document.getElementById('view-login');
    dom.viewDashboard = document.getElementById('view-dashboard');
    dom.viewExamCandidates = document.getElementById('view-exam-candidates');
    dom.viewWorkbench = document.getElementById('view-workbench');
    dom.viewReport = document.getElementById('view-report');

    // Top Navigation Bar
    dom.topNav = document.getElementById('pf-nav-wrapper');
    dom.navBrandLogo = document.getElementById('nav-brand-logo');
    dom.navLinkDash = document.getElementById('nav-link-dash');
    dom.navLinkExams = document.getElementById('nav-link-exams');
    dom.navLinkPending = document.getElementById('nav-link-pending');
    dom.navLinkCandidates = document.getElementById('nav-link-candidates');
    dom.navLinkToppers = document.getElementById('nav-link-toppers');
    dom.btnLogout = document.getElementById('btn-logout');

    // Theme Toggles
    dom.btnThemeToggle = document.getElementById('btn-theme-toggle');
    dom.themeToggleIcon = document.getElementById('theme-toggle-icon');
    dom.themeToggleLabel = document.getElementById('theme-toggle-label');
    dom.btnLoginThemeToggle = document.getElementById('btn-login-theme-toggle');
    dom.loginThemeToggleIcon = document.getElementById('login-theme-toggle-icon');
    dom.loginThemeToggleLabel = document.getElementById('login-theme-toggle-label');

    // Login
    dom.loginForm = document.getElementById('login-form');

    // Academy Overview KPIs & Examinations List
    dom.kpiCardExams = document.getElementById('kpi-card-exams');
    dom.kpiCardStudents = document.getElementById('kpi-card-students');
    dom.kpiCardEvaluated = document.getElementById('kpi-card-evaluated');
    dom.kpiCardPending = document.getElementById('kpi-card-pending');
    dom.kpiTotalExams = document.getElementById('kpi-total-exams');
    dom.kpiTotalAppeared = document.getElementById('kpi-total-appeared');
    dom.kpiTotalEvaluated = document.getElementById('kpi-total-evaluated');
    dom.kpiTotalPending = document.getElementById('kpi-total-pending');

    dom.academyExamsPanel = document.getElementById('academy-exams-panel');
    dom.examsListCount = document.getElementById('exams-list-count');
    dom.examFilterTabs = document.getElementById('exam-filter-tabs');
    dom.examSubjectFilter = document.getElementById('exam-subject-filter');
    dom.examSearchInput = document.getElementById('exam-search-input');
    dom.academyExamsTbody = document.getElementById('academy-exams-tbody');

    // Exam Candidates Queue
    dom.btnBackToExams = document.getElementById('btn-back-to-exams');
    dom.examDetailBreadcrumb = document.getElementById('exam-detail-breadcrumb');
    dom.examDetailSubject = document.getElementById('exam-detail-subject');
    dom.examDetailTitle = document.getElementById('exam-detail-title');
    dom.examStatAppeared = document.getElementById('exam-stat-appeared');
    dom.examStatReady = document.getElementById('exam-stat-ready');
    dom.examStatPending = document.getElementById('exam-stat-pending');
    dom.examStatMax = document.getElementById('exam-stat-max');
    dom.candidatesTableHeading = document.getElementById('candidates-table-heading');
    dom.dashSubmissionsCount = document.getElementById('dash-submissions-count');
    dom.dashAiFilterTabs = document.getElementById('dash-ai-filter-tabs');
    dom.dashStudentSearch = document.getElementById('dash-student-search');
    dom.dashSearchClear = document.getElementById('dash-search-clear');
    dom.dashSubmissionsTbody = document.getElementById('dash-submissions-tbody');
    dom.btnExportStudentsCsv = document.getElementById('btn-export-students-csv');
    dom.btnPublishExamResults = document.getElementById('btn-publish-exam-results');
    dom.examPublishStatusPill = document.getElementById('exam-publish-status-pill');

    // Create Examination Modal & AI Rubric Builder
    dom.btnOpenCreateExamModal = document.getElementById('btn-open-create-exam-modal');
    dom.modalCreateExam = document.getElementById('modal-create-exam');
    dom.btnCloseCreateExamModal = document.getElementById('btn-close-create-exam-modal');
    dom.btnCancelCreateExamModal = document.getElementById('btn-cancel-create-exam-modal');
    dom.formCreateExam = document.getElementById('form-create-exam');
    dom.createExamCode = document.getElementById('create-exam-code');
    dom.createExamMaxMarks = document.getElementById('create-exam-max-marks');
    dom.createExamTitle = document.getElementById('create-exam-title');
    dom.createExamSubject = document.getElementById('create-exam-subject');
    dom.createExamDate = document.getElementById('create-exam-date');
    dom.createExamRubric = document.getElementById('create-exam-rubric');
    dom.btnAiGenerateRubric = document.getElementById('btn-ai-generate-rubric');
    dom.aiRubricPreviewBox = document.getElementById('ai-rubric-preview-box');

    // Mobile App API & Result Gate Modal
    dom.btnOpenMobileApiModal = document.getElementById('btn-open-mobile-api-modal');
    dom.modalMobileApi = document.getElementById('modal-mobile-api');
    dom.btnCloseMobileApiModal = document.getElementById('btn-close-mobile-api-modal');
    dom.btnDoneMobileApiModal = document.getElementById('btn-done-mobile-api-modal');
    dom.mobileTestRollInput = document.getElementById('mobile-test-roll-input');
    dom.btnTestMobileResult = document.getElementById('btn-test-mobile-result');
    dom.mobileTestResultOutput = document.getElementById('mobile-test-result-output');

    // Upload Script Modal
    dom.btnOpenUploadModal = document.getElementById('btn-open-upload-modal');
    dom.btnExamUploadScript = document.getElementById('btn-exam-upload-script');
    dom.modalUploadScript = document.getElementById('modal-upload-script');
    dom.btnCloseUploadModal = document.getElementById('btn-close-upload-modal');
    dom.btnCancelUploadModal = document.getElementById('btn-cancel-upload-modal');
    dom.formUploadScript = document.getElementById('form-upload-script');
    dom.uploadExamSelect = document.getElementById('upload-exam-select');
    dom.uploadCandidateName = document.getElementById('upload-candidate-name');
    dom.uploadRollNo = document.getElementById('upload-roll-no');
    dom.uploadRegion = document.getElementById('upload-region');
    dom.uploadFileInput = document.getElementById('upload-file-input');
    dom.uploadTranscriptText = document.getElementById('upload-transcript-text');

    // Workbench
    dom.btnWbBackCandidates = document.getElementById('btn-wb-back-candidates');
    dom.wbStudentSelect = document.getElementById('wb-student-Select');
    dom.ribbonTrack = document.getElementById('ribbon-track');
    dom.btnWbToggleFlag = document.getElementById('btn-wb-toggle-flag');
    dom.btnPrevQ = document.getElementById('btn-prev-q');
    dom.btnNextQ = document.getElementById('btn-next-q');
    dom.qPagerLabel = document.getElementById('q-pager-label');
    dom.btnWbViewReport = document.getElementById('btn-wb-view-report');
    dom.wbAiFlagContainer = document.getElementById('wb-ai-flag-container');
    dom.wbModeTabs = document.getElementById('wb-reading-mode-tabs');
    dom.wbVersionSelect = document.getElementById('wb-version-select');
    dom.btnToggleTranscriptEditor = document.getElementById('btn-toggle-transcript-editor');
    dom.wbTranscriptEditorBox = document.getElementById('wb-transcript-editor-box');
    dom.wbTranscriptTextarea = document.getElementById('wb-transcript-textarea');
    dom.wbTranscriptReasonCat = document.getElementById('wb-transcript-reason-cat');
    dom.wbTranscriptReasonText = document.getElementById('wb-transcript-reason-text');
    dom.btnCancelTranscriptEdit = document.getElementById('btn-cancel-transcript-edit');
    dom.btnSaveTranscriptVersion = document.getElementById('btn-save-transcript-version');
    dom.wbPromptCode = document.getElementById('wb-prompt-code');
    dom.wbPromptSection = document.getElementById('wb-prompt-section');
    dom.wbPromptMarks = document.getElementById('wb-prompt-marks');
    dom.wbOwnFigureChip = document.getElementById('wb-own-figure-chip');
    dom.wbPromptTitle = document.getElementById('wb-prompt-title');
    dom.wbPromptText = document.getElementById('wb-prompt-text');
    dom.wbPageIndicator = document.getElementById('wb-page-indicator');
    dom.wbOcrCard = document.getElementById('wb-ocr-card');
    dom.wbTranscriptBody = document.getElementById('wb-transcript-body');
    dom.wbTwopassCard = document.getElementById('wb-twopass-card');
    dom.wbTwopassMeta = document.getElementById('wb-twopass-meta');
    dom.wbTwopassBody = document.getElementById('wb-twopass-body');
    dom.wbDiffCard = document.getElementById('wb-diff-card');
    dom.wbDiffBody = document.getElementById('wb-diff-body');
    dom.wbRubricTitle = document.getElementById('wb-rubric-title');
    dom.wbQscorePill = document.getElementById('wb-qscore-pill');
    dom.wbOverrideFormBox = document.getElementById('wb-override-form-box');
    dom.wbOverrideFormTitle = document.getElementById('wb-override-form-title');
    dom.wbOverrideStepNo = document.getElementById('wb-override-step-no');
    dom.wbOverrideNewMarks = document.getElementById('wb-override-new-marks');
    dom.wbOverrideCategory = document.getElementById('wb-override-category');
    dom.wbOverrideReasonText = document.getElementById('wb-override-reason-text');
    dom.btnCancelOverride = document.getElementById('btn-cancel-override');
    dom.btnSubmitOverride = document.getElementById('btn-submit-override');
    dom.wbStepCardsContainer = document.getElementById('wb-step-cards-container');
    dom.wbAuditLogCount = document.getElementById('wb-audit-log-count');
    dom.wbAuditLogList = document.getElementById('wb-audit-log-list');

    // Report
    dom.btnReportBackCandidates = document.getElementById('btn-report-back-candidates');
    dom.btnReportBackWb = document.getElementById('btn-report-back-wb');
    dom.btnReportFlagTranscript = document.getElementById('btn-report-flag-transcript');
    dom.btnReportPrint = document.getElementById('btn-report-print');
    dom.repFlaggedCountLine = document.getElementById('rep-flagged-count-line');
    dom.repAdvisorDisputeLine = document.getElementById('rep-advisor-dispute-line');
    dom.repTranscriptVerLine = document.getElementById('rep-transcript-ver-line');
    dom.repName = document.getElementById('rep-name');
    dom.repRoll = document.getElementById('rep-roll');
    dom.repPaper = document.getElementById('rep-paper');
    dom.repCenter = document.getElementById('rep-center');
    dom.repScoreHuge = document.getElementById('rep-score-huge');
    dom.repGradeBadge = document.getElementById('rep-grade-badge');
    dom.repObservationsBox = document.getElementById('rep-observations-box');
    dom.repQuestionsAuditTrail = document.getElementById('rep-questions-audit-trail');
    dom.repConfirmedTranscriptHeading = document.getElementById('rep-confirmed-transcript-heading');
    dom.repConfirmedTranscriptBox = document.getElementById('rep-confirmed-transcript-box');
    dom.btnRepOpenDispute = document.getElementById('btn-rep-open-dispute');

    // Toast
    dom.toast = document.getElementById('pf-toast');
    dom.toastMsg = document.getElementById('toast-msg');

    // Admin Command Chatbot Drawer
    dom.btnOpenChatDrawer = document.getElementById('btn-open-chat-drawer');
    dom.btnChatFab = document.getElementById('btn-chat-fab');
    dom.chatBackdrop = document.getElementById('pf-chat-backdrop');
    dom.chatDrawer = document.getElementById('pf-chat-drawer');
    dom.btnCloseChatDrawer = document.getElementById('btn-close-chat-drawer');
    dom.btnClearChat = document.getElementById('btn-clear-chat');
    dom.chatModelSelect = document.getElementById('chat-model-select');
    dom.chatQuickChips = document.getElementById('chat-quick-chips');
    dom.chatMessagesThread = document.getElementById('chat-messages-thread');
    dom.formAdminChat = document.getElementById('form-admin-chat');
    dom.chatInputField = document.getElementById('chat-input-field');
    dom.btnSendChat = document.getElementById('btn-send-chat');
  }

  function populateUploadExamSelect() {
    if (!dom.uploadExamSelect) return;
    if (examsList.length === 0) {
      dom.uploadExamSelect.innerHTML = `<option value="">Auto-create EXAM-01 on upload</option>`;
      return;
    }
    dom.uploadExamSelect.innerHTML = examsList
      .map((ex) => {
        const isSelected = activeExam && ex.id === activeExam.id;
        return `<option value="${escapeHtml(ex.id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(ex.code)} · ${escapeHtml(ex.title)}</option>`;
      })
      .join('');
  }

  function populateWorkbenchCandidateSelect() {
    if (!dom.wbStudentSelect) return;
    if (studentsList.length === 0) {
      dom.wbStudentSelect.innerHTML = `<option value="">No student scripts uploaded</option>`;
      return;
    }
    dom.wbStudentSelect.innerHTML = studentsList
      .map((s) => {
        const lawTest = (s.tests && s.tests[0]) || { awardedMarks: 0, maxMarks: 100 };
        const flagTag = s.flagged ? ' [FLAGGED]' : '';
        const isSelected = activeStudent && s.id === activeStudent.id;
        return `<option value="${escapeHtml(s.id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(s.name)} (${escapeHtml(s.rollNo)}) — ${lawTest.awardedMarks.toFixed(1)}/${lawTest.maxMarks.toFixed(1)}${flagTag}</option>`;
      })
      .join('');
  }

  function updateAcademyKpiTotals() {
    examsList.forEach((ex) => {
      const matching = studentsList.filter((s) => s.examId === ex.id || s.examCode === ex.code);
      const pending = matching.filter((s) => s.flagged).length;
      ex.appeared = matching.length;
      ex.pending = pending;
      ex.evaluated = Math.max(0, matching.length - pending);
    });

    const totalExams = examsList.length;
    const totalAppeared = studentsList.length;
    const totalPending = studentsList.filter((s) => s.flagged).length;
    const totalEvaluated = Math.max(0, totalAppeared - totalPending);

    if (dom.kpiTotalExams) dom.kpiTotalExams.textContent = String(totalExams);
    if (dom.kpiTotalAppeared) dom.kpiTotalAppeared.textContent = totalAppeared.toLocaleString();
    if (dom.kpiTotalEvaluated) dom.kpiTotalEvaluated.textContent = totalEvaluated.toLocaleString();
    if (dom.kpiTotalPending) dom.kpiTotalPending.textContent = String(totalPending);
  }

  // ==========================================================================
  // 4. VIEW ROUTER
  // ==========================================================================
  function switchView(viewName, activeNavOverride) {
    [dom.viewLogin, dom.viewDashboard, dom.viewExamCandidates, dom.viewWorkbench, dom.viewReport].forEach((el) => {
      if (el) el.classList.remove('active');
    });

    if (dom.topNav) {
      dom.topNav.style.display = viewName === 'login' ? 'none' : 'block';
    }
    if (dom.btnChatFab) {
      dom.btnChatFab.style.display = viewName === 'login' ? 'none' : 'inline-flex';
    }

    [dom.navLinkDash, dom.navLinkExams, dom.navLinkPending, dom.navLinkCandidates, dom.navLinkToppers].forEach((btn) => {
      if (btn) btn.classList.remove('active');
    });

    if (viewName === 'login' && dom.viewLogin) {
      dom.viewLogin.classList.add('active');
    } else if (viewName === 'dashboard' && dom.viewDashboard) {
      dom.viewDashboard.classList.add('active');
      if (activeNavOverride && activeNavOverride.classList) {
        activeNavOverride.classList.add('active');
      } else if (dom.navLinkDash) {
        dom.navLinkDash.classList.add('active');
      }
      updateAcademyKpiTotals();
      renderAcademyExamsTable();
    } else if (viewName === 'exam-candidates' && dom.viewExamCandidates) {
      dom.viewExamCandidates.classList.add('active');
      if (activeNavOverride && activeNavOverride.classList) {
        activeNavOverride.classList.add('active');
      } else if (activeCandidateFilter === 'FLAGGED' && dom.navLinkPending) {
        dom.navLinkPending.classList.add('active');
      } else if (isAllExamsCandidateSearchMode && dom.navLinkCandidates) {
        dom.navLinkCandidates.classList.add('active');
      } else if (dom.navLinkExams) {
        dom.navLinkExams.classList.add('active');
      }
      renderExamCandidatesView();
    } else if (viewName === 'workbench' && dom.viewWorkbench) {
      dom.viewWorkbench.classList.add('active');
      if (dom.navLinkPending && activeStudent && activeStudent.flagged) {
        dom.navLinkPending.classList.add('active');
      } else if (dom.navLinkExams) {
        dom.navLinkExams.classList.add('active');
      }
      populateWorkbenchCandidateSelect();
      renderWorkbenchQuestion(activeQuestionIndex);
    } else if (viewName === 'report' && dom.viewReport) {
      dom.viewReport.classList.add('active');
      if (dom.navLinkToppers) dom.navLinkToppers.classList.add('active');
      renderReport();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================================================
  // 5. EVENT BINDINGS
  // ==========================================================================
  function openCreateExamModal() {
    pendingGeneratedRubric = [];
    if (dom.aiRubricPreviewBox) {
      dom.aiRubricPreviewBox.style.display = 'none';
      dom.aiRubricPreviewBox.innerHTML = '';
    }
    if (dom.createExamCode && !dom.createExamCode.value) {
      dom.createExamCode.value = `EXAM-${String(examsList.length + 1).padStart(2, '0')}`;
    }
    if (dom.createExamDate && !dom.createExamDate.value) {
      dom.createExamDate.value = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
    if (dom.modalCreateExam) dom.modalCreateExam.classList.add('open');
  }

  function closeCreateExamModal() {
    if (dom.modalCreateExam) dom.modalCreateExam.classList.remove('open');
  }

  function openMobileApiModal() {
    if (dom.mobileTestRollInput && !dom.mobileTestRollInput.value && activeStudent) {
      dom.mobileTestRollInput.value = activeStudent.rollNo || '';
    }
    if (dom.modalMobileApi) dom.modalMobileApi.classList.add('open');
  }

  function closeMobileApiModal() {
    if (dom.modalMobileApi) dom.modalMobileApi.classList.remove('open');
  }

  async function publishExamResults(examId, clearFlags = true) {
    if (!examId) {
      showToast('Select or create an examination first.', true);
      return;
    }
    try {
      const res = await fetch(`/api/exams/${encodeURIComponent(examId)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearFlags })
      });
      const data = await res.json();
      if (res.ok && data && data.exam) {
        await loadJobsFromBackend(activeStudent ? activeStudent.id : null);
        showToast(
          `Published ${data.exam.code} results to the Student Mobile App (${data.releasedScriptsCount || 0} script(s) released).`
        );
      } else {
        showToast((data && data.error) || 'Failed to publish exam results', true);
      }
    } catch (err) {
      showToast('Error publishing exam results: ' + err.message, true);
    }
  }

  function openUploadModal() {
    populateUploadExamSelect();
    if (dom.modalUploadScript) dom.modalUploadScript.classList.add('open');
  }

  function closeUploadModal() {
    if (dom.modalUploadScript) dom.modalUploadScript.classList.remove('open');
  }

  function bindEvents() {
    if (dom.loginForm) {
      dom.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        switchView('dashboard');
      });
    }

    if (dom.navBrandLogo) {
      dom.navBrandLogo.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('dashboard');
      });
    }

    if (dom.navLinkDash) {
      dom.navLinkDash.addEventListener('click', () => {
        activeExamFilter = 'ALL';
        syncExamFilterTabsUI();
        switchView('dashboard', dom.navLinkDash);
      });
    }

    if (dom.navLinkExams) {
      dom.navLinkExams.addEventListener('click', () => {
        activeExamFilter = 'ALL';
        syncExamFilterTabsUI();
        switchView('dashboard', dom.navLinkExams);
        if (dom.academyExamsPanel) {
          dom.academyExamsPanel.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    if (dom.navLinkPending) {
      dom.navLinkPending.addEventListener('click', () => {
        isAllExamsCandidateSearchMode = true;
        activeCandidateFilter = 'FLAGGED';
        syncCandidateFilterTabsUI();
        switchView('exam-candidates', dom.navLinkPending);
      });
    }

    if (dom.navLinkCandidates) {
      dom.navLinkCandidates.addEventListener('click', () => {
        isAllExamsCandidateSearchMode = true;
        activeCandidateFilter = 'ALL';
        syncCandidateFilterTabsUI();
        switchView('exam-candidates', dom.navLinkCandidates);
        if (dom.dashStudentSearch) dom.dashStudentSearch.focus();
      });
    }

    if (dom.navLinkToppers) {
      dom.navLinkToppers.addEventListener('click', () => {
        isAllExamsCandidateSearchMode = true;
        activeCandidateFilter = 'ALL';
        studentsList.sort(
          (a, b) => ((b.tests && b.tests[0]?.awardedMarks) || 0) - ((a.tests && a.tests[0]?.awardedMarks) || 0)
        );
        syncCandidateFilterTabsUI();
        switchView('exam-candidates', dom.navLinkToppers);
      });
    }

    if (dom.btnLogout) {
      dom.btnLogout.addEventListener('click', () => {
        switchView('login');
      });
    }

    if (dom.btnThemeToggle) {
      dom.btnThemeToggle.addEventListener('click', toggleTheme);
    }
    if (dom.btnLoginThemeToggle) {
      dom.btnLoginThemeToggle.addEventListener('click', toggleTheme);
    }

    // 4 Clickable Academy KPI Cards on Dashboard
    if (dom.kpiCardExams) {
      dom.kpiCardExams.addEventListener('click', () => {
        activeExamFilter = 'ALL';
        syncExamFilterTabsUI();
        renderAcademyExamsTable();
        if (dom.academyExamsPanel) dom.academyExamsPanel.scrollIntoView({ behavior: 'smooth' });
      });
    }

    if (dom.kpiCardStudents) {
      dom.kpiCardStudents.addEventListener('click', () => {
        isAllExamsCandidateSearchMode = true;
        activeCandidateFilter = 'ALL';
        syncCandidateFilterTabsUI();
        switchView('exam-candidates');
      });
    }

    if (dom.kpiCardEvaluated) {
      dom.kpiCardEvaluated.addEventListener('click', () => {
        isAllExamsCandidateSearchMode = true;
        activeCandidateFilter = 'CERTIFIED';
        syncCandidateFilterTabsUI();
        switchView('exam-candidates');
      });
    }

    if (dom.kpiCardPending) {
      dom.kpiCardPending.addEventListener('click', () => {
        activeExamFilter = 'PENDING';
        syncExamFilterTabsUI();
        renderAcademyExamsTable();
        if (dom.academyExamsPanel) dom.academyExamsPanel.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Examinations List Filters & Search
    if (dom.examFilterTabs) {
      dom.examFilterTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.pf-filter-tab');
        if (!btn) return;
        activeExamFilter = btn.getAttribute('data-exam-filter') || 'ALL';
        syncExamFilterTabsUI();
        renderAcademyExamsTable();
      });
    }

    if (dom.examSubjectFilter) {
      dom.examSubjectFilter.addEventListener('change', (e) => {
        activeExamSubject = e.target.value || 'ALL';
        renderAcademyExamsTable();
      });
    }

    if (dom.examSearchInput) {
      dom.examSearchInput.addEventListener('input', (e) => {
        currentExamSearchQuery = e.target.value.trim();
        renderAcademyExamsTable();
      });
    }

    // Exam Candidates Queue Navigation & Filters
    if (dom.btnBackToExams) {
      dom.btnBackToExams.addEventListener('click', () => {
        switchView('dashboard');
      });
    }

    if (dom.dashAiFilterTabs) {
      dom.dashAiFilterTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.pf-filter-tab');
        if (!btn) return;
        activeCandidateFilter = btn.getAttribute('data-filter') || 'ALL';
        syncCandidateFilterTabsUI();
        renderExamCandidatesTable();
      });
    }

    if (dom.dashStudentSearch) {
      dom.dashStudentSearch.addEventListener('input', (e) => {
        currentStudentSearchQuery = e.target.value.trim();
        if (dom.dashSearchClear) {
          dom.dashSearchClear.style.display = currentStudentSearchQuery.length > 0 ? 'inline-flex' : 'none';
        }
        renderExamCandidatesTable();
      });
    }

    if (dom.dashSearchClear) {
      dom.dashSearchClear.addEventListener('click', () => {
        currentStudentSearchQuery = '';
        if (dom.dashStudentSearch) dom.dashStudentSearch.value = '';
        dom.dashSearchClear.style.display = 'none';
        renderExamCandidatesTable();
      });
    }

    // Create Examination Modal & AI Rubric Builder
    if (dom.btnOpenCreateExamModal) {
      dom.btnOpenCreateExamModal.addEventListener('click', openCreateExamModal);
    }
    if (dom.btnCloseCreateExamModal) {
      dom.btnCloseCreateExamModal.addEventListener('click', closeCreateExamModal);
    }
    if (dom.btnCancelCreateExamModal) {
      dom.btnCancelCreateExamModal.addEventListener('click', closeCreateExamModal);
    }

    if (dom.btnAiGenerateRubric) {
      dom.btnAiGenerateRubric.addEventListener('click', async () => {
        const subject = dom.createExamSubject ? dom.createExamSubject.value : 'Corporate & Other Laws';
        const maxMarks = dom.createExamMaxMarks ? Number(dom.createExamMaxMarks.value) || 100 : 100;
        const customPrompt = dom.createExamRubric ? dom.createExamRubric.value.trim() : '';
        let title = dom.createExamTitle ? dom.createExamTitle.value.trim() : '';
        if (!title) {
          title = `${subject} — Mock Test ${examsList.length + 1}`;
          if (dom.createExamTitle) dom.createExamTitle.value = title;
        }

        dom.btnAiGenerateRubric.disabled = true;
        dom.btnAiGenerateRubric.innerHTML = '<span>Generating ICAI Rubric...</span>';

        try {
          const res = await fetch('/api/exams/generate-rubric', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              subject,
              maxMarks,
              questionCount: 4,
              topicNotes: customPrompt,
              customPrompt
            })
          });
          const data = await res.json();
          if (res.ok && data && Array.isArray(data.questionsRubric)) {
            pendingGeneratedRubric = data.questionsRubric;
            if (dom.createExamRubric && data.rubricNotes) {
              dom.createExamRubric.value = data.rubricNotes;
            }
            if (dom.aiRubricPreviewBox) {
              dom.aiRubricPreviewBox.style.display = 'block';
              dom.aiRubricPreviewBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong>Structured ICAI Step Rubric Ready (${pendingGeneratedRubric.length} Questions · ${maxMarks.toFixed(1)} Marks)</strong>
                  <span class="font-mono text-xs text-success">Own-Figure Enabled</span>
                </div>
                <div class="font-mono text-xs" style="display:grid; gap:4px; color:var(--pf-ink-secondary);">
                  ${pendingGeneratedRubric
                    .map(
                      (q) =>
                        `<div><strong>[${escapeHtml(q.code)}]</strong> ${escapeHtml(q.title)} (${escapeHtml(
                          q.sectionRef
                        )}) — ${Number(q.maxMarks).toFixed(1)}m · ${(q.steps || []).length} steps</div>`
                    )
                    .join('')}
                </div>
              `;
            }
            showToast(`Generated ${pendingGeneratedRubric.length}-question ICAI step rubric for ${subject}.`);
          } else {
            showToast((data && data.error) || 'Could not generate rubric', true);
          }
        } catch (err) {
          showToast('Error generating rubric: ' + err.message, true);
        } finally {
          dom.btnAiGenerateRubric.disabled = false;
          dom.btnAiGenerateRubric.innerHTML = '<span>Generate ICAI Step Rubric with AI</span>';
        }
      });
    }

    if (dom.formCreateExam) {
      dom.formCreateExam.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          code: dom.createExamCode ? dom.createExamCode.value.trim() : '',
          title: dom.createExamTitle ? dom.createExamTitle.value.trim() : '',
          subject: dom.createExamSubject ? dom.createExamSubject.value : 'Corporate & Other Laws',
          maxMarks: dom.createExamMaxMarks ? Number(dom.createExamMaxMarks.value) : 100,
          date: dom.createExamDate ? dom.createExamDate.value.trim() : '',
          rubricNotes: dom.createExamRubric ? dom.createExamRubric.value.trim() : '',
          questionsRubric: pendingGeneratedRubric
        };

        try {
          const res = await fetch('/api/exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data && data.exam) {
            examsList.push(data.exam);
            activeExam = data.exam;
            pendingGeneratedRubric = [];
            closeCreateExamModal();
            dom.formCreateExam.reset();
            populateUploadExamSelect();
            updateAcademyKpiTotals();
            renderAcademyExamsTable();
            showToast(`Created examination ${data.exam.code}: ${data.exam.title}.`);
          } else {
            showToast((data && data.error) || 'Failed to create examination', true);
          }
        } catch (err) {
          showToast('Error creating examination: ' + err.message, true);
        }
      });
    }

    // Mobile App API & Result Release Gate Modal
    if (dom.btnOpenMobileApiModal) dom.btnOpenMobileApiModal.addEventListener('click', openMobileApiModal);
    if (dom.btnCloseMobileApiModal) dom.btnCloseMobileApiModal.addEventListener('click', closeMobileApiModal);
    if (dom.btnDoneMobileApiModal) dom.btnDoneMobileApiModal.addEventListener('click', closeMobileApiModal);

    if (dom.btnTestMobileResult) {
      dom.btnTestMobileResult.addEventListener('click', async () => {
        const roll = dom.mobileTestRollInput ? dom.mobileTestRollInput.value.trim() : '';
        if (!roll) {
          showToast('Enter a student Roll Number to test the mobile result endpoint.', true);
          return;
        }
        try {
          const res = await fetch(`/api/mobile/results/${encodeURIComponent(roll)}`);
          const data = await res.json();
          if (dom.mobileTestResultOutput) {
            dom.mobileTestResultOutput.textContent = JSON.stringify(data, null, 2);
          }
        } catch (err) {
          if (dom.mobileTestResultOutput) {
            dom.mobileTestResultOutput.textContent = 'Error querying mobile endpoint: ' + err.message;
          }
        }
      });
    }

    if (dom.btnPublishExamResults) {
      dom.btnPublishExamResults.addEventListener('click', () => {
        const targetExamId = (activeExam && activeExam.id) || (examsList[0] && examsList[0].id);
        publishExamResults(targetExamId, true);
      });
    }

    // Upload Script Modal
    if (dom.btnOpenUploadModal) dom.btnOpenUploadModal.addEventListener('click', openUploadModal);
    if (dom.btnExamUploadScript) dom.btnExamUploadScript.addEventListener('click', openUploadModal);
    if (dom.btnCloseUploadModal) dom.btnCloseUploadModal.addEventListener('click', closeUploadModal);
    if (dom.btnCancelUploadModal) dom.btnCancelUploadModal.addEventListener('click', closeUploadModal);

    if (dom.formUploadScript) {
      dom.formUploadScript.addEventListener('submit', async (e) => {
        e.preventDefault();
        const candidateName = dom.uploadCandidateName ? dom.uploadCandidateName.value.trim() : '';
        const rollNo = dom.uploadRollNo ? dom.uploadRollNo.value.trim() : '';
        const region = dom.uploadRegion ? dom.uploadRegion.value : 'WIRC';
        const selectedExamId = dom.uploadExamSelect ? dom.uploadExamSelect.value : '';
        const transcriptText = dom.uploadTranscriptText ? dom.uploadTranscriptText.value.trim() : '';
        const fileObj =
          dom.uploadFileInput && dom.uploadFileInput.files && dom.uploadFileInput.files[0]
            ? dom.uploadFileInput.files[0]
            : null;

        if (!candidateName || !rollNo) {
          showToast('Please enter the student name and roll number.', true);
          return;
        }
        if (!fileObj && !transcriptText) {
          showToast('Please attach a script file or paste the answer transcript.', true);
          return;
        }

        const formData = new FormData();
        formData.append('candidateName', candidateName);
        formData.append('rollNo', rollNo);
        formData.append('region', region);
        if (selectedExamId) formData.append('examId', selectedExamId);
        if (transcriptText) formData.append('transcriptText', transcriptText);
        if (fileObj) formData.append('file', fileObj);

        const submitBtn = document.getElementById('btn-submit-upload-script');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (res.ok && data && data.job) {
            if (data.exam && !examsList.some((ex) => ex.id === data.exam.id)) {
              examsList.push(data.exam);
            }
            activeExam = data.exam || examsList.find((ex) => ex.id === data.job.examId) || examsList[0] || null;
            studentsList.unshift(data.job);
            activeStudent = data.job;
            activeQuestionIndex = 0;
            selectedTranscriptVersion = data.job.transcript_store.current_version || 'v1';
            closeUploadModal();
            dom.formUploadScript.reset();
            populateUploadExamSelect();
            populateWorkbenchCandidateSelect();
            updateAcademyKpiTotals();
            renderAcademyExamsTable();
            renderExamCandidatesView();
            renderWorkbenchQuestion(0);
            renderReport();
            switchView('workbench');
            showToast(`Uploaded and evaluated ${data.job.name} (${data.job.rollNo}).`);
          } else {
            showToast((data && data.error) || 'Upload failed', true);
          }
        } catch (err) {
          showToast('Error uploading script: ' + err.message, true);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    if (dom.btnExportStudentsCsv) {
      dom.btnExportStudentsCsv.addEventListener('click', () => {
        if (studentsList.length === 0) {
          showToast('No candidate marks available to export.', true);
          return;
        }
        const headers = ['Exam Code,Roll No,Candidate Name,Region,Transcript Version,Provisional Score,Max Marks,Status'];
        const rows = studentsList.map((s) => {
          const t = (s.tests && s.tests[0]) || { awardedMarks: 0, maxMarks: 100 };
          const ver = (s.transcript_store && s.transcript_store.current_version) || 'v1';
          return `${s.examCode || ''},${s.rollNo},"${s.name}",${s.region},${ver},${t.awardedMarks},${t.maxMarks},"${s.aiStatus}"`;
        });
        const blob = new Blob([headers.concat(rows).join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeExam ? activeExam.code : 'Academy'}_Candidate_Marks.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported Candidate Marks CSV.');
      });
    }

    // Workbench Navigation & Controls
    if (dom.btnWbBackCandidates) {
      dom.btnWbBackCandidates.addEventListener('click', () => {
        switchView('exam-candidates');
      });
    }

    if (dom.btnWbToggleFlag) {
      dom.btnWbToggleFlag.addEventListener('click', () => {
        if (!activeStudent) return;
        activeStudent.flagged = !activeStudent.flagged;
        if (activeStudent.flagged && !activeStudent.flagReason) {
          activeStudent.flagReason = 'Manually Flagged by Faculty for Secondary Review';
          activeStudent.flagDetails = 'Script manually marked for faculty verification.';
        }
        updateAcademyKpiTotals();
        populateWorkbenchCandidateSelect();
        renderWorkbenchQuestion(activeQuestionIndex);
        showToast(
          activeStudent.flagged
            ? `Flagged ${activeStudent.name}'s script for review.`
            : `Cleared review flag on ${activeStudent.name}'s script.`
        );
      });
    }

    if (dom.wbStudentSelect) {
      dom.wbStudentSelect.addEventListener('change', (e) => {
        const found = studentsList.find((s) => s.id === e.target.value);
        if (found) {
          activeStudent = found;
          activeQuestionIndex = 0;
          selectedTranscriptVersion =
            (activeStudent.transcript_store && activeStudent.transcript_store.current_version) || 'v1';
          renderWorkbenchQuestion(0);
          renderReport();
        }
      });
    }

    if (dom.btnPrevQ) {
      dom.btnPrevQ.addEventListener('click', () => {
        const qs = getActiveQuestions();
        if (qs.length === 0) return;
        if (activeQuestionIndex > 0) renderWorkbenchQuestion(activeQuestionIndex - 1);
        else renderWorkbenchQuestion(qs.length - 1);
      });
    }
    if (dom.btnNextQ) {
      dom.btnNextQ.addEventListener('click', () => {
        const qs = getActiveQuestions();
        if (qs.length === 0) return;
        if (activeQuestionIndex < qs.length - 1) renderWorkbenchQuestion(activeQuestionIndex + 1);
        else renderWorkbenchQuestion(0);
      });
    }
    if (dom.btnWbViewReport) dom.btnWbViewReport.addEventListener('click', () => switchView('report'));

    if (dom.wbModeTabs) {
      dom.wbModeTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.pf-mode-btn');
        if (!btn) return;
        const mode = btn.getAttribute('data-mode');
        if (mode) setReadingMode(mode);
      });
    }

    // Transcript Version Selector & Editor
    if (dom.wbVersionSelect) {
      dom.wbVersionSelect.addEventListener('change', (e) => {
        selectedTranscriptVersion = e.target.value;
        renderWorkbenchQuestion(activeQuestionIndex);
      });
    }

    if (dom.btnToggleTranscriptEditor) {
      dom.btnToggleTranscriptEditor.addEventListener('click', () => {
        if (!activeStudent || !dom.wbTranscriptEditorBox) return;
        const isHidden = dom.wbTranscriptEditorBox.style.display === 'none';
        dom.wbTranscriptEditorBox.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          const qs = getActiveQuestions();
          const q = qs[activeQuestionIndex] || qs[0];
          if (dom.wbTranscriptTextarea && q) {
            dom.wbTranscriptTextarea.value = q.studentText;
          }
        }
      });
    }

    if (dom.btnCancelTranscriptEdit) {
      dom.btnCancelTranscriptEdit.addEventListener('click', () => {
        if (dom.wbTranscriptEditorBox) dom.wbTranscriptEditorBox.style.display = 'none';
      });
    }

    if (dom.btnSaveTranscriptVersion) {
      dom.btnSaveTranscriptVersion.addEventListener('click', async () => {
        if (!activeStudent) return;
        const qs = getActiveQuestions();
        const q = qs[activeQuestionIndex] || qs[0];
        if (!q) return;
        const newText = dom.wbTranscriptTextarea ? dom.wbTranscriptTextarea.value.trim() : '';
        const reasonCat = dom.wbTranscriptReasonCat ? dom.wbTranscriptReasonCat.value : 'OCR_DISPUTE_RESOLUTION';
        const reasonText = dom.wbTranscriptReasonText ? dom.wbTranscriptReasonText.value.trim() : '';

        if (!newText || !reasonText) {
          showToast('Please enter the updated text and a brief note.', true);
          return;
        }

        try {
          const res = await fetch(`/api/jobs/${encodeURIComponent(activeStudent.id)}/transcript`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_code: q.code,
              new_question_text: newText,
              changed_by: 'Faculty Examiner',
              reason_category: reasonCat,
              reason_text: reasonText
            })
          });
          const data = await res.json();
          if (data && data.job) {
            const idx = studentsList.findIndex((s) => s.id === activeStudent.id);
            if (idx !== -1) studentsList[idx] = data.job;
            activeStudent = data.job;
            selectedTranscriptVersion = data.current_version;
            if (dom.wbTranscriptEditorBox) dom.wbTranscriptEditorBox.style.display = 'none';
            if (dom.wbTranscriptReasonText) dom.wbTranscriptReasonText.value = '';
            populateWorkbenchCandidateSelect();
            updateAcademyKpiTotals();
            renderWorkbenchQuestion(activeQuestionIndex);
            renderReport();
            showToast(`Saved Transcript ${data.current_version} and re-graded.`);
          } else {
            showToast((data && data.error) || 'Could not save transcript', true);
          }
        } catch (err) {
          showToast('Error saving transcript: ' + err.message, true);
        }
      });
    }

    // Faculty Step Mark Override
    if (dom.btnCancelOverride) {
      dom.btnCancelOverride.addEventListener('click', () => {
        if (dom.wbOverrideFormBox) dom.wbOverrideFormBox.style.display = 'none';
      });
    }

    if (dom.btnSubmitOverride) {
      dom.btnSubmitOverride.addEventListener('click', async () => {
        if (!activeStudent) return;
        const qs = getActiveQuestions();
        const q = qs[activeQuestionIndex] || qs[0];
        if (!q) return;
        const stepNo = Number(dom.wbOverrideStepNo ? dom.wbOverrideStepNo.value : 1);
        const newMarks = Number(dom.wbOverrideNewMarks ? dom.wbOverrideNewMarks.value : 0);
        const reasonCat = dom.wbOverrideCategory ? dom.wbOverrideCategory.value : 'RUBRIC_STEP_DISCRETION';
        const reasonText = dom.wbOverrideReasonText ? dom.wbOverrideReasonText.value.trim() : '';

        if (!reasonText) {
          showToast('Please enter a brief reason note for the override.', true);
          return;
        }

        try {
          const res = await fetch(`/api/jobs/${encodeURIComponent(activeStudent.id)}/override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_code: q.code,
              step_no: stepNo,
              new_marks: newMarks,
              reason_category: reasonCat,
              reason_text: reasonText,
              faculty_id: 'Faculty Examiner'
            })
          });
          const data = await res.json();
          if (data && data.job) {
            const idx = studentsList.findIndex((s) => s.id === activeStudent.id);
            if (idx !== -1) studentsList[idx] = data.job;
            activeStudent = data.job;
            if (dom.wbOverrideFormBox) dom.wbOverrideFormBox.style.display = 'none';
            if (dom.wbOverrideReasonText) dom.wbOverrideReasonText.value = '';
            populateWorkbenchCandidateSelect();
            updateAcademyKpiTotals();
            renderWorkbenchQuestion(activeQuestionIndex);
            renderReport();
            showToast(`Updated ${q.code} Step ${stepNo} to ${newMarks.toFixed(1)} marks.`);
          } else {
            showToast((data && data.error) || 'Override failed', true);
          }
        } catch (err) {
          showToast('Failed to submit override: ' + err.message, true);
        }
      });
    }

    // Report View Actions
    if (dom.btnReportBackCandidates) {
      dom.btnReportBackCandidates.addEventListener('click', () => switchView('exam-candidates'));
    }
    if (dom.btnReportBackWb) {
      dom.btnReportBackWb.addEventListener('click', () => switchView('workbench'));
    }
    const openDisputeEditorInWorkbench = () => {
      if (!activeStudent) return;
      switchView('workbench');
      if (dom.wbTranscriptEditorBox) {
        dom.wbTranscriptEditorBox.style.display = 'block';
        const qs = getActiveQuestions();
        const q = qs[activeQuestionIndex] || qs[0];
        if (dom.wbTranscriptTextarea && q) dom.wbTranscriptTextarea.value = q.studentText;
        if (dom.wbTranscriptReasonCat) dom.wbTranscriptReasonCat.value = 'STUDENT_DISPUTE_CORRECTION';
      }
    };
    if (dom.btnReportFlagTranscript) dom.btnReportFlagTranscript.addEventListener('click', openDisputeEditorInWorkbench);
    if (dom.btnRepOpenDispute) dom.btnRepOpenDispute.addEventListener('click', openDisputeEditorInWorkbench);

    if (dom.btnReportPrint) {
      dom.btnReportPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // Admin Command Chatbot Drawer Events
    const openChatDrawer = () => {
      if (dom.chatDrawer) dom.chatDrawer.classList.add('open');
      if (dom.chatBackdrop) dom.chatBackdrop.classList.add('open');
      if (dom.chatInputField) setTimeout(() => dom.chatInputField.focus(), 120);
    };
    const closeChatDrawer = () => {
      if (dom.chatDrawer) dom.chatDrawer.classList.remove('open');
      if (dom.chatBackdrop) dom.chatBackdrop.classList.remove('open');
    };

    if (dom.btnOpenChatDrawer) dom.btnOpenChatDrawer.addEventListener('click', openChatDrawer);
    if (dom.btnChatFab) dom.btnChatFab.addEventListener('click', openChatDrawer);
    if (dom.btnCloseChatDrawer) dom.btnCloseChatDrawer.addEventListener('click', closeChatDrawer);
    if (dom.chatBackdrop) dom.chatBackdrop.addEventListener('click', closeChatDrawer);

    if (dom.btnClearChat) {
      dom.btnClearChat.addEventListener('click', () => {
        chatHistory = [
          {
            role: 'model',
            text: 'Conversation cleared. Ready for your next command.',
            actions: [],
            toppers: null,
            timestamp: 'Reset'
          }
        ];
        renderChatThread();
      });
    }

    if (dom.chatQuickChips) {
      dom.chatQuickChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.pf-chat-chip');
        if (!chip) return;
        const cmd = chip.getAttribute('data-cmd');
        if (cmd) sendChatMessage(cmd);
      });
    }

    if (dom.formAdminChat) {
      dom.formAdminChat.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!dom.chatInputField) return;
        const text = dom.chatInputField.value.trim();
        if (!text) return;
        dom.chatInputField.value = '';
        sendChatMessage(text);
      });
    }
  }

  function renderChatThread() {
    if (!dom.chatMessagesThread) return;
    dom.chatMessagesThread.innerHTML = chatHistory
      .map((item) => {
        const actionsHtml =
          item.actions && item.actions.length > 0
            ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
                 ${item.actions
                   .map(
                     (a) =>
                       `<span class="pf-chat-action-badge">[ACTION EXECUTED: ${escapeHtml(
                         String(a.type || '').toUpperCase()
                       )}]</span>`
                   )
                   .join('')}
               </div>`
            : '';

        const toppersHtml =
          item.toppers && item.toppers.length > 0
            ? `<div class="pf-chat-toppers-card">
                 <div class="pf-chat-toppers-head">
                   <span>Exam Toppers Leaderboard</span>
                   <span class="font-mono">${escapeHtml(activeExam ? activeExam.code : 'ALL EXAMS')}</span>
                 </div>
                 ${item.toppers
                   .map((t) => {
                     const pct = Math.round((t.awardedMarks / (t.maxMarks || 100)) * 100);
                     return `
                       <div class="pf-chat-topper-row">
                         <div>
                           <strong class="font-mono">#${t.rank}</strong>
                           <strong>${escapeHtml(t.name)}</strong>
                           <span class="text-xs text-muted font-mono">(${escapeHtml(t.rollNo)})</span>
                         </div>
                         <div style="display:flex; align-items:center; gap:6px;">
                           <span class="font-mono font-bold" style="color:var(--pf-accent);">${t.awardedMarks.toFixed(
                             1
                           )}/${(t.maxMarks || 100).toFixed(1)} (${pct}%)</span>
                           <button type="button" class="btn-table-review btn-chat-open-student" data-student-id="${escapeHtml(
                             t.id
                           )}" style="padding:2px 8px; font-size:10.5px;">Report</button>
                         </div>
                       </div>
                     `;
                   })
                   .join('')}
               </div>`
            : '';

        return `
          <div class="pf-chat-msg ${item.role === 'user' ? 'user' : 'model'}">
            <div class="pf-chat-bubble">${escapeHtml(item.text)}</div>
            ${actionsHtml}
            ${toppersHtml}
            <span class="pf-chat-meta">${item.role === 'user' ? 'Admin' : 'Academy Assistant'} · ${escapeHtml(
          item.timestamp || 'Just now'
        )}</span>
          </div>
        `;
      })
      .join('');

    dom.chatMessagesThread.querySelectorAll('.btn-chat-open-student').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sId = btn.getAttribute('data-student-id');
        const found = studentsList.find((s) => s.id === sId);
        if (found) {
          activeStudent = found;
          renderReport();
          switchView('report');
        }
      });
    });

    dom.chatMessagesThread.scrollTop = dom.chatMessagesThread.scrollHeight;
  }

  function executeChatActions(actions, serverToppers, serverExams) {
    let showToppersInBubble = null;
    if (Array.isArray(serverExams)) {
      examsList = serverExams;
      if (!activeExam && examsList.length > 0) activeExam = examsList[0];
    }
    if (!actions || actions.length === 0) return showToppersInBubble;

    for (const act of actions) {
      if (act.type === 'create_examination') {
        populateUploadExamSelect();
        updateAcademyKpiTotals();
        renderAcademyExamsTable();
        showToast('Created examination via Academy Assistant.');
      } else if (act.type === 'publish_exam_results') {
        const code = (act.examCode || 'ALL_READY').toUpperCase();
        examsList.forEach((ex) => {
          if (code === 'ALL_READY' || ex.code.toUpperCase() === code) {
            if (act.clearFlags) ex.pending = 0;
            ex.published = true;
          }
        });
        studentsList.forEach((s) => {
          if (act.clearFlags || !s.flagged) {
            s.flagged = false;
            s.facultyConfirmed = true;
            s.aiStatus = 'Published (Provisional)';
          }
        });
        updateAcademyKpiTotals();
        renderAcademyExamsTable();
        renderExamCandidatesView();
        showToast('Published results.');
      } else if (act.type === 'show_exam_toppers') {
        const count = Number(act.count) || 5;
        studentsList.sort((a, b) => {
          const mA = (a.tests && a.tests[0] && a.tests[0].awardedMarks) || 0;
          const mB = (b.tests && b.tests[0] && b.tests[0].awardedMarks) || 0;
          return mB - mA;
        });
        showToppersInBubble =
          serverToppers && serverToppers.length > 0
            ? serverToppers.slice(0, count)
            : studentsList.slice(0, count).map((s, idx) => ({
                rank: idx + 1,
                id: s.id,
                name: s.name,
                rollNo: s.rollNo,
                awardedMarks: (s.tests && s.tests[0] && s.tests[0].awardedMarks) || 0,
                maxMarks: (s.tests && s.tests[0] && s.tests[0].maxMarks) || 100
              }));
        renderExamCandidatesView();
      } else if (act.type === 'organize_portal_view') {
        if (act.subjectFilter && dom.examSubjectFilter) {
          activeExamSubject = act.subjectFilter;
          dom.examSubjectFilter.value = act.subjectFilter;
        }
        if (act.examFilter) {
          activeExamFilter = act.examFilter === 'PUBLISHED' ? 'COMPLETED' : act.examFilter;
          syncExamFilterTabsUI();
        }
        if (act.sortBy === 'PENDING_DESC') {
          examsList.sort((a, b) => b.pending - a.pending);
        } else if (act.sortBy === 'APPEARED_DESC') {
          examsList.sort((a, b) => b.appeared - a.appeared);
        } else if (act.sortBy === 'SCORE_DESC') {
          studentsList.sort(
            (a, b) => ((b.tests && b.tests[0]?.awardedMarks) || 0) - ((a.tests && a.tests[0]?.awardedMarks) || 0)
          );
        }
        if (act.targetView === 'exam-candidates') {
          if (act.candidateFilter) {
            activeCandidateFilter = act.candidateFilter;
            syncCandidateFilterTabsUI();
          }
          switchView('exam-candidates');
        } else {
          switchView('dashboard');
          renderAcademyExamsTable();
        }
      } else if (act.type === 'manage_student_script') {
        const qLower = String(act.query || '').toLowerCase();
        const found = studentsList.find(
          (s) =>
            s.id === act.studentId ||
            s.rollNo.toLowerCase() === qLower ||
            s.name.toLowerCase().includes(qLower)
        );
        if (found) {
          activeStudent = found;
          activeQuestionIndex = 0;
          if (act.operation === 'CONFIRM_SCRIPT') {
            found.flagged = false;
            found.facultyConfirmed = true;
            found.aiStatus = 'Faculty Confirmed (Provisional)';
            updateAcademyKpiTotals();
            renderAcademyExamsTable();
            renderExamCandidatesView();
            renderWorkbenchQuestion(0);
            showToast(`Confirmed and approved ${found.name}'s script.`);
          } else if (act.operation === 'FLAG_SCRIPT') {
            found.flagged = true;
            found.aiStatus = 'Exception Flag';
            found.flagReason = found.flagReason || 'Flagged via Academy Assistant';
            updateAcademyKpiTotals();
            renderAcademyExamsTable();
            renderExamCandidatesView();
            renderWorkbenchQuestion(0);
            showToast(`Flagged ${found.name}'s script for faculty review.`);
          } else if (act.operation === 'OPEN_REPORT') {
            renderReport();
            switchView('report');
          } else {
            populateWorkbenchCandidateSelect();
            renderWorkbenchQuestion(0);
            switchView('workbench');
          }
        }
      }
    }
    return showToppersInBubble;
  }

  async function sendChatMessage(userText) {
    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    chatHistory.push({
      role: 'user',
      text: userText,
      actions: [],
      toppers: null,
      timestamp: timeLabel
    });
    renderChatThread();

    if (dom.btnSendChat) dom.btnSendChat.disabled = true;
    const selectedModel = (dom.chatModelSelect && dom.chatModelSelect.value) || 'gemini-3.8-flash';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          model: selectedModel,
          history: chatHistory.slice(-10).map((m) => ({ role: m.role, text: m.text })),
          portalContext: {
            totalExams: examsList.length,
            activeExamCode: activeExam ? activeExam.code : 'None',
            activeExamTitle: activeExam ? activeExam.title : 'None'
          }
        })
      });
      const data = await res.json();
      const actions = (data && data.actions) || [];
      const toppersCardData = executeChatActions(actions, data && data.toppers, data && data.exams);

      chatHistory.push({
        role: 'model',
        text: (data && data.reply) || 'Command executed.',
        actions,
        toppers: toppersCardData,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      renderChatThread();
    } catch (err) {
      chatHistory.push({
        role: 'model',
        text: 'Could not reach the command server: ' + err.message,
        actions: [],
        toppers: null,
        timestamp: timeLabel
      });
      renderChatThread();
    } finally {
      if (dom.btnSendChat) dom.btnSendChat.disabled = false;
    }
  }

  function syncExamFilterTabsUI() {
    if (!dom.examFilterTabs) return;
    dom.examFilterTabs.querySelectorAll('.pf-filter-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-exam-filter') === activeExamFilter);
    });
  }

  function syncCandidateFilterTabsUI() {
    if (!dom.dashAiFilterTabs) return;
    dom.dashAiFilterTabs.querySelectorAll('.pf-filter-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === activeCandidateFilter);
    });
  }

  // ==========================================================================
  // 6. LEVEL 1: ACADEMY OVERVIEW & EXAMINATIONS TABLE
  // ==========================================================================
  function renderAcademyExamsTable() {
    if (!dom.academyExamsTbody) return;
    const q = currentExamSearchQuery.toLowerCase();

    const filteredExams = examsList.filter((ex) => {
      if (activeExamFilter === 'PENDING' && ex.pending === 0) return false;
      if (activeExamFilter === 'COMPLETED' && ex.pending > 0) return false;
      if (activeExamSubject !== 'ALL' && ex.subject !== activeExamSubject) return false;
      if (!q) return true;
      return (
        ex.title.toLowerCase().includes(q) ||
        ex.code.toLowerCase().includes(q) ||
        ex.subject.toLowerCase().includes(q)
      );
    });

    if (dom.examsListCount) {
      dom.examsListCount.textContent = `Showing ${filteredExams.length} of ${examsList.length} Academy Exams`;
    }

    if (examsList.length === 0) {
      dom.academyExamsTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 38px 16px; color: var(--pf-muted);">
            <div style="max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <strong style="color: var(--pf-ink); font-size: 14px;">No Academy Examinations Created Yet</strong>
              <span>Create your first examination or upload a student answer script to begin evaluation.</span>
              <div style="display: flex; gap: 8px; margin-top: 4px;">
                <button type="button" class="pf-btn-secondary pf-btn-sm" id="btn-empty-create-exam">+ Create Examination</button>
                <button type="button" class="pf-btn-primary pf-btn-sm" id="btn-empty-upload-script">+ Upload Script</button>
              </div>
            </div>
          </td>
        </tr>
      `;
      const emptyCreateBtn = document.getElementById('btn-empty-create-exam');
      const emptyUploadBtn = document.getElementById('btn-empty-upload-script');
      if (emptyCreateBtn) emptyCreateBtn.addEventListener('click', openCreateExamModal);
      if (emptyUploadBtn) emptyUploadBtn.addEventListener('click', openUploadModal);
      return;
    }

    if (filteredExams.length === 0) {
      dom.academyExamsTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 28px 16px; color: var(--pf-muted);">
            No examinations match the selected filter.
          </td>
        </tr>
      `;
      return;
    }

    dom.academyExamsTbody.innerHTML = filteredExams
      .map((ex) => {
        const pendingBadge = ex.published
          ? `<span class="pf-ai-decision-chip certified"><span class="pf-telemetry-dot"></span>Published to Mobile</span>`
          : ex.pending > 0
          ? `<span class="pf-ai-decision-chip flagged"><span class="pf-telemetry-dot"></span>${ex.pending} Pending</span>`
          : `<span class="pf-ai-decision-chip certified"><span class="pf-telemetry-dot"></span>0 Pending (Held)</span>`;

        const rubricCount = Array.isArray(ex.questionsRubric) ? ex.questionsRubric.length : 0;

        return `
        <tr class="submission-row exam-row-item" data-exam-id="${escapeHtml(ex.id)}">
          <td>
            <div class="pf-candidate-cell">
              <span class="pf-candidate-name">${escapeHtml(ex.title)}</span>
              <span class="pf-candidate-sub font-mono">${escapeHtml(ex.code)} · ${rubricCount > 0 ? `${rubricCount} Rubric Qs` : 'Default ICAI Rubric'}</span>
            </div>
          </td>
          <td>
            <span class="text-xs font-semibold">${escapeHtml(ex.subject)}</span>
            <div class="text-xs text-muted font-mono">${escapeHtml(ex.paperCode || 'CA Final')}</div>
          </td>
          <td class="text-xs text-muted font-mono">${escapeHtml(ex.date)}</td>
          <td class="font-mono text-xs" style="text-align: right;">${Number(ex.maxMarks || 100).toFixed(1)}</td>
          <td class="font-mono font-bold" style="text-align: right;">${ex.appeared || 0}</td>
          <td class="font-mono text-success font-semibold" style="text-align: right;">${ex.evaluated || 0}</td>
          <td style="text-align: right;">${pendingBadge}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
              ${
                !ex.published
                  ? `<button type="button" class="pf-btn-secondary pf-btn-sm btn-row-publish-exam" data-exam-id="${escapeHtml(ex.id)}">Publish</button>`
                  : ''
              }
              <button type="button" class="${ex.pending > 0 ? 'btn-table-resolve' : 'btn-table-review'} btn-open-exam-candidates" data-exam-id="${escapeHtml(ex.id)}">
                View Candidates (${ex.appeared || 0}) &rarr;
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    dom.academyExamsTbody.querySelectorAll('.btn-row-publish-exam').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const exId = btn.getAttribute('data-exam-id');
        publishExamResults(exId, true);
      });
    });

    dom.academyExamsTbody.querySelectorAll('.exam-row-item').forEach((row) => {
      row.addEventListener('click', () => {
        const exId = row.getAttribute('data-exam-id');
        openExamCandidatesQueue(exId);
      });
    });
  }

  function openExamCandidatesQueue(examId) {
    const foundExam = examsList.find((e) => e.id === examId) || examsList[0] || null;
    activeExam = foundExam;
    isAllExamsCandidateSearchMode = false;
    activeCandidateFilter = 'ALL';
    syncCandidateFilterTabsUI();
    switchView('exam-candidates');
  }

  // ==========================================================================
  // 7. LEVEL 2: EXAM CANDIDATES QUEUE
  // ==========================================================================
  function renderExamCandidatesView() {
    if (!activeExam && examsList.length > 0) {
      activeExam = examsList[0];
    }

    if (dom.examPublishStatusPill) {
      const isPub = Boolean(activeExam && activeExam.published);
      dom.examPublishStatusPill.className = `pf-ai-decision-chip ${isPub ? 'certified' : 'flagged'} font-mono`;
      dom.examPublishStatusPill.textContent = isPub
        ? 'Published to Student Mobile App'
        : 'Held (Unpublished to Mobile App)';
    }

    if (dom.btnPublishExamResults) {
      const isPub = Boolean(activeExam && activeExam.published);
      dom.btnPublishExamResults.innerHTML = isPub
        ? '<span>Re-Sync Mobile Publication</span>'
        : '<span>Publish Results to Mobile App</span>';
    }

    if (isAllExamsCandidateSearchMode || !activeExam) {
      if (dom.examDetailBreadcrumb) dom.examDetailBreadcrumb.textContent = 'All Academy Candidates';
      if (dom.examDetailSubject) dom.examDetailSubject.textContent = 'Academy-Wide Student Directory & Script Lookup';
      if (dom.examDetailTitle) dom.examDetailTitle.textContent = 'Uploaded Candidate Scripts';
      if (dom.candidatesTableHeading) dom.candidatesTableHeading.textContent = 'All Appeared Candidates';
    } else {
      if (dom.examDetailBreadcrumb) dom.examDetailBreadcrumb.textContent = `${activeExam.code} · ${activeExam.subject}`;
      if (dom.examDetailSubject) dom.examDetailSubject.textContent = `${activeExam.paperCode || 'CA Final'} · ${activeExam.subject} · Conducted ${activeExam.date}`;
      if (dom.examDetailTitle) dom.examDetailTitle.textContent = activeExam.title;
      if (dom.candidatesTableHeading) dom.candidatesTableHeading.textContent = `Students Appeared in ${activeExam.code}`;
    }

    renderExamCandidatesTable();
  }

  function renderExamCandidatesTable() {
    if (!dom.dashSubmissionsTbody) return;
    const q = currentStudentSearchQuery.toLowerCase();

    const scopedStudents = getFilteredStudentsForActiveExam();
    const totalForContext = scopedStudents.length;
    const flaggedForContext = scopedStudents.filter((s) => s.flagged).length;
    const readyForContext = Math.max(0, totalForContext - flaggedForContext);

    if (dom.examStatAppeared) dom.examStatAppeared.textContent = String(totalForContext);
    if (dom.examStatReady) dom.examStatReady.textContent = String(readyForContext);
    if (dom.examStatPending) dom.examStatPending.textContent = String(flaggedForContext);
    if (dom.examStatMax) {
      dom.examStatMax.textContent = activeExam ? Number(activeExam.maxMarks || 100).toFixed(1) : '100.0';
    }

    if (dom.dashAiFilterTabs) {
      const btnAll = dom.dashAiFilterTabs.querySelector('[data-filter="ALL"]');
      const btnCert = dom.dashAiFilterTabs.querySelector('[data-filter="CERTIFIED"]');
      const btnFlag = dom.dashAiFilterTabs.querySelector('[data-filter="FLAGGED"]');
      if (btnAll) btnAll.textContent = `All Candidates (${totalForContext})`;
      if (btnCert) btnCert.textContent = `Provisional Ready (${readyForContext})`;
      if (btnFlag) btnFlag.textContent = `Pending Review (${flaggedForContext})`;
    }

    const filteredStudents = scopedStudents.filter((student) => {
      if (activeCandidateFilter === 'CERTIFIED' && student.flagged) return false;
      if (activeCandidateFilter === 'FLAGGED' && !student.flagged) return false;
      if (!q) return true;
      return (
        student.name.toLowerCase().includes(q) ||
        student.rollNo.toLowerCase().includes(q) ||
        (student.center && student.center.toLowerCase().includes(q)) ||
        (student.flagReason && student.flagReason.toLowerCase().includes(q))
      );
    });

    if (dom.dashSubmissionsCount) {
      dom.dashSubmissionsCount.textContent = `Showing ${filteredStudents.length} of ${totalForContext} Appeared Students`;
    }

    if (scopedStudents.length === 0) {
      dom.dashSubmissionsTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 38px 16px; color: var(--pf-muted);">
            <div style="max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <strong style="color: var(--pf-ink); font-size: 14px;">No Student Scripts Uploaded Yet</strong>
              <span>Upload a student's handwritten answer script (PDF, image scan, or transcript) to run two-pass OCR and rubric evaluation.</span>
              <button type="button" class="pf-btn-primary pf-btn-sm" id="btn-empty-cand-upload">+ Upload Student Script</button>
            </div>
          </td>
        </tr>
      `;
      const btnEmptyCandUpload = document.getElementById('btn-empty-cand-upload');
      if (btnEmptyCandUpload) btnEmptyCandUpload.addEventListener('click', openUploadModal);
      return;
    }

    if (filteredStudents.length === 0) {
      dom.dashSubmissionsTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 28px 16px; color: var(--pf-muted);">
            No students match the current filter or search query.
          </td>
        </tr>
      `;
      return;
    }

    const displayedExamCode = isAllExamsCandidateSearchMode || !activeExam ? null : activeExam.code;

    dom.dashSubmissionsTbody.innerHTML = filteredStudents
      .map((student) => {
        const lawTest = (student.tests && student.tests[0]) || {
          awardedMarks: 0,
          maxMarks: 100,
          pages: 1
        };
        const pct = Math.round((lawTest.awardedMarks / (lawTest.maxMarks || 100)) * 100);
        const ver = (student.transcript_store && student.transcript_store.current_version) || 'v1';
        const exCode = displayedExamCode || student.examCode || 'EXAM-01';

        const statusHtml = student.flagged
          ? `<div style="display:flex; flex-direction:column; gap:2px;">
               <span class="pf-ai-decision-chip flagged">
                 <span class="pf-telemetry-dot"></span>
                 Pending Review (Held)
               </span>
               <span class="text-xs font-medium" style="color: var(--pf-warning-text);">${escapeHtml(student.flagReason || 'Requires faculty review')}</span>
             </div>`
          : `<div style="display:flex; flex-direction:column; gap:2px;">
               <span class="pf-ai-decision-chip certified">
                 <span class="pf-telemetry-dot"></span>
                 ${
                   student.publishedToStudent
                     ? 'Published to Mobile App'
                     : student.facultyConfirmed
                     ? 'Faculty Confirmed (Held)'
                     : 'Provisional Ready (Held)'
                 }
               </span>
               <span class="text-xs text-muted">${
                 student.publishedToStudent
                   ? 'Visible on Student Mobile App'
                   : 'Held until Admin publishes exam'
               }</span>
             </div>`;

        const sourceBadge =
          student.source === 'MOBILE_APP'
            ? `<span class="font-mono text-xs" style="color: var(--pf-accent);">[Mobile App]</span>`
            : `<span class="font-mono text-xs text-muted">[Admin Upload]</span>`;

        return `
        <tr class="submission-row" data-student-id="${escapeHtml(student.id)}">
          <td>
            <div class="pf-candidate-cell">
              <span class="pf-candidate-name">${escapeHtml(student.name)}</span>
              <span class="pf-candidate-sub font-mono">Roll No: ${escapeHtml(student.rollNo)} ${sourceBadge}</span>
            </div>
          </td>
          <td class="font-mono text-xs">${escapeHtml(exCode)}</td>
          <td class="text-xs text-muted">${escapeHtml(student.center || student.region || '')}</td>
          <td class="font-mono text-xs" style="text-align: right;">${lawTest.pages || 1} pgs · ${escapeHtml(ver)}</td>
          <td class="font-mono font-bold" style="text-align: right;">
            ${lawTest.awardedMarks.toFixed(1)} <span class="text-muted font-normal">/ ${lawTest.maxMarks.toFixed(1)} (${pct}%)</span>
          </td>
          <td>${statusHtml}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
              <button type="button" class="pf-btn-secondary pf-btn-sm btn-row-flag" data-student-id="${escapeHtml(student.id)}" title="Toggle Flag">
                ${student.flagged ? 'Unflag' : 'Flag'}
              </button>
              <button type="button" class="pf-btn-secondary pf-btn-sm btn-open-report" data-student-id="${escapeHtml(student.id)}">
                Report
              </button>
              <button type="button" class="${student.flagged ? 'btn-table-resolve' : 'btn-table-review'} btn-open-wb" data-student-id="${escapeHtml(student.id)}">
                ${student.flagged ? 'Review Script' : 'Grade / Inspect'} &rarr;
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    dom.dashSubmissionsTbody.querySelectorAll('.btn-row-flag').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stId = btn.getAttribute('data-student-id');
        const found = studentsList.find((s) => s.id === stId);
        if (found) {
          found.flagged = !found.flagged;
          if (found.flagged && !found.flagReason) {
            found.flagReason = 'Manually Flagged by Faculty for Review';
          }
          updateAcademyKpiTotals();
          renderExamCandidatesTable();
          showToast(found.flagged ? `Flagged ${found.name} (${found.rollNo}).` : `Cleared flag for ${found.name}.`);
        }
      });
    });

    dom.dashSubmissionsTbody.querySelectorAll('.btn-open-report').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stId = btn.getAttribute('data-student-id');
        const found = studentsList.find((s) => s.id === stId);
        if (found) {
          activeStudent = found;
          selectedTranscriptVersion =
            (activeStudent.transcript_store && activeStudent.transcript_store.current_version) || 'v1';
          renderReport();
          switchView('report');
        }
      });
    });

    dom.dashSubmissionsTbody.querySelectorAll('.btn-open-wb').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stId = btn.getAttribute('data-student-id');
        const found = studentsList.find((s) => s.id === stId);
        if (found) {
          activeStudent = found;
          activeQuestionIndex = 0;
          selectedTranscriptVersion =
            (activeStudent.transcript_store && activeStudent.transcript_store.current_version) || 'v1';
          renderWorkbenchQuestion(0);
          switchView('workbench');
        }
      });
    });

    dom.dashSubmissionsTbody.querySelectorAll('.submission-row').forEach((row) => {
      row.addEventListener('click', () => {
        const stId = row.getAttribute('data-student-id');
        const found = studentsList.find((s) => s.id === stId);
        if (found) {
          activeStudent = found;
          activeQuestionIndex = 0;
          selectedTranscriptVersion =
            (activeStudent.transcript_store && activeStudent.transcript_store.current_version) || 'v1';
          renderWorkbenchQuestion(0);
          switchView('workbench');
        }
      });
    });
  }

  // ==========================================================================
  // 8. LEVEL 3 (SECONDARY): GRADING & REVIEW WORKBENCH
  // ==========================================================================
  function renderWorkbenchRibbon() {
    if (!dom.ribbonTrack) return;
    const questions = getActiveQuestions();
    if (questions.length === 0) {
      dom.ribbonTrack.innerHTML = '';
      return;
    }

    dom.ribbonTrack.innerHTML = questions
      .map((q, idx) => {
        const qAwarded = (q.steps || []).reduce((acc, s) => acc + s.marks, 0);
        const isActive = idx === activeQuestionIndex;
        return `
        <button type="button" class="pf-q-pill-btn ${isActive ? 'active' : ''}" data-q-index="${idx}">
          <span class="font-mono font-bold">${escapeHtml(q.code)}</span>
          <span class="pf-q-pill-score font-mono">${qAwarded.toFixed(1)}/${q.maxMarks.toFixed(1)}</span>
        </button>
      `;
      })
      .join('');

    dom.ribbonTrack.querySelectorAll('.pf-q-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-q-index'), 10);
        renderWorkbenchQuestion(idx);
      });
    });
  }

  function renderWorkbenchFlagBanner() {
    if (!activeStudent) {
      if (dom.wbAiFlagContainer) dom.wbAiFlagContainer.innerHTML = '';
      return;
    }

    const store = activeStudent.transcript_store || { current_version: 'v1', versions: { v1: {} } };

    if (dom.wbVersionSelect && store.versions) {
      const keys = Object.keys(store.versions);
      if (!keys.includes(selectedTranscriptVersion)) {
        selectedTranscriptVersion = store.current_version || 'v1';
      }
      dom.wbVersionSelect.innerHTML = keys
        .map((vKey) => {
          const label = vKey === 'v1' ? 'Transcript v1 (Original)' : `Transcript ${vKey} (Edited)`;
          return `<option value="${vKey}" ${vKey === selectedTranscriptVersion ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        })
        .join('');
    }

    if (dom.btnWbToggleFlag) {
      dom.btnWbToggleFlag.innerHTML = activeStudent.flagged
        ? '<span>Unflag Script</span>'
        : '<span>Flag Script</span>';
    }

    if (!dom.wbAiFlagContainer) return;
    if (activeStudent.flagged) {
      const triggers = activeStudent.triggersFired || [];
      const triggerBadges = triggers
        .map((t) => `<span class="pf-ai-flag-conf-pill font-mono">${escapeHtml(t.code)}</span>`)
        .join(' ');

      dom.wbAiFlagContainer.innerHTML = `
        <div class="pf-ai-flag-banner">
          <div class="pf-ai-flag-left">
            <div class="pf-ai-flag-icon-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div>
              <div class="pf-ai-flag-title-row">
                <h4>Flagged for Faculty Review: ${escapeHtml(activeStudent.flagReason || 'Rule Trigger')}</h4>
                ${triggerBadges}
              </div>
              <p class="pf-ai-flag-desc">${escapeHtml(activeStudent.flagDetails || '')}</p>
            </div>
          </div>
          <div style="flex-shrink:0;">
            <button type="button" class="pf-btn-approve-ai" id="btn-wb-approve-flag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Confirm Script &amp; Clear Flag</span>
            </button>
          </div>
        </div>
      `;

      const approveBtn = document.getElementById('btn-wb-approve-flag');
      if (approveBtn) {
        approveBtn.addEventListener('click', async () => {
          try {
            const res = await fetch(`/api/jobs/${encodeURIComponent(activeStudent.id)}/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                faculty_id: 'Faculty Examiner',
                note: 'Faculty confirmed transcript and step marks.'
              })
            });
            const data = await res.json();
            if (data && data.job) {
              const idx = studentsList.findIndex((s) => s.id === activeStudent.id);
              if (idx !== -1) studentsList[idx] = data.job;
              activeStudent = data.job;
            }
            populateWorkbenchCandidateSelect();
            updateAcademyKpiTotals();
            renderWorkbenchFlagBanner();
            renderWorkbenchQuestion(activeQuestionIndex);
            renderReport();
            showToast(`Confirmed ${activeStudent.name}'s script.`);
          } catch (err) {
            showToast('Error confirming script: ' + err.message, true);
          }
        });
      }
    } else {
      dom.wbAiFlagContainer.innerHTML = '';
    }
  }

  function highlightUnclearAndKeywords(rawText, keywords) {
    let html = escapeHtml(rawText);
    html = html.replace(
      /\bUNCLEAR:[^\s.,;)]+/g,
      (match) => `<span class="pf-unclear-token" title="Ambiguous Handwriting Token">${match}</span>`
    );
    (keywords || []).forEach((kw) => {
      if (!kw || kw.length < 3) return;
      const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedKw})`, 'gi');
      html = html.replace(regex, '<mark class="pf-ocr-highlight">$1</mark>');
    });
    return html;
  }

  function renderWorkbenchQuestion(qIndex) {
    const questions = getActiveQuestions();
    renderWorkbenchRibbon();
    renderWorkbenchFlagBanner();

    if (!activeStudent || questions.length === 0) {
      if (dom.qPagerLabel) dom.qPagerLabel.textContent = '0 / 0';
      if (dom.wbPromptCode) dom.wbPromptCode.textContent = '—';
      if (dom.wbPromptSection) dom.wbPromptSection.textContent = 'No Script Selected';
      if (dom.wbPromptMarks) dom.wbPromptMarks.textContent = '0.0 Marks';
      if (dom.wbPromptTitle) dom.wbPromptTitle.textContent = 'No Candidate Script Loaded';
      if (dom.wbPromptText) {
        dom.wbPromptText.textContent = 'Upload a student answer script to inspect two-pass OCR transcripts and step-by-step rubric grading.';
      }
      if (dom.wbTranscriptBody) {
        dom.wbTranscriptBody.innerHTML = '<div class="text-muted">No candidate transcript available.</div>';
      }
      if (dom.wbTwopassBody) {
        dom.wbTwopassBody.innerHTML = '<div class="text-muted">No two-pass OCR comparison available.</div>';
      }
      if (dom.wbDiffBody) {
        dom.wbDiffBody.innerHTML = '<div class="text-muted">No answer key comparison available.</div>';
      }
      if (dom.wbRubricTitle) dom.wbRubricTitle.textContent = 'Rubric Evaluation';
      if (dom.wbQscorePill) dom.wbQscorePill.textContent = '0.0 / 0.0 Marks';
      if (dom.wbStepCardsContainer) {
        dom.wbStepCardsContainer.innerHTML =
          '<div class="text-muted" style="padding: 16px;">Upload a student script to grade and override rubric steps.</div>';
      }
      renderWorkbenchAuditLog();
      return;
    }

    if (qIndex < 0 || qIndex >= questions.length) qIndex = 0;
    activeQuestionIndex = qIndex;
    const q = questions[qIndex];

    if (dom.qPagerLabel) {
      dom.qPagerLabel.textContent = `${qIndex + 1} / ${questions.length}`;
    }

    const store = activeStudent.transcript_store || { current_version: 'v1', versions: {} };
    const ocr = activeStudent.ocr_report || {};
    const seg = activeStudent.segmentation_report || {};

    if (dom.wbPromptCode) dom.wbPromptCode.textContent = q.code;
    if (dom.wbPromptSection) dom.wbPromptSection.textContent = q.sectionRef || '';
    if (dom.wbPromptMarks) dom.wbPromptMarks.textContent = `${q.maxMarks.toFixed(1)} Marks`;
    if (dom.wbOwnFigureChip) {
      dom.wbOwnFigureChip.style.display = q.ownFigure ? 'inline-flex' : 'none';
    }
    if (dom.wbPromptTitle) dom.wbPromptTitle.textContent = q.title;
    if (dom.wbPromptText) dom.wbPromptText.textContent = q.promptText || '';
    if (dom.wbPageIndicator) {
      dom.wbPageIndicator.textContent = `Version ${selectedTranscriptVersion}`;
    }

    const allTagsPresent = [];
    (q.steps || []).forEach((s) => {
      (s.tagsPresent || []).forEach((t) => allTagsPresent.push(t));
    });

    let displayedQuestionText = q.studentText || '';
    if (
      selectedTranscriptVersion === 'v1' &&
      store.versions &&
      store.versions.v1 &&
      store.current_version !== 'v1'
    ) {
      const v1Full = store.versions.v1.text || '';
      const marker = `[${q.code}]`;
      const startIdx = v1Full.indexOf(marker);
      if (startIdx !== -1) {
        const after = v1Full.slice(startIdx + marker.length).trim();
        const nextBreak = after.indexOf('--- Page Break ---');
        displayedQuestionText = (nextBreak !== -1 ? after.slice(0, nextBreak) : after).trim();
      }
    }

    if (dom.wbTranscriptBody) {
      const unmappedHtml =
        seg.unmapped_blocks && seg.unmapped_blocks.length > 0
          ? `<div style="margin-top:12px; padding:10px; background:var(--pf-warning-bg); border:1px solid var(--pf-warning-border); border-radius:6px; font-size:12px; color:var(--pf-warning-text);">
               <strong>[Unmapped Answer Block]:</strong><br>
               ${escapeHtml(seg.unmapped_blocks.map((u) => (typeof u === 'string' ? u : u.text || '')).join('\n'))}
             </div>`
          : '';
      dom.wbTranscriptBody.innerHTML = `<div class="pf-ocr-pre">${highlightUnclearAndKeywords(displayedQuestionText, allTagsPresent)}</div>${unmappedHtml}`;
    }

    if (dom.wbTwopassBody) {
      const p1Model = ocr.pass1_model || 'gemini-3.8-flash';
      const p2Model = ocr.pass2_model || 'gemini-3.1-flash-lite';
      if (dom.wbTwopassMeta) {
        dom.wbTwopassMeta.textContent = `${p1Model} vs. ${p2Model}`;
      }
      const numDiffs = ocr.numeric_disagreements || [];
      const arith = ocr.arithmetic_check || { passed: true, mismatches: [] };

      dom.wbTwopassBody.innerHTML = `
        <div class="pf-twopass-grid">
          <div class="pf-twopass-col">
            <div class="pf-twopass-col-head">
              <span>Pass 1 OCR</span>
              <span class="font-mono text-xs text-muted">${escapeHtml(p1Model)}</span>
            </div>
            <div class="pf-ocr-pre font-mono" style="font-size:11.5px;">${escapeHtml(displayedQuestionText)}</div>
          </div>
          <div class="pf-twopass-col">
            <div class="pf-twopass-col-head">
              <span>Pass 2 Verification</span>
              <span class="font-mono text-xs text-muted">${escapeHtml(p2Model)}</span>
            </div>
            <div class="pf-ocr-pre font-mono" style="font-size:11.5px;">${escapeHtml(
              numDiffs.length > 0 && q.no === 1
                ? displayedQuestionText.replace(numDiffs[0].pass1_value, numDiffs[0].pass2_value)
                : displayedQuestionText
            )}</div>
          </div>
        </div>
        <div style="margin-top: 10px; padding: 10px 12px; border: 1px solid var(--pf-border); border-radius: 6px; font-size: 12px;">
          <div><strong>Number Match:</strong> ${
            numDiffs.length === 0
              ? '<span class="text-success font-mono">Pass 1 = Pass 2</span>'
              : `<span class="text-warning font-mono">Mismatch: "${escapeHtml(numDiffs[0].pass1_value)}" vs "${escapeHtml(numDiffs[0].pass2_value)}"</span>`
          }</div>
          <div style="margin-top: 4px;"><strong>Arithmetic Check:</strong> ${
            arith.passed
              ? '<span class="text-success font-mono">Passed</span>'
              : `<span class="text-warning font-mono">Mismatch — ${escapeHtml(arith.mismatches.map((m) => `${m.expression} (Expected ${m.expected}, Written ${m.written})`).join('; '))}</span>`
          }</div>
        </div>
      `;
    }

    if (dom.wbDiffBody) {
      dom.wbDiffBody.innerHTML = `
        <div class="pf-diff-grid">
          <div class="pf-diff-col">
            <div class="pf-diff-col-title">Candidate Answer (${escapeHtml(selectedTranscriptVersion)})</div>
            <div class="pf-ocr-pre">${escapeHtml(displayedQuestionText)}</div>
          </div>
          <div class="pf-diff-col icai-model">
            <div class="pf-diff-col-title">ICAI Suggested Answer Key</div>
            <div class="pf-ocr-pre">${escapeHtml(q.icaiModelText || '')}</div>
          </div>
        </div>
      `;
    }

    const totalQScore = (q.steps || []).reduce((acc, s) => acc + s.marks, 0);
    if (dom.wbRubricTitle) {
      dom.wbRubricTitle.textContent = `${q.code} · ${q.title}`;
    }
    if (dom.wbQscorePill) {
      dom.wbQscorePill.textContent = `${totalQScore.toFixed(1)} / ${q.maxMarks.toFixed(1)} Marks`;
    }

    if (dom.wbStepCardsContainer) {
      dom.wbStepCardsContainer.innerHTML = (q.steps || [])
        .map((step, sIdx) => {
          const isFull = step.marks >= step.maxMarks;
          const isPartial = step.marks > 0 && step.marks < step.maxMarks;
          let statusClass = isFull ? 'full-marks' : isPartial ? 'partial-marks' : 'zero-marks';
          let statusBadgeText = step.status || (isFull ? 'PASS' : isPartial ? 'PARTIAL' : 'FAIL');
          if (step.ownFigureApplied) {
            statusBadgeText = 'OWN-FIGURE PASS';
            statusClass = 'full-marks';
          }

          const overrideBanner = step.faculty_override
            ? `<div style="margin: 6px 0; padding: 6px 10px; background: var(--pf-success-bg); border: 1px solid var(--pf-success-border); border-radius: 6px; font-size: 11.5px; color: var(--pf-success-text);">
                 <strong>Faculty Override:</strong> ${escapeHtml(step.faculty_override.previous_marks.toFixed(1))} &rarr; ${escapeHtml(step.faculty_override.new_marks.toFixed(1))} ("${escapeHtml(step.faculty_override.reason_text)}")
               </div>`
            : '';

          return `
          <div class="pf-step-card ${statusClass}">
            <div class="pf-step-card-top">
              <div class="pf-step-title-group">
                <span class="pf-step-num font-mono">STEP ${step.stepNo}</span>
                <strong class="pf-step-title">${escapeHtml(step.title)}</strong>
                <span class="pf-own-figure-chip font-mono" style="${step.ownFigureApplied ? '' : 'background:var(--pf-surface-subtle);color:var(--pf-ink-secondary);border-color:var(--pf-border);'}">[${escapeHtml(statusBadgeText)}]</span>
              </div>
              <div class="pf-step-controls">
                <button type="button" class="pf-step-adj-btn" data-step-idx="${sIdx}" data-delta="-0.5">-0.5</button>
                <span class="pf-step-score-val font-mono">${step.marks.toFixed(1)} / ${step.maxMarks.toFixed(1)}</span>
                <button type="button" class="pf-step-adj-btn" data-step-idx="${sIdx}" data-delta="0.5">+0.5</button>
              </div>
            </div>
            ${overrideBanner}
            <p class="pf-step-feedback">${escapeHtml(step.feedback)}</p>
          </div>
        `;
        })
        .join('');

      dom.wbStepCardsContainer.querySelectorAll('.pf-step-adj-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sIdx = parseInt(btn.getAttribute('data-step-idx'), 10);
          const delta = parseFloat(btn.getAttribute('data-delta'));
          const step = q.steps[sIdx];
          if (!step) return;
          const proposed = Math.max(0, Math.min(step.maxMarks, step.marks + delta));
          if (dom.wbOverrideFormBox) {
            dom.wbOverrideFormBox.style.display = 'block';
            if (dom.wbOverrideFormTitle) {
              dom.wbOverrideFormTitle.textContent = `Override ${q.code} Step ${step.stepNo} (${step.marks.toFixed(1)} -> ${proposed.toFixed(1)})`;
            }
            if (dom.wbOverrideStepNo) dom.wbOverrideStepNo.value = String(step.stepNo);
            if (dom.wbOverrideNewMarks) dom.wbOverrideNewMarks.value = String(proposed);
            if (dom.wbOverrideReasonText) dom.wbOverrideReasonText.focus();
          }
        });
      });
    }

    renderWorkbenchAuditLog();
  }

  function renderWorkbenchAuditLog() {
    if (!dom.wbAuditLogList) return;
    const logs = (activeStudent && activeStudent.audit_log) || [];
    if (dom.wbAuditLogCount) {
      dom.wbAuditLogCount.textContent = `${logs.length} Events`;
    }
    dom.wbAuditLogList.innerHTML = logs
      .map((entry) => {
        const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `
        <div class="pf-audit-log-item">
          <div class="pf-audit-log-top">
            <strong class="font-mono text-xs" style="color:var(--pf-accent);">${escapeHtml(entry.event_type)}</strong>
            <span class="font-mono text-xs text-muted">${escapeHtml(entry.actor)} · ${escapeHtml(timeStr)}</span>
          </div>
          <div style="color:var(--pf-ink-secondary);">${escapeHtml(entry.summary)}</div>
        </div>
      `;
      })
      .join('');
  }

  function setReadingMode(mode) {
    activeMode = mode;
    if (dom.wbModeTabs) {
      dom.wbModeTabs.querySelectorAll('.pf-mode-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
      });
    }
    if (dom.wbOcrCard) dom.wbOcrCard.style.display = mode === 'ocr' ? 'block' : 'none';
    if (dom.wbTwopassCard) dom.wbTwopassCard.style.display = mode === 'twopass' ? 'block' : 'none';
    if (dom.wbDiffCard) dom.wbDiffCard.style.display = mode === 'diff' ? 'block' : 'none';
  }

  // ==========================================================================
  // 9. LEVEL 4 (SECONDARY): STUDENT EVALUATION REPORT
  // ==========================================================================
  function renderReport() {
    if (!activeStudent) {
      if (dom.repName) dom.repName.textContent = '—';
      if (dom.repRoll) dom.repRoll.textContent = '—';
      if (dom.repPaper) dom.repPaper.textContent = '—';
      if (dom.repCenter) dom.repCenter.textContent = '—';
      if (dom.repTranscriptVerLine) dom.repTranscriptVerLine.textContent = '—';
      if (dom.repScoreHuge) dom.repScoreHuge.innerHTML = `0.0 <span class="pf-rep-score-denom">/ 0.0</span>`;
      if (dom.repGradeBadge) dom.repGradeBadge.textContent = 'No Script Selected';
      if (dom.repObservationsBox) {
        dom.repObservationsBox.innerHTML = '<div class="text-muted">Upload a candidate script to generate evaluation observations.</div>';
      }
      if (dom.repQuestionsAuditTrail) {
        dom.repQuestionsAuditTrail.innerHTML = '<div class="text-muted">No question breakdown available.</div>';
      }
      if (dom.repConfirmedTranscriptBox) {
        dom.repConfirmedTranscriptBox.textContent = 'No transcript available.';
      }
      return;
    }

    const questions = getActiveQuestions();
    const totalMax = questions.reduce((acc, q) => acc + q.maxMarks, 0) || 100.0;
    const totalAwarded = questions.reduce(
      (acc, q) => acc + (q.steps || []).reduce((sAcc, s) => sAcc + s.marks, 0),
      0
    );
    const pct = ((totalAwarded / totalMax) * 100).toFixed(1);
    const store = activeStudent.transcript_store || { current_version: 'v1', versions: {} };
    const curVer = store.current_version || 'v1';
    const triggersCount = (activeStudent.triggersFired && activeStudent.triggersFired.length) || 0;

    if (dom.repFlaggedCountLine) {
      dom.repFlaggedCountLine.textContent = `Flags pending faculty review: ${activeStudent.flagged ? Math.max(1, triggersCount) : 0}`;
    }
    if (dom.repAdvisorDisputeLine) {
      dom.repAdvisorDisputeLine.textContent = `Examiner: ${activeStudent.facultyAdvisor || 'Faculty Examiner'} | Dispute window: ${activeStudent.disputeWindowDays || 7} days from release`;
    }
    if (dom.repTranscriptVerLine) {
      dom.repTranscriptVerLine.textContent = `${curVer} (v1 Original Preserved)`;
    }

    if (dom.repName) dom.repName.textContent = activeStudent.name;
    if (dom.repRoll) dom.repRoll.textContent = activeStudent.rollNo;
    if (dom.repPaper) {
      dom.repPaper.textContent =
        activeStudent.examTitle || (activeExam ? `${activeExam.code} · ${activeExam.title}` : 'CA Examination');
    }
    if (dom.repCenter) dom.repCenter.textContent = activeStudent.center || activeStudent.region || '—';
    if (dom.repScoreHuge) {
      dom.repScoreHuge.innerHTML = `${totalAwarded.toFixed(1)} <span class="pf-rep-score-denom">/ ${totalMax.toFixed(1)}</span>`;
    }
    if (dom.repGradeBadge) {
      dom.repGradeBadge.textContent = `${pct}% [PROVISIONAL]`;
    }

    if (dom.repObservationsBox) {
      const obsList = activeStudent.observations || [];
      dom.repObservationsBox.innerHTML =
        obsList.length > 0
          ? `<ul class="pf-insight-list">${obsList.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : '<div class="text-muted">No specific observations recorded.</div>';
    }

    if (dom.repQuestionsAuditTrail) {
      dom.repQuestionsAuditTrail.innerHTML = questions
        .map((q) => {
          const qAwarded = (q.steps || []).reduce((acc, s) => acc + s.marks, 0);
          const stepsRows = (q.steps || [])
            .map((s) => {
              const isPass = s.marks >= s.maxMarks;
              const statusTag = s.ownFigureApplied
                ? '[OWN-FIGURE PASS]'
                : isPass
                ? '[PASS]'
                : s.marks > 0
                ? '[PARTIAL]'
                : '[FAIL]';
              return `
              <div style="padding: 8px 10px; border-bottom: 1px solid var(--pf-border); font-size: 12px;">
                <div style="display:flex; justify-content:space-between; gap:8px;">
                  <div>
                    <strong class="font-mono">${statusTag}</strong>
                    <strong>Step ${s.stepNo}: ${escapeHtml(s.title)}</strong>
                  </div>
                  <span class="font-mono font-bold">${s.marks.toFixed(1)} / ${s.maxMarks.toFixed(1)}</span>
                </div>
                <div style="color: var(--pf-ink-secondary); margin-top: 3px;">${escapeHtml(s.feedback)}</div>
              </div>
            `;
            })
            .join('');

          return `
          <div class="pf-audit-q-block">
            <div class="pf-audit-q-head">
              <div>
                <span class="font-mono font-bold">${escapeHtml(q.code)}</span> · <strong>${escapeHtml(q.title)}</strong>
                <span class="text-xs text-muted font-mono" style="margin-left: 8px;">(${escapeHtml(q.sectionRef || '')})</span>
              </div>
              <span class="font-mono font-bold">${qAwarded.toFixed(1)} / ${q.maxMarks.toFixed(1)} Marks</span>
            </div>
            <div style="border: 1px solid var(--pf-border); border-radius: 6px; background: var(--pf-canvas); margin-bottom: 10px;">
              ${stepsRows}
            </div>
          </div>
        `;
        })
        .join('');
    }

    if (dom.repConfirmedTranscriptHeading) {
      dom.repConfirmedTranscriptHeading.textContent = `CONFIRMED TRANSCRIPT (${curVer})`;
    }
    if (dom.repConfirmedTranscriptBox) {
      const fullTranscript =
        (store.versions && store.versions[curVer] && store.versions[curVer].text) ||
        questions.map((q) => `[${q.code}]\n${q.studentText}`).join('\n\n');
      dom.repConfirmedTranscriptBox.textContent = fullTranscript;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
