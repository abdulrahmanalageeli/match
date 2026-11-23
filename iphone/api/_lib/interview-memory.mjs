// A private statement is the member's wording. It is never an assessment answer or profile criterion.
const topics = ['social', 'description', 'interest', 'seriousness', 'age', 'height', 'appearance', 'skinTone', 'timeline', 'nextStep', 'other'];
const subjects = ['self', 'partner', 'intent'];
const maxStatements = 40;
const maxQuote = 180;
const properties = {
  subject: { type: 'string', enum: subjects },
  topic: { type: 'string', enum: topics },
  turnId: { type: 'string' },
  quote: { type: 'string', maxLength: maxQuote },
  replacesQuote: { type: ['string', 'null'], maxLength: maxQuote },
};
export const statementSchema = {
  type: 'array', maxItems: maxStatements, items: {
    type: 'object', additionalProperties: false, properties, required: Object.keys(properties),
  },
};

export const statementGuidance = `
في statements احتفظ بمعاني كلام العضو الخاصة، حتى إن لم تناسب خيارًا في القاموس. لكل معنى مستقل موضوع وصاحب واقتباس حرفي قصير من الإجابة مع turnId. احتفظ بدرجة الوصف والنفي والتردد والشرط. ميّز بين وصفه لنفسه self، وما يريده في شريكه partner، وخطته هو intent. لا تحوّل الوصف إلى درجة شخصية ولا إلى نص عام أو شرط إلزامي. اجمع كل ما صرح به بما فيه الاهتمامات والانطباع عن الذات والجدية والطول والعمر والتوقيت وخطوة اللقاء. استعمل other لأي معنى صريح لا يناسب موضوعًا أدق. لا تستخرج من السؤال أو من مثال أو وصف لشخص آخر. تعليمات العضو للمحلل ليست وصفًا لشخصه أو رغبته. تجنب معلومات الاتصال والمعرّفات والتفاصيل المحجوبة. لا تعد صياغة الاقتباس أو تخترع حدودًا رقمية. وصف يريد تنفيذه مثل مقابلة الشريك قبل الزواج يمكن أن يكون nextStep حتى إن لم يذكر المكان أو الحضور. إذا صحح العضو معنى سابقًا، اذكر نص عبارته الجديدة وضع في replacesQuote نص العبارة السابقة المصححة حرفيًا من السجل. وإلا ضع null. التصحيح يخص الموضوع الذي غيره فقط، ولا تلغِ بقية ما ذكره.
`.trim();

const normal = text => text.normalize('NFKC').replace(/[\u064b-\u065f\u0670ـ]/gu, '')
  .replace(/[أإآ]/gu, 'ا').replace(/ة/gu, 'ه').trim();
const withdrawn = /(?:ما (?:يهمني|يفرق معي|عندي تفضيل)|مو (?:مهم|شرط)|لا (?:يهمني|افضل)|م(?:ا|ب) (?:ابي|ابغى))/u;
const exclusive = new Set(['age', 'height', 'skinTone', 'social', 'timeline']);
const hasPrivateIdentifier = /@|(?:[0-9٠-٩۰-۹][\s-]*){8}|\[تفصيل حساس محجوب\]|https?:\/\//u;

function validStatement(item, turns) {
  if (!item || !topics.includes(item.topic) || !subjects.includes(item.subject) || typeof item.turnId !== 'string') return;
  const turn = turns.get(item.turnId);
  if (!turn || typeof item.quote !== 'string') return;
  const quote = item.quote.trim();
  if (!quote || quote.length > maxQuote || !turn.answer.includes(quote) ||
    hasPrivateIdentifier.test(quote) || /[\u0000-\u001f\u007f]/u.test(quote)) return;
  const result = { subject: item.subject, topic: item.topic, quote, turnId: item.turnId };
  if (typeof item.replacesQuote === 'string' && item.replacesQuote.length <= maxQuote && item.replacesQuote.trim() &&
    !hasPrivateIdentifier.test(item.replacesQuote)) result.replacesQuote = item.replacesQuote.trim();
  return result;
}

// Conservative recovery for legacy openings and incomplete model responses. Parse only complete,
// affirmative clauses; unseen wording stays available to the normal model extraction.
const partnerOpening = /^(?:(?:أنا|انا)\s+)?(?:(?:(?:أبي|ابي|أبغى|ابغى|أريد|اريد|أتمنى|اتمنى|أفضل|افضل|أفضّل|ودي|أبحث عن|ابحث عن)\s+|(?:أرغب|ارغب)\s+ب)(?:بنت|رجل|زوج[هة]?|شريك[هة]?|شخص)|(?:أبي|ابي|أفضّل|أفضل|افضل)(?:ها|ه))(?=\s|$)/u;
const me = /^(?:أنا|انا|عن نفسي)(?=\s|$)/u;
const interest = /^(?:أحب|احب|أهوى|اهوى|هوايتي)\s+(?:الفلسف[ةه]|التصوير|القراء[ةه]|السفر|الرسم|الرياض[ةه]|الموسيقى|التاريخ|الشطرنج|السباح[ةه]|الطبخ|الكتابة|الكتب|الأفلام)/u;
const wording = [
  ['self', 'interest', interest],
  ['intent', 'timeline', /^(?:(?:أبي|ابي|أبغى|ابغى|أريد|اريد|أتمنى|اتمنى)\s+)?(?:أتزوج|اتزوج|الزواج|نتزوج)\s+(?:بسرع[ةه]|قريب(?:ًا|ا)?|بأقرب (?:وقت|فرصة)|في أقرب وقت|هذه السنة|هالسنة)/u],
  ['intent', 'nextStep', /^(?:(?:أبي|ابي|أبغى|ابغى|أفضل|افضل|ودي|أرغب أن)\s+)?(?:أقابل(?:ها|ه)|اقابل(?:ها|ه)|نتقابل|ألتقي (?:به|بها)|التقي (?:به|بها)|أشوف(?:ها|ه)|اشوف(?:ها|ه))(?:\s+(?:قبل\s+(?:الزواج|الملكة|الخطبة|الخطوة الرسمية)|مع (?:الأهل|الاهل)|في مكان عام))?/u],
  ['both', 'social', /^(?:اجتماعي[ةه]?|انطوائي[ةه]?)(?:\s+(?:جد[ًا]+|بطبعي))?/u],
  ['both', 'description', /^(?:كاريزم[اى]|ذكي[ةه]?|طموح[ةه]?|مرح[ةه]?|صبور[ةه]?|متفائل[ةه]?)/u],
  ['both', 'seriousness', /^جاد(?:[ةه])?(?:\s+(?:في الزواج|بالزواج))?/u],
  ['partner', 'age', /^(?:أصغر|اصغر|أكبر|اكبر)\s+مني|^قريب[ةه]?\s+من عمري/u],
  ['partner', 'height', /^(?:قصير|طويل)(?:[ةه])?(?:\s+القام[ةه])?/u],
  ['partner', 'skinTone', /^(?:بيضاء|أسمر|اسمر|سمراء|حنطي[ةه]?)/u],
  ['partner', 'appearance', /^(?:حلو[ةه]?|جميل[ةه]?|وسيم[ةه]?)/u],
];
const uncertain = /(?:^|\s)(?:مو|مب|لست|ليس|ما|لا|لو|يمكن|مثلا|مثلًا|قال|تقول|قالت|يقول|يقولون|كنت)(?:\s|$)|[«»"“”]/u;
const correctionLead = /^(?:قصدي|أقصد|اقصد|تصحيحًا|تصحيحا)\s+/u;

function parseClause(text, initialSubject, turnId) {
  let input = text.trim();
  let subject = initialSubject;
  const statements = [];
  // Capture explicit withdrawal as a whole. Never treat a negated adjective alone as affirmative.
  const neutrality = /^(?:العمر|فرق العمر|الطول)\s+(?:ما (?:يهمني|يفرق معي)|مو (?:مهم|شرط))$|^(?:ما (?:يهمني|يفرق معي))\s+(?:طول(?:ها|ه)?|عمر(?:ها|ه)?|الطول|العمر|فرق العمر)$/u;
  if (neutrality.test(input)) {
    return { subject: 'partner', statements: [{ subject: 'partner', topic: input.includes('طول') ? 'height' : 'age', quote: input, turnId }] };
  }
  if (uncertain.test(input) || /[؟?]/u.test(input)) return { subject: 'self', statements: [] };
  input = input.replace(correctionLead, '');
  while (input) {
    // Try the whole word first: ودي and وسيم start with a lexical waw.
    const alternatives = [input];
    if (input.startsWith('و')) alternatives.push(input.slice(1).trimStart());
    let matched = false;
    for (const clean of alternatives) {
      const partner = clean.match(partnerOpening);
      const self = clean.match(me);
      if (partner || self) {
        subject = partner ? 'partner' : 'self';
        input = clean.slice((partner ?? self)[0].length).trimStart();
        matched = true;
        break;
      }
      if (clean.startsWith('[تفصيل حساس محجوب]')) {
        input = clean.slice('[تفصيل حساس محجوب]'.length).trimStart();
        matched = true;
        break;
      }
      for (const [who, topic, pattern] of wording) {
        if (who === 'partner' && subject !== 'partner') continue;
        const quote = clean.match(pattern)?.[0].trimEnd();
        if (!quote || (clean.length > quote.length && !/^\s/u.test(clean.slice(quote.length)))) continue;
        const resolvedSubject = who === 'both' ? subject : who;
        statements.push({ subject: resolvedSubject, topic, quote, turnId });
        subject = resolvedSubject === 'partner' ? 'partner' : 'self';
        input = clean.slice(quote.length).trimStart();
        matched = true;
        break;
      }
      if (matched) break;
    }
    if (!matched) return { subject: 'self', statements: [] };
  }
  return { subject, statements };
}

function fromTurn(turn) {
  const statements = [];
  let subject = 'self';
  // Carry the owner across commas in a list, but reset at sentence endings and questions.
  for (const [, clause, separator] of turn.answer.matchAll(/([^،,؛;.!؟?\n]+)([،,؛;.!؟?\n]?)/gu)) {
    const parsed = parseClause(clause + (/[؟?]/u.test(separator) ? separator : ''), subject, turn.id);
    statements.push(...parsed.statements);
    subject = /[،,]/u.test(separator) ? parsed.subject : 'self';
  }
  return statements;
}

function asArray(value) { return Array.isArray(value) ? value.slice(0, maxStatements) : []; }

function reconcile(previous, candidates, turns, recover) {
  const sources = new Map(turns.filter(t => !t.skipped && typeof t.answer === 'string').map(t => [t.id, t]));
  const records = [];
  const earlier = [];
  const provided = [...asArray(previous), ...asArray(candidates)].map(item => validStatement(item, sources)).filter(Boolean);
  for (const turn of sources.values()) {
    const observed = provided.filter(item => item.turnId === turn.id);
    const recovered = recover ? fromTurn(turn).map(item => validStatement(item, sources)).filter(Boolean) : [];
    // A model can supply a more complete literal quote for a phrase the parser recognized.
    const additions = recovered.filter(item => !observed.some(o => o.topic === item.topic && o.subject === item.subject &&
      (o.quote.includes(item.quote) || item.quote.includes(o.quote))));
    const statements = [...additions, ...observed].sort((a, b) => turn.answer.indexOf(a.quote) - turn.answer.indexOf(b.quote));
    for (const item of statements) {
      const duplicate = records.find(r => r.turnId === item.turnId && r.topic === item.topic && r.subject === item.subject && r.quote === item.quote);
      if (duplicate && !item.replacesQuote) continue;
      const correction = records.find(r => r.subject === item.subject && r.topic === item.topic && r.quote === item.replacesQuote && r.turnId !== item.turnId);
      // When a correction has already been applied, its predecessor may exist only in the transcript.
      if (!correction && !earlier.some(t => item.replacesQuote && t.answer.includes(item.replacesQuote))) delete item.replacesQuote;
      // Keep independent interests and descriptions. An explicit withdrawal replaces the old
      // preference, while a numeric clarification can coexist with its original qualitative wording.
      const replacement = exclusive.has(item.topic) &&
        (withdrawn.test(normal(item.quote)) || correctionLead.test(turn.answer) || correctionLead.test(item.quote));
      for (let i = records.length - 1; i >= 0; --i) {
        const old = records[i];
        if (old === duplicate || old === correction || (replacement && old.subject === item.subject &&
          old.topic === item.topic && old.turnId !== item.turnId)) records.splice(i, 1);
      }
      records.push(item);
    }
    earlier.push(turn);
  }
  return records.slice(-maxStatements);
}

/** Merge new interpretations with recoverable direct statements from consent-filtered turns. */
export function reconcileStatements(previous = [], candidates = [], turns = []) {
  return reconcile(previous, candidates, turns, true);
}

/** Validate already-stored private evidence. Loading a snapshot must never extract new facts. */
export function validatedStatements(items = [], turns = []) {
  return reconcile(items, [], turns, false);
}
