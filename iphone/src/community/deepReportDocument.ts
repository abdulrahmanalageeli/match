import { deepSections, deepSnapshot, type DeepSnapshot } from './deepCompatibilityModel';

export const deepReportTitle = 'تحليل وُدَين المعمّق';
export const deepResearchUrl = 'https://sites.lsa.umich.edu/whirl/wp-content/uploads/sites/792/2020/08/Joel-et-al-2020-PNAS.pdf';
export const deepMethodCopy = 'يربط التحليل إجاباتكما وتفضيلاتكما المحفوظة بنقاط للنقاش، ولا يستخدم محادثاتكما أو صوركما. أسئلة وُدَين وأوزانها ليست اختبارًا نفسيًا معياريًا مثبت الصلاحية، والتقرير لا يتنبأ بنجاح الزواج.';
export const deepResearchCopy = 'وجدت دراسة شملت ٤٣ مجموعة بيانات لأزواج أن التنبؤ بتغيّر جودة العلاقة من التقارير الذاتية محدود. هذا مرجع لفهم حدود القراءة، وليس اعتمادًا علميًا لتحليل وُدَين.';
export const deepKindCopy = { strength: 'نقطة قوة', manageable: 'مساحة للنقاش', incompatibility: 'تعارض مع شرط أساسي', uncertain: 'يحتاج توضيحًا' };

export function readingCopy(text: string) {
  // Older local reports appended labeled questionnaire responses to the interpretation.
  const paragraphs = text.trim().split(/\r?\n\s*\r?\n/).filter(paragraph =>
    !/^(?:«[^»]+»\r?\n)?(?:إجابتك|إجابة [^:«»\n]+|تفضيلك المحفوظ بخصوص الشريك|تفضيل [^:«»\n]+ بخصوص الشريك):\s*«/.test(paragraph));
  const [first = '', ...body] = paragraphs;
  return body.length && first.length <= 110 ? { title: first, body } : { title: '', body: paragraphs };
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Only the fresh, participant-authorized shared projection may leave the app. */
export function deepReportDocument(value: DeepSnapshot, peerName: string, exportedAt = new Date()): string {
  const snapshot = deepSnapshot(value);
  if (snapshot.status !== 'shared' || !snapshot.findings.length) throw Error('التقرير المشترك غير متاح للحفظ الآن.');
  const me = snapshot.requestedByMe ? 'أ' : 'ب', peer = snapshot.requestedByMe ? 'ب' : 'أ';
  const sections = Object.entries(deepSections).map(([key, label]) => {
    const findings = snapshot.findings.filter(item => item.section === key);
    return findings.length ? `<section><h2>${label}</h2>${findings.map(item => { const {title, body} = readingCopy(item.text); return `<article><small>${deepKindCopy[item.kind]}</small>${title ? `<h3>${escape(title)}</h3>` : ''}${body.map(p => `<p>${escape(p)}</p>`).join('')}</article>`; }).join('')}</section>` : '';
  }).join('');
  // No remote assets, scripts, tracking, identifiers, private reviews, or raw evidence.
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${deepReportTitle}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f7f3f2;color:#30282d;font:16px/1.9 -apple-system,BlinkMacSystemFont,"Arial",sans-serif}main{max-width:720px;margin:auto;padding:28px}header{border-bottom:2px solid #8b465f;padding-bottom:22px}header b{color:#651d38;font-size:28px}h1{font-size:24px;margin:10px 0}h2{font-size:19px;color:#651d38;margin:0 0 12px}section{margin-top:20px;padding:20px;background:#fff;border:1px solid #e9dfe3;border-radius:18px}article+article{border-top:1px solid #eee;padding-top:14px;margin-top:14px}small{color:#63535c}p{margin:6px 0;white-space:pre-line;overflow-wrap:anywhere}footer{margin-top:24px;font-size:13px;color:#63535c}a{color:#651d38}@media print{body{background:white;font-size:12pt}main{padding:0;max-width:none}section{border:0;border-radius:0;padding:0}h2{break-after:avoid}article{break-inside:avoid}footer{font-size:10pt}}
  </style></head><body><main><header><b>وُدَين</b><h1>${deepReportTitle}</h1><p>أنت و${escape(peerName)}</p><small>نسخة خاصة · ${escape(exportedAt.toLocaleDateString('ar-SA', { dateStyle: 'long' }))}</small></header><p>أنت الطرف ${me} · ${escape(peerName)} الطرف ${peer}</p>${sections}<section><h2>المنهجية والمرجع البحثي</h2><p>${deepMethodCopy}</p><p>${deepResearchCopy}</p><a href="${deepResearchUrl}">Joel وآخرون · PNAS · 2020</a></section><footer>تحتوي هذه النسخة فقط على النقاط التي وافقتما على مشاركتها وقت الحفظ. قد تكون بعض الأقسام محذوفة باختياركما. سحب المشاركة داخل وُدَين لا يحذف النسخ المحفوظة خارجه.</footer></main></body></html>`;
}
