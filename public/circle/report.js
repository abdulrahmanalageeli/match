import { api, node } from './event-api.js';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('ar-SA', { useGrouping: false });
let reportData = null;
let loading = false;

function text(value) { return value == null ? '' : String(value); }
function setError(message) { $('error').textContent = message; $('error').hidden = false; }
function clearError() { $('error').hidden = true; $('error').textContent = ''; }

function eventDate(value) {
  if (!value) return '';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return text(value);
  return time.toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Riyadh' });
}

function renderReport(raw) {
  const data = { event: raw.event || {}, anonymous: (Array.isArray(raw.anonymous) ? raw.anonymous : []).map(item => typeof item === 'string' ? item : text(item.text)) };
  reportData = data;
  const sheet = $('report-sheet');
  sheet.replaceChildren();
  const cover = node('section', undefined, 'report-cover');
  const brand = node('span', 'THE CIRCLE', 'wordmark'); brand.dir = 'ltr'; cover.append(brand);
  cover.append(node('p', 'من مساحة اللقاء', 'eyebrow'), node('h1', 'الديل بريكرز المجهولة'));
  if (data.event.subtitle) cover.append(node('p', data.event.subtitle, 'report-subtitle'));
  if (data.event.date) cover.append(node('p', eventDate(data.event.date), 'report-date'));
  const stats = node('div', undefined, 'stats report-stats');
  const count = node('div'); count.append(node('strong', number.format(data.anonymous.length)), node('span', 'مشاركة بدون اسم')); stats.append(count);
  cover.append(stats, node('p', 'مشاركات كُتبت بدون أسماء. مساحة للفهم، بدون أحكام.', 'report-privacy'));
  cover.append(node('p', `آخر تحديث: ${new Date().toLocaleString('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}`, 'report-date'));
  sheet.append(cover, node('h2', 'وش الديل بريكر بالنسبة لك؟', 'report-section-title'));
  if (!data.anonymous.length) { const empty = node('section', undefined, 'report-card'); empty.append(node('p', 'ما فيه مشاركات مكتوبة حتى الآن.', 'empty')); sheet.append(empty); }
  data.anonymous.forEach((item, index) => {
    const card = node('section', undefined, 'report-card');
    card.append(node('p', `مشاركة ${number.format(index + 1)}`, 'overline'), node('p', item, 'report-anonymous'));
    sheet.append(card);
  });
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
    const copy = $('report-sheet').cloneNode(true);
    const title = node('title', `${reportData.event.title || 'The Circle'} — الديل بريكرز المجهولة`);
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
loadReport();
