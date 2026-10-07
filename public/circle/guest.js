(() => {
  'use strict';
  const ENDPOINT = '/api/circle-event';
  const PUBLIC_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dHdkZ2lpaGZteGlmbHd1eHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMjgwNTEsImV4cCI6MjA2NjgwNDA1MX0.uZL22mbI2wJ4egen2tt7I11qTQrU8kPlN-u5yE8e1qI';
  const $ = id => document.getElementById(id);
  const choices = Array.from(document.querySelectorAll('[data-choice]'));
  const screens = ['loading', 'auth', 'recovery', 'live'];
  let screen = 'loading';
  let participant = null;
  let currentEvent = null;
  let currentSlide = null;
  let selectedChoice = null;
  let authBusy = false;
  let voteRequest = null;
  let voteRevision = 0;
  let pollTimer = null;
  let polling = false;
  let stateError = false;
  let restoring = false;
  let restoreTimer = null;

  async function api(action, data = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${PUBLIC_API_KEY}`, 'apikey': PUBLIC_API_KEY },
        body: JSON.stringify({ action, ...data })
      });
      let body = {};
      try { body = await response.json(); } catch (_) { /* Status remains authoritative. */ }
      if (!response.ok) {
        const error = new Error('Request failed');
        error.status = response.status;
        error.code = body.error || body.code;
        throw error;
      }
      return body;
    } finally { clearTimeout(timeout); }
  }

  function showScreen(next) {
    screen = next;
    screens.forEach(name => { $(`${name}-view`).hidden = name !== next; });
    if (next !== 'live') clearTimeout(pollTimer);
  }

  function connectionNotice() {
    const offline = navigator.onLine === false;
    const notice = $('connection-notice');
    notice.hidden = !offline && !stateError;
    notice.textContent = offline ? 'أنت بدون اتصال. بنرجع نحدّث السؤال لما يرجع الإنترنت.' : 'تعذّر التحديث للحظة. بنحاول نتصل مرّة ثانية تلقائيًا.';
  }

  function showError(id, message) { $(id).textContent = message; $(id).hidden = false; }
  function clearError(id) { $(id).hidden = true; $(id).textContent = ''; }

  function selectTab(kind, focus = false) {
    ['join', 'login'].forEach(name => {
      const active = name === kind;
      $(`${name}-tab`).setAttribute('aria-selected', String(active));
      $(`${name}-tab`).tabIndex = active ? 0 : -1;
      $(`${name}-panel`).hidden = !active;
    });
    clearError('auth-error');
    if (focus) $(`${kind}-tab`).focus();
  }

  function authLoading(value, kind) {
    authBusy = value;
    ['join', 'login'].forEach(name => {
      $(`${name}-button`).disabled = value || navigator.onLine === false;
      $(`${name}-tab`).disabled = value;
      $(`${name}-form`).setAttribute('aria-busy', String(value && name === kind));
    });
    $('guest-name').disabled = value;
    $('login-code').disabled = value;
    $('join-button').firstChild.textContent = value && kind === 'join' ? 'جاري الانضمام… ' : 'انضم للفعالية ';
    $('login-button').firstChild.textContent = value && kind === 'login' ? 'جاري الدخول… ' : 'ادخل الفعالية ';
  }

  function expiresAt() {
    const value = currentEvent?.endsAt;
    if (typeof value === 'number') return value < 1000000000000 ? value * 1000 : value;
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
  }

  function isVoteSlide() { return currentSlide?.kind === 'scenario' && currentSlide.responseMode === 'vote'; }
  function canVote() { return isVoteSlide() && currentEvent?.votingOpen === true && expiresAt() > Date.now(); }
  function choiceFrom(value) {
    const choice = Number(typeof value === 'object' && value !== null ? value.choice : value);
    return Number.isInteger(choice) && choice >= 1 && choice <= 4 ? choice : null;
  }

  function renderVoting() {
    if (screen !== 'live') return;
    const voteSlide = isVoteSlide();
    const open = canVote();
    const remaining = Math.max(0, Math.ceil((expiresAt() - Date.now()) / 1000));
    $('countdown').hidden = !voteSlide || !currentEvent?.votingOpen || !expiresAt();
    $('countdown-value').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    // Voting controls are available only while the current voting window is open.
    $('vote-options').hidden = !open;
    choices.forEach(button => {
      button.disabled = !open || !!voteRequest || navigator.onLine === false || stateError;
      button.setAttribute('aria-pressed', String(Number(button.dataset.choice) === selectedChoice));
    });
    if (!currentSlide) {
      $('question-note').textContent = 'تابع شاشة الفعالية، والسؤال بيظهر هنا تلقائيًا.';
      $('vote-status').textContent = '';
    } else if (!voteSlide) {
      $('question-note').textContent = currentSlide.kind === 'scenario' ? 'هذا سؤال للنقاش. نسمع آراءكم في القاعة.' : 'تابع النقاش على شاشة الفعالية.';
      $('vote-status').textContent = 'السؤال الجاي بيظهر هنا تلقائيًا.';
    } else if (voteRequest) {
      $('question-note').textContent = 'اختيارك يعبّر عنك. ما فيه إجابة صح أو غلط.';
      $('vote-status').textContent = 'نحفظ اختيارك…';
    } else if (open) {
      $('question-note').textContent = 'اختر اللي يعبّر عنك. تقدر تغيّر رأيك قبل ما يقفل التصويت.';
      $('vote-status').textContent = selectedChoice ? 'وصل اختيارك. تقدر تغيّره والوقت مفتوح.' : 'صوّت من هنا، وخلّنا نسمع وجهة نظرك.';
    } else {
      $('question-note').textContent = currentEvent?.revealed ? 'النتائج معكم على شاشة الفعالية.' : 'التصويت مقفل حاليًا. تابع النقاش في القاعة.';
      const label = selectedChoice ? choices.find(button => Number(button.dataset.choice) === selectedChoice).firstElementChild.textContent : '';
      $('vote-status').textContent = label ? `اختيارك محفوظ: ${label}` : 'بانتظار فتح التصويت أو السؤال الجاي.';
    }
  }

  function renderState() {
    $('participant-name').textContent = participant?.name || '';
    $('event-title').textContent = currentEvent?.title || 'الحدود والديل بريكرز';
    $('question-label').textContent = currentSlide?.label || (currentSlide ? 'معكم في الدائرة' : 'ننتظر البداية');
    $('question-title').textContent = currentSlide?.title || 'خذ راحتك… بنبدأ مع بعض.';
    renderVoting();
    connectionNotice();
  }

  function applyState(data, preserveVote = false) {
    const nextSlide = data.slide || null;
    const changed = String(nextSlide?.id || '') !== String(currentSlide?.id || '');
    participant = data.participant || participant;
    currentEvent = data.event || null;
    currentSlide = nextSlide;
    if (changed) {
      voteRequest = null;
      clearError('vote-error');
    }
    if ((!voteRequest && !preserveVote) || changed) selectedChoice = choiceFrom(data.vote);
    stateError = false;
    renderState();
  }

  function expiredSession() {
    participant = null;
    currentEvent = null;
    currentSlide = null;
    selectedChoice = null;
    voteRequest = null;
    stateError = false;
    showScreen('auth');
    selectTab('login');
    authLoading(false);
    connectionNotice();
    showError('auth-error', 'انتهت جلسة الدخول. أدخل رمزك الشخصي عشان ترجع لنفس الاسم.');
  }

  function schedulePoll(delay = 2000) {
    clearTimeout(pollTimer);
    if (screen === 'live' && participant && !document.hidden && navigator.onLine !== false) pollTimer = setTimeout(pollState, delay);
  }

  async function pollState() {
    clearTimeout(pollTimer);
    if (polling || screen !== 'live' || !participant || document.hidden || navigator.onLine === false) return;
    polling = true;
    const revision = voteRevision;
    try { applyState(await api('state'), revision !== voteRevision); }
    catch (error) {
      if (error.status === 401) expiredSession();
      else { stateError = true; connectionNotice(); renderVoting(); }
    } finally { polling = false; schedulePoll(); }
  }

  function enterEvent() {
    $('personal-code').textContent = '';
    $('login-code').value = '';
    showScreen('live');
    renderState();
    pollState();
  }

  async function authenticate(kind, payload) {
    if (authBusy || navigator.onLine === false) return;
    clearError('auth-error');
    authLoading(true, kind);
    try {
      const data = await api(kind, payload);
      if (!data.participant) throw new Error('Missing participant');
      participant = data.participant;
      currentEvent = data.event || null;
      currentSlide = data.slide || null;
      selectedChoice = choiceFrom(data.vote);
      stateError = false;
      if (kind === 'join' && data.loginCode) {
        $('welcome-name').textContent = participant.name;
        $('personal-code').textContent = data.loginCode;
        $('copy-status').textContent = '';
        showScreen('recovery');
      } else enterEvent();
      connectionNotice();
    } catch (error) {
      let message = 'تعذّر الدخول حاليًا. جرّب مرّة ثانية.';
      if (error.status === 401 || error.status === 404) message = kind === 'login' ? 'ما تعرّفنا على الرمز. تأكّد منه وحاول مرّة ثانية.' : 'التسجيل غير متاح الآن. راجع منظّم الفعالية.';
      if (error.status === 400) message = kind === 'login' ? 'تأكّد من كتابة رمز الدخول كاملًا.' : 'اكتب اسمك بشكل واضح وحاول مرّة ثانية.';
      if (error.status === 429) message = 'انتظر شوي قبل ما تحاول مرّة ثانية.';
      if (error.name === 'AbortError' || error instanceof TypeError) message = 'ما قدرنا نتصل. تأكّد من الإنترنت وحاول مرّة ثانية.';
      showError('auth-error', message);
    } finally { authLoading(false, kind); }
  }

  async function restoreSession() {
    clearTimeout(restoreTimer);
    if (restoring || document.hidden || navigator.onLine === false) { connectionNotice(); return; }
    restoring = true;
    try {
      const data = await api('me');
      if (!data.participant) throw new Error('Missing participant');
      participant = data.participant;
      showScreen('live');
      applyState(data);
      schedulePoll();
    } catch (error) {
      if (error.status === 401) {
        stateError = false;
        showScreen('auth');
        connectionNotice();
      } else {
        // A temporary backend failure must not discard a still-valid cookie session.
        stateError = true;
        connectionNotice();
        restoreTimer = setTimeout(restoreSession, 2500);
      }
    } finally { restoring = false; authLoading(false); }
  }

  $('join-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('guest-name').value.trim();
    if (name.length < 2 || name.length > 40) { showError('auth-error', 'اكتب الاسم اللي تحب نناديك فيه، من حرفين إلى ٤٠ حرف.'); $('guest-name').focus(); return; }
    authenticate('join', { name });
  });
  $('login-form').addEventListener('submit', event => {
    event.preventDefault();
    const code = $('login-code').value.trim();
    if (!code) { showError('auth-error', 'اكتب رمز دخولك الشخصي.'); $('login-code').focus(); return; }
    authenticate('login', { code });
  });
  ['join', 'login'].forEach(kind => {
    $(`${kind}-tab`).addEventListener('click', () => selectTab(kind));
    $(`${kind}-tab`).addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        selectTab(event.key === 'Home' ? 'join' : event.key === 'End' ? 'login' : kind === 'join' ? 'login' : 'join', true);
      }
    });
  });
  $('copy-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('personal-code').textContent);
      $('copy-status').textContent = 'تم نسخ الرمز. احفظه في مكان تقدر ترجع له.';
    } catch (_) {
      const range = document.createRange();
      range.selectNodeContents($('personal-code'));
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      $('copy-status').textContent = 'اضغط مطوّلًا على الرمز واختر «نسخ».';
    }
  });
  $('enter-event').addEventListener('click', enterEvent);
  choices.forEach(button => button.addEventListener('click', async () => {
    if (!canVote() || voteRequest || navigator.onLine === false || stateError) return;
    const request = { slideId: currentSlide.id, choice: Number(button.dataset.choice) };
    voteRequest = request;
    voteRevision++;
    clearError('vote-error');
    renderVoting();
    try {
      const result = await api('vote', request);
      if (voteRequest !== request || String(currentSlide?.id) !== String(request.slideId)) return;
      selectedChoice = choiceFrom(result.choice) || request.choice;
    } catch (error) {
      if (error.status === 401) { expiredSession(); return; }
      if (voteRequest !== request || String(currentSlide?.id) !== String(request.slideId)) return;
      showError('vote-error', [409, 410, 422].includes(error.status) ? 'التصويت تغيّر أو انتهى وقته. بنحدّث السؤال لك.' : 'ما تأكّد حفظ اختيارك. حاول مرّة ثانية قبل ما يقفل التصويت.');
    } finally {
      if (voteRequest === request) { voteRequest = null; voteRevision++; renderVoting(); schedulePoll(100); }
    }
  }));

  document.addEventListener('visibilitychange', () => {
    clearTimeout(pollTimer); clearTimeout(restoreTimer);
    if (!document.hidden) { if (screen === 'loading') restoreSession(); else if (screen === 'live') pollState(); }
  });
  window.addEventListener('offline', () => {
    clearTimeout(pollTimer); clearTimeout(restoreTimer);
    connectionNotice(); authLoading(authBusy); renderVoting();
  });
  window.addEventListener('online', () => {
    connectionNotice(); authLoading(authBusy); renderVoting();
    if (screen === 'loading') restoreSession(); else if (screen === 'live') pollState();
  });
  setInterval(() => { if (!document.hidden) renderVoting(); }, 500);
  connectionNotice();
  restoreSession();
})();
