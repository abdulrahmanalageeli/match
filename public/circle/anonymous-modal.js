(() => {
  'use strict';
  const PUBLIC_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dHdkZ2lpaGZteGlmbHd1eHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMjgwNTEsImV4cCI6MjA2NjgwNDA1MX0.uZL22mbI2wJ4egen2tt7I11qTQrU8kPlN-u5yE8e1qI';
  const ENDPOINT = '/api/circle-dealbreakers';
  const DRAFT_KEY = 'the-circle.dealbreaker-draft.v1';
  const $ = id => document.getElementById(id);
  const dialog = $('anonymous-dialog');
  const form = $('anonymous-form');
  const field = $('anonymous-text');
  const digits = new Intl.NumberFormat('ar-SA', { useGrouping: false });
  let busy = false;
  let submissionId = null;
  let submittedText = null;
  let returnFocus = null;
  let previousOverflow = '';

  function saveDraft() {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text: field.value, submissionId, submittedText })); } catch (_) { /* Storage is optional. */ }
  }
  function clearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) { /* Storage is optional. */ } }
  function clearError() { $('anonymous-error').hidden = true; $('anonymous-error').textContent = ''; field.removeAttribute('aria-invalid'); }
  function showError(message, invalid = false) { $('anonymous-error').textContent = message; $('anonymous-error').hidden = false; field.setAttribute('aria-invalid', String(invalid)); }
  function update() {
    const count = Array.from(field.value).length;
    $('anonymous-counter').textContent = `${digits.format(count)} / ٦٠٠`;
    $('anonymous-counter').setAttribute('aria-label', `${digits.format(count)} من ٦٠٠ حرف`);
    $('anonymous-offline').hidden = navigator.onLine !== false;
    $('anonymous-submit').disabled = busy || navigator.onLine === false;
    $('anonymous-submit-label').textContent = busy ? 'جاري الإرسال…' : 'أرسل بدون اسم';
    field.readOnly = busy;
    form.setAttribute('aria-busy', String(busy));
  }
  function newId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function fitViewport() {
    if (!dialog.open) return;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    dialog.style.setProperty('--modal-viewport', `${height}px`);
    dialog.style.setProperty('--modal-center', `${(viewport?.offsetTop || 0) + height / 2}px`);
    if (document.activeElement === field) requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest', behavior: 'auto' }));
  }
  function open() {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal(); fitViewport(); update();
    $('anonymous-title').focus({ preventScroll: true });
  }
  function close() { if (dialog.open) dialog.close(); }
  function reset() {
    form.reset(); clearDraft(); clearError();
    submissionId = null; submittedText = null;
    $('anonymous-title').textContent = 'وش الديل بريكر عندك؟';
    $('anonymous-description').hidden = false;
    $('anonymous-success').hidden = true; form.hidden = false;
    update();
    field.focus();
  }

  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (draft && typeof draft.text === 'string') {
      field.value = draft.text.slice(0, 600);
      if (typeof draft.submissionId === 'string' && draft.submissionId.length <= 64 && draft.submittedText === field.value.trim()) { submissionId = draft.submissionId; submittedText = draft.submittedText; }
    }
  } catch (_) { /* A malformed draft never prevents use of the form. */ }

  $('open-anonymous').addEventListener('click', open);
  $('close-anonymous').addEventListener('click', close);
  $('anonymous-return').addEventListener('click', close);
  $('anonymous-another').addEventListener('click', reset);
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = previousOverflow;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  field.addEventListener('input', () => {
    // Unchanged retries reuse their UUID; editing creates a new logical submission.
    if (submittedText !== null && field.value.trim() !== submittedText) { submissionId = null; submittedText = null; }
    clearError(); saveDraft(); update();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearError();
    const text = field.value.trim();
    const length = Array.from(text).length;
    if (length < 3 || length > 600) { showError('اكتب مشاركتك من ٣ إلى ٦٠٠ حرف.', true); field.focus(); return; }
    if (navigator.onLine === false) { update(); return; }
    if (!submissionId || submittedText !== text) submissionId = newId();
    submittedText = text; saveDraft(); busy = true; update();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', credentials: 'omit', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${PUBLIC_API_KEY}`, apikey: PUBLIC_API_KEY },
        body: JSON.stringify({ text, submissionId, website: $('anonymous-website').value })
      });
      if (!response.ok) {
        const failure = new Error('Submission failed'); failure.status = response.status; throw failure;
      }
      clearDraft(); submissionId = null; submittedText = null; field.value = ''; $('anonymous-website').value = '';
      form.hidden = true; $('anonymous-success').hidden = false; $('anonymous-description').hidden = true;
      $('anonymous-title').textContent = 'وصلت مشاركتك';
      $('anonymous-trigger-note').textContent = 'وصلت مشاركتك · تقدر تضيف ثانية';
      if ($('landing-success')) $('landing-success').hidden = false;
      if (dialog.open) { dialog.scrollTop = 0; $('anonymous-title').focus({ preventScroll: true }); }
    } catch (failure) {
      if (failure.status === 429) showError('انتظر شوي وحاول ترسل مرّة ثانية. نصك موجود هنا.');
      else if (failure.status === 400 || failure.status === 413) showError('راجع مشاركتك وحاول مرّة ثانية؛ من ٣ إلى ٦٠٠ حرف.');
      else if (failure.name === 'AbortError') showError('الاتصال أخذ وقت. جرّب إرسالها مرّة ثانية؛ ما راح تتكرر.');
      else showError('ما تأكّد الإرسال. تأكّد من الاتصال وحاول مرّة ثانية.');
      saveDraft();
    } finally { clearTimeout(timeout); busy = false; update(); }
  });
  window.visualViewport?.addEventListener('resize', fitViewport);
  window.visualViewport?.addEventListener('scroll', fitViewport);
  window.addEventListener('resize', fitViewport);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
})();
