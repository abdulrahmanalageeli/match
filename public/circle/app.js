(() => {
  'use strict';

  const ENDPOINT = '/api/circle-dealbreakers';
  // Public anonymous API credential. Database reads remain denied by RLS.
  const PUBLIC_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dHdkZ2lpaGZteGlmbHd1eHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMjgwNTEsImV4cCI6MjA2NjgwNDA1MX0.uZL22mbI2wJ4egen2tt7I11qTQrU8kPlN-u5yE8e1qI";
  const DRAFT_KEY = 'the-circle.dealbreaker-draft.v1';
  const MAX_LENGTH = 600;
  const form = document.getElementById('submission-form');
  const field = document.getElementById('dealbreaker');
  const website = document.getElementById('website');
  const button = document.getElementById('submit-button');
  const buttonLabel = document.getElementById('submit-label');
  const count = document.getElementById('count-value');
  const error = document.getElementById('form-error');
  const offlineNotice = document.getElementById('offline-notice');
  const formView = document.getElementById('form-view');
  const successView = document.getElementById('success-view');
  const digits = new Intl.NumberFormat('ar-SA', { useGrouping: false });
  let busy = false;
  let submissionId = null;
  let submittedText = null;

  function saveDraft() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text: field.value, submissionId, submittedText }));
    } catch (_) { /* The form remains usable when browser storage is unavailable. */ }
  }

  function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) { /* Storage is optional. */ }
  }

  function showError(message, invalid = false) {
    error.textContent = message;
    error.hidden = false;
    field.setAttribute('aria-invalid', String(invalid));
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    field.removeAttribute('aria-invalid');
  }

  function updateState() {
    const offline = navigator.onLine === false;
    offlineNotice.hidden = !offline;
    button.disabled = busy || offline;
    field.readOnly = busy;
    form.setAttribute('aria-busy', String(busy));
    buttonLabel.textContent = busy ? 'جاري إرسال مشاركتك…' : 'أرسل مشاركتك';
    button.querySelector('.spinner').hidden = !busy;
    button.querySelector('.button-arrow').hidden = busy;
    count.textContent = digits.format(field.value.length);
    document.getElementById('character-count').setAttribute('aria-label', `${digits.format(field.value.length)} من ${digits.format(MAX_LENGTH)} حرف`);
  }

  function createSubmissionId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (draft && typeof draft.text === 'string') {
      field.value = draft.text.slice(0, MAX_LENGTH);
      if (typeof draft.submissionId === 'string' && draft.submissionId.length <= 64 && draft.submittedText === field.value.trim()) {
        submissionId = draft.submissionId;
        submittedText = draft.submittedText;
      }
    }
  } catch (_) { /* Private browsing or a malformed draft must not block submission. */ }

  field.addEventListener('input', () => {
    // An unchanged retry keeps its ID, including after a timeout or page reload.
    // Editing the content creates a new logical submission.
    if (submittedText !== null && field.value.trim() !== submittedText) {
      submissionId = null;
      submittedText = null;
    }
    clearError();
    saveDraft();
    updateState();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearError();
    const text = field.value.trim();
    if (text.length < 3) {
      showError('اكتب مشاركتك بثلاثة أحرف على الأقل.', true);
      field.focus();
      return;
    }
    if (text.length > MAX_LENGTH) {
      showError('اختصر مشاركتك إلى ٦٠٠ حرف أو أقل.', true);
      field.focus();
      return;
    }
    if (navigator.onLine === false) {
      updateState();
      return;
    }
    if (!submissionId || submittedText !== text) submissionId = createSubmissionId();
    submittedText = text;
    saveDraft();
    busy = true;
    updateState();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${PUBLIC_API_KEY}`, 'apikey': PUBLIC_API_KEY },
        credentials: 'omit',
        body: JSON.stringify({ text, submissionId, website: website.value }),
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 429) throw new Error('انتظر شوي وحاول ترسل مرّة ثانية. مشاركتك ما راحت.');
        if (response.status === 400 || response.status === 413) throw new Error('راجع مشاركتك وحاول مرّة ثانية؛ الحد الأعلى ٦٠٠ حرف.');
        throw new Error('تعذّر الإرسال حاليًا. مشاركتك ما راحت؛ حاول مرّة ثانية.');
      }
      clearDraft();
      submissionId = null;
      submittedText = null;
      field.value = '';
      website.value = '';
      formView.hidden = true;
      successView.hidden = false;
      document.getElementById('success-heading').focus({ preventScroll: true });
      successView.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    } catch (problem) {
      if (problem.name === 'AbortError') showError('الاتصال أخذ وقت. اضغط إرسال مرّة ثانية؛ ما راح تتكرر مشاركتك.');
      else if (problem instanceof TypeError) showError('ما قدرنا نتصل. تأكّد من الإنترنت وحاول مرّة ثانية.');
      else showError(problem.message || 'تعذّر الإرسال. حاول مرّة ثانية.');
      saveDraft();
    } finally {
      clearTimeout(timeout);
      busy = false;
      updateState();
    }
  });

  document.getElementById('another-button').addEventListener('click', () => {
    clearDraft();
    clearError();
    form.reset();
    submissionId = null;
    submittedText = null;
    successView.hidden = true;
    formView.hidden = false;
    updateState();
    field.focus();
  });

  window.addEventListener('online', updateState);
  window.addEventListener('offline', updateState);
  updateState();
})();
