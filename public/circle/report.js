import { api, choices, node } from './event-api.js';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('ar-SA', { useGrouping: false });
let reportData = null;
let loading = false;
let priorDetails = [];

function field(object, camel, snake) { return object?.[camel] ?? object?.[snake]; }
function text(value) { return value == null ? '' : String(value); }
function timestamp(value) { const time = Date.parse(value || ''); return Number.isFinite(time) ? time : 0; }
function setError(message) { $('error').textContent = message; $('error').hidden = false; }
function clearError() { $('error').hidden = true; $('error').textContent = ''; }

function normalized(data) {
  const participants = (Array.isArray(data.participants) ? data.participants : []).map(person => ({ id: text(person.id), name: text(person.name) || 'مشارك', active: person.active !== false }));
  const people = new Map(participants.map(person => [person.id, person]));
  const slides = Array.isArray(data.slides) ? data.slides.map(slide => ({ ...slide, id: text(slide.id) })) : [];
  const slideById = new Map(slides.map(slide => [slide.id, slide]));
  const uniqueVotes = new Map();
  for (const raw of Array.isArray(data.votes) ? data.votes : []) {
    const participantId = text(field(raw, 'participantId', 'participant_id'));
    const slideId = text(field(raw, 'slideId', 'slide_id'));
    const choice = Number(raw.choice);
    if (!participantId || !slideId || !Number.isInteger(choice) || choice < 1 || choice > 4) continue;
    const updatedAt = field(raw, 'updatedAt', 'updated_at') || field(raw, 'createdAt', 'created_at');
    const vote = { participantId, slideId, choice, updatedAt };
    const key = `${participantId}\u0000${slideId}`;
    const old = uniqueVotes.get(key);
    if (!old || timestamp(updatedAt) >= timestamp(old.updatedAt)) uniqueVotes.set(key, vote);
    if (!people.has(participantId)) { const person = { id: participantId, name: 'مشارك غير متاح', active: false }; participants.push(person); people.set(participantId, person); }
    if (!slideById.has(slideId)) { const slide = { id: slideId, kind: 'scenario', responseMode: 'vote', title: 'موقف سابق', label: 'موقف سابق' }; slides.push(slide); slideById.set(slideId, slide); }
  }
  const votes = Array.from(uniqueVotes.values());
  const votedSlideIds = new Set(votes.map(vote => vote.slideId));
  const voteSlides = slides.filter(slide => (slide.kind === 'scenario' && slide.responseMode === 'vote') || votedSlideIds.has(slide.id));
  return { event: data.event || {}, participants, people, slides: voteSlides, slideById, votes, anonymous: Array.isArray(data.anonymous) ? data.anonymous : [] };
}

function eventDate(value) {
  if (!value) return '';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return text(value);
  return time.toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Riyadh' });
}

function renderReport(raw) {
  const data = normalized(raw);
  reportData = data;
  const sheet = $('report-sheet');
  sheet.replaceChildren();
  const cover = node('section', undefined, 'report-cover');
  const brand = node('span', 'THE CIRCLE', 'wordmark'); brand.dir = 'ltr'; cover.append(brand);
  cover.append(node('p', 'تقرير اللقاء', 'eyebrow'), node('h1', data.event.title || 'الحدود والديل بريكرز'));
  if (data.event.subtitle) cover.append(node('p', data.event.subtitle, 'report-subtitle'));
  if (data.event.date) cover.append(node('p', eventDate(data.event.date), 'report-date'));
  const stats = node('div', undefined, 'stats report-stats');
  for (const [amount, label] of [[data.participants.length, 'مشارك'], [data.slides.length, 'موقف للتصويت'], [data.votes.length, 'اختيار محفوظ'], [data.anonymous.length, 'مشاركة بدون اسم']]) {
    const stat = node('div'); stat.append(node('strong', number.format(amount)), node('span', label)); stats.append(stat);
  }
  cover.append(stats, node('p', 'تقرير خاص يحتوي على أسماء المشاركين واختياراتهم. كل شخص له اختيار واحد لكل موقف؛ يظهر آخر اختيار محفوظ.', 'report-privacy'));
  cover.append(node('p', `آخر تحديث: ${new Date().toLocaleString('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}`, 'report-date'));
  sheet.append(cover, node('h2', 'الاختيارات حسب الموقف', 'report-section-title'));

  if (!data.slides.length) { const empty = node('section', undefined, 'report-card'); empty.append(node('p', 'ما فيه مواقف للتصويت حتى الآن.', 'empty')); sheet.append(empty); }
  for (const slide of data.slides) {
    const votes = data.votes.filter(vote => vote.slideId === slide.id);
    const card = node('section', undefined, 'report-card');
    card.append(node('p', slide.scenarioNumber ? `الموقف ${number.format(slide.scenarioNumber)}${slide.label ? ` · ${slide.label}` : ''}` : slide.label || 'الموقف', 'overline'));
    card.append(node('h2', slide.title || 'موقف سابق'), node('p', `عدد المصوّتين: ${number.format(votes.length)}`, 'report-total'));
    choices.forEach((label, index) => {
      const group = votes.filter(vote => vote.choice === index + 1);
      const percentage = votes.length ? group.length / votes.length * 100 : 0;
      const row = node('div', undefined, 'result-row');
      const track = node('div', undefined, 'result-track'); track.setAttribute('aria-hidden', 'true');
      const bar = node('div', undefined, 'result-bar'); bar.style.width = `${percentage}%`; track.append(bar);
      row.append(node('span', label), track, node('strong', number.format(group.length)));
      const names = group.map(vote => data.people.get(vote.participantId)?.name || 'مشارك غير متاح');
      card.append(row, node('p', names.length ? names.join('، ') : '—', 'result-names'));
    });
    sheet.append(card);
  }

  sheet.append(node('h2', 'سجل كل مشارك', 'report-section-title'));
  if (!data.participants.length) { const empty = node('section', undefined, 'report-card'); empty.append(node('p', 'ما انضم أحد حتى الآن.', 'empty')); sheet.append(empty); }
  for (const person of data.participants) {
    const votes = data.votes.filter(vote => vote.participantId === person.id);
    const card = node('section', undefined, 'report-card report-ledger');
    const details = node('details');
    const summary = node('summary');
    const name = node('span', person.name, 'report-name');
    if (!person.active) name.append(node('span', ' · غير نشط', 'inactive-note'));
    summary.append(name, node('span', `${number.format(votes.length)} اختيار`, 'tag')); details.append(summary);
    if (!votes.length) details.append(node('p', 'ما فيه اختيارات محفوظة لهذا المشارك.', 'empty'));
    else {
      const table = node('table', undefined, 'ledger');
      const head = node('thead'), heading = node('tr'); heading.append(node('th', 'الموقف'), node('th', 'الاختيار')); head.append(heading); table.append(head);
      const body = node('tbody');
      for (const slide of data.slides) {
        const vote = votes.find(item => item.slideId === slide.id); if (!vote) continue;
        const row = node('tr'); row.append(node('td', `${slide.scenarioNumber ? `${number.format(slide.scenarioNumber)}. ` : ''}${slide.title || 'موقف سابق'}`), node('td', choices[vote.choice - 1])); body.append(row);
      }
      table.append(body); details.append(table);
    }
    card.append(details); sheet.append(card);
  }

  sheet.append(node('h2', 'الديل بريكرز المكتوبة — بدون أسماء', 'report-section-title'));
  const anonymous = node('section', undefined, 'report-card');
  anonymous.append(node('p', 'مشاركات مستقلة، غير مرتبطة بأسماء المشاركين أو اختياراتهم.', 'report-total'));
  if (!data.anonymous.length) anonymous.append(node('p', 'ما فيه مشاركات مكتوبة حتى الآن.', 'empty'));
  data.anonymous.forEach(item => anonymous.append(node('p', typeof item === 'string' ? item : text(item.text), 'report-anonymous')));
  sheet.append(anonymous);
  $('report-toolbar').hidden = false; $('report-note').hidden = false;
}

async function loadReport() {
  if (loading) return;
  loading = true; clearError(); $('report-loading').hidden = false; $('retry-report').hidden = true;
  $('refresh-report').disabled = true;
  try {
    const data = await api('hostReport');
    $('report-access').hidden = true;
    renderReport(data);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      reportData = null; $('report-sheet').replaceChildren(); $('report-toolbar').hidden = true; $('report-note').hidden = true; $('report-access').hidden = false;
    } else { setError('تعذّر تحميل التقرير. تأكّد من الاتصال وحاول مرّة ثانية.'); $('retry-report').hidden = false; }
  } finally { loading = false; $('report-loading').hidden = true; $('refresh-report').disabled = false; }
}

function openForPrint() {
  priorDetails = Array.from(document.querySelectorAll('#report-sheet details'), details => ({ details, open: details.open }));
  priorDetails.forEach(item => { item.details.open = true; });
}
function restoreAfterPrint() { priorDetails.forEach(item => { item.details.open = item.open; }); priorDetails = []; }

async function dataURL(response) {
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
  });
}

async function inlineStyles(path) {
  const url = new URL(path, location.href);
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Styles unavailable');
  let css = await response.text();
  const matches = Array.from(css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g));
  const sources = new Map();
  for (const match of matches) {
    if (match[2].startsWith('data:')) continue;
    const asset = new URL(match[2], url);
    if (asset.origin !== location.origin) throw new Error('Unexpected external asset');
    if (!sources.has(asset.href)) {
      const fontResponse = await fetch(asset, { credentials: 'same-origin' });
      if (!fontResponse.ok) throw new Error('Font unavailable');
      sources.set(asset.href, await dataURL(fontResponse));
    }
    css = css.replace(match[0], `url("${sources.get(asset.href)}")`);
  }
  return css;
}

async function downloadReport() {
  if (!reportData) return;
  const button = $('download-report'); button.disabled = true; button.textContent = 'نجهّز النسخة الكاملة…'; clearError();
  try {
    const styles = await Promise.all([inlineStyles('./style.css'), inlineStyles('./host.css')]);
    styles.push($('report-extra-style').textContent);
    const copy = $('report-sheet').cloneNode(true); copy.querySelectorAll('details').forEach(details => { details.open = true; });
    const title = node('title', `${reportData.event.title || 'The Circle'} — تقرير اللقاء`);
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">${title.outerHTML}<style>${styles.join('\n')}</style></head><body><div class="host-shell"><div class="export-actions"><button id="print-copy" type="button">طباعة / حفظ PDF</button></div>${copy.outerHTML}<p class="report-offline-note">نسخة محفوظة مستقلة · لا تحتاج اتصالًا بالإنترنت.</p></div><script>document.getElementById('print-copy').addEventListener('click',function(){window.print()});<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `The_Circle_Report_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (_) { setError('ما قدرنا نجهّز النسخة. حاول مرّة ثانية، أو استخدم طباعة / حفظ PDF.'); }
  finally { button.disabled = false; button.textContent = 'تنزيل نسخة HTML كاملة'; }
}

$('print-report').addEventListener('click', () => window.print());
$('download-report').addEventListener('click', downloadReport);
$('refresh-report').addEventListener('click', loadReport);
$('retry-report').addEventListener('click', loadReport);
window.addEventListener('beforeprint', openForPrint);
window.addEventListener('afterprint', restoreAfterPrint);
loadReport();
