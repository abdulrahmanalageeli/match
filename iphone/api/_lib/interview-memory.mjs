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

function validStatement(item, turns, sources) {
  if (!item || !topics.includes(item.topic) || !subjects.includes(item.subject) || typeof item.turnId !== 'string') return;
  const turn = turns.get(item.turnId);
  if (!turn || typeof item.quote !== 'string') return;
  const quote = item.quote.trim();
  if (!quote || quote.length > maxQuote || hasPrivateIdentifier.test(quote) ||
    /[\u0000-\u001f\u007f]/u.test(quote) || !supportsQuote(turn.answer, sources.get(item.turnId), item, quote)) return;
  const result = { subject: item.subject, topic: item.topic, quote, turnId: item.turnId };
  if (typeof item.replacesQuote === 'string' && item.replacesQuote.length <= maxQuote && item.replacesQuote.trim() &&
    !hasPrivateIdentifier.test(item.replacesQuote)) result.replacesQuote = item.replacesQuote.trim();
  return result;
}

// Conservative recovery for legacy openings and incomplete model responses. Parse only complete,
// affirmative clauses; unseen wording stays available to the normal model extraction.
const partnerOpening = /^(?:(?:أنا|انا)\s+)?(?:(?:(?:أبي|ابي|أبغى|ابغى|أريد|اريد|أتمنى|اتمنى|أفضل|افضل|أفضّل|ودي|أبحث عن|ابحث عن)\s+|(?:أرغب|ارغب)\s+ب)(?:بنت|رجل|زوج[هة]?|شريك[هة]?|شخص)|(?:أبي|ابي|أفضّل|أفضل|افضل)(?:ها|ه))(?=\s|$)/u;
const me = /^(?:أنا|انا|عن نفسي)(?=\s|$)/u;
const hobby = '(?:الفلسف[ةه]|التصوير|القراء[ةه]|السفر|الرسم|الرياض[ةه]|الموسيقى|التاريخ|الشطرنج|السباح[ةه]|الطبخ|الكتابة|الكتب|الأفلام)';
// The verb 'like' also introduces partner wishes. Explicit hobby declarations can name any
// activity; ordinary 'I like …' needs a recognizable activity before treating it as an interest.
const openHobby = /^(?:هوايتي|هواياتي|أهوى|اهوى|أمارس|امارس)\s+[^،,؛;.؟?!\n]{2,155}$/u;
const interest = new RegExp('^(?:أحب|احب|أهوى|اهوى|هوايتي)\\s+' + hobby + '(?:\\s+و\\s*' + hobby + ')*', 'u');
const wording = [
  ['self', 'interest', interest],
  ['self', 'interest', openHobby],
  ['intent', 'timeline', /^(?:(?:أبي|ابي|أبغى|ابغى|أريد|اريد|أتمنى|اتمنى)\s+)?(?:أتزوج|اتزوج|الزواج|نتزوج)\s+(?:بسرع[ةه]|قريب(?:ًا|ا)?|بأقرب (?:وقت|فرصة)|في أقرب وقت|هذه السنة|هالسنة)/u],
  ['intent', 'nextStep', /^(?:(?:أبي|ابي|أبغى|ابغى|أفضل|افضل|ودي|أرغب أن)\s+)?(?:أقابل(?:ها|ه)|اقابل(?:ها|ه)|نتقابل|ألتقي (?:به|بها)|التقي (?:به|بها)|أشوف(?:ها|ه)|اشوف(?:ها|ه))(?:\s+(?:قبل\s+(?:الزواج|الملكة|الخطبة|الخطوة الرسمية)|مع (?:الأهل|الاهل)|في مكان عام))?/u],
  ['both', 'social', /^(?:اجتماعي[ةه]?|انطوائي[ةه]?)(?:\s+(?:جد[ًا]+|بطبعي))?/u],
  ['both', 'description', /^(?:كاريزم[اى]|ذكي[ةه]?|طموح[ةه]?|مرح[ةه]?|صبور[ةه]?|متفائل[ةه]?)/u],
  ['both', 'seriousness', /^جاد(?:[ةه])?(?:\s+(?:في الزواج|بالزواج))?/u],
  ['partner', 'age', /^(?:أصغر|اصغر|أكبر|اكبر)\s+مني|^قريب[ةه]?\s+من عمري/u],
  ['both', 'height', /^(?:قصير|طويل)(?:[ةه])?(?:\s+القام[ةه])?/u],
  ['partner', 'skinTone', /^(?:بيضاء|أسمر|اسمر|سمراء|حنطي[ةه]?)/u],
  ['partner', 'appearance', /^(?:حلو[ةه]?|جميل[ةه]?|وسيم[ةه]?)/u],
];
const uncertain = /(?:^|\s)(?:مو|مب|لست|ليس|ما|لا|لو|يمكن|مثلا|مثلًا|قال|تقول|قالت|يقول|يقولون|كنت)(?:\s|$)|[«»"“”]/u;
const correctionLead = /^(?:قصدي|أقصد|اقصد|تصحيحًا|تصحيحا)[،,:\s]+/u;
const reported = /(?:^|\s)(?:قال(?:ت|وا)?|يقول(?:ون)?|تقول|مثلا|مثال|على سبيل المثال)(?:[،:\s]|$)|[«"“]/u;
const negation = /(?:^|\s)(?:ما|مو|مب|ماني|لست|لا|غير|ليس|لم|مش|بدون)(?:\s|$)/u;
const restrictedSuffix = /^\s+(?:(?:فقط|إلا|احيانا|أحيانًا|جدا|جدًا|بشرط|بس مو شرط|لكن مو شرط)(?:\s|$)|(?:مع|في|عند)\s+[^،,.]{1,45}\s+فقط)/u;
const word = /[\p{L}\p{M}\p{N}]/u;
const otherSpeaker = /^(?:امي|ابي يقول|والدي|والدتي|اختي|اخوي|اخي|صديقي|صديقتي|اهلي)\s+(?:يقول|تقول|يتمن|تتمن|يحب|تحب|يبغ|تبغ|يبي|تبي|يفضل|تفضل)/u;

function parseClause(text, initialSubject, turnId) {
  let input = text.trim();
  let subject = initialSubject;
  const statements = [];
  // Capture explicit withdrawal as a whole. Never treat a negated adjective alone as affirmative.
  const neutrality = /^(?:العمر|فرق العمر|الطول)\s+(?:ما (?:يهمني|يفرق معي)|مو (?:مهم|شرط))$|^(?:ما (?:يهمني|يفرق معي))\s+(?:طول(?:ها|ه)?|عمر(?:ها|ه)?|الطول|العمر|فرق العمر)$/u;
  if (neutrality.test(input)) {
    return { subject: 'partner', statements: [{ subject: 'partner', topic: input.includes('طول') ? 'height' : 'age', quote: input, turnId }] };
  }
  if (uncertain.test(input) || /[؟?]/u.test(input)) return { subject: null, statements: [] };
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
        if (!resolvedSubject) continue;
        statements.push({ subject: resolvedSubject, topic, quote, turnId });
        subject = resolvedSubject === 'partner' ? 'partner' : 'self';
        input = clean.slice(quote.length).trimStart();
        matched = true;
        break;
      }
      if (matched) break;
    }
    if (!matched) return { subject: null, statements: [] };
  }
  return { subject, statements };
}

// Keep evidence in its own clause. An unfamiliar occupation or another person's words may
// sit between two clear declarations in one unpunctuated answer.
const boundary = /[،,؛;.!؟?\n]+|\s+(?=(?:و(?:[أإا](?:نا|بي|بغى|حب|هوى|رغب|فضل|فضّل|بحث|عمل|شتغل|درس|سكن|قابل|شوف|تزوج|تمنى|ريد)|ودي|هوايتي)|(?:أما أنا|بالنسبة لي|لكن أنا))(?=\s|ها|ه|$))/gu;
function clauses(turn, opening) {
  const pieces = [];
  let start = 0;
  const question = normal((turn.question ?? '').split('\u2029').at(-1));
  const partnerQuestion = /(?:في شريك(?:ك|تك| حياتك)|(?:تفضل|تتمنى) شريك(?:ك|تك)|تبغى شريك(?:ك|تك))(?:\s|[؟?]|$)/u.test(question)
    && !/(?:عن نفسك|عنك|الطرفين|كليكما|بينكما)/u.test(question);
  const defaultOwner = opening ? 'self' : partnerQuestion ? 'partner' : null;
  let owner = defaultOwner;
  let inReport = false;
  function add(end, separator) {
    const text = turn.answer.slice(start, end).trim();
    if (!text) return;
    if (/^(?:أما أنا|بالنسبة لي|لكن أنا)(?:[،,:\s]|$)/u.test(text)) inReport = false;
    inReport ||= reported.test(text) || otherSpeaker.test(normal(text));
    const declaration = text.replace(/^(?:أما أنا|بالنسبة لي|لكن أنا)\s*/u, 'أنا ');
    const parsed = inReport ? { statements: [], subject: null } :
      parseClause(declaration + (/[؟?]/u.test(separator) ? '؟' : ''), owner, turn.id);
    pieces.push({ start: start + turn.answer.slice(start, end).indexOf(text), end, text, owner,
      records: parsed.statements, inReport, question: /[؟?]/u.test(separator) });
    if (/[.;؛!؟?\n]/u.test(separator)) {
      owner = defaultOwner;
      inReport = false;
    } else {
      owner = parsed.subject;
    }
  }
  for (const match of turn.answer.matchAll(boundary)) {
    add(match.index, match[0]);
    start = match.index + match[0].length;
  }
  add(turn.answer.length, '');
  return pieces;
}

function supportsQuote(answer, pieces, item, quote) {
  // A direct first-person wish can contain a partner description. Prefer an explicit owner in
  // the clause to a guess from a bare adjective. A measured self-height cannot become a filter.
  for (let pos = answer.indexOf(quote); pos !== -1; pos = answer.indexOf(quote, pos + 1)) {
    const spans = pieces.filter(part => pos < part.end && part.start < pos + quote.length);
    if (!spans.length || spans.some(part => part.inReport || part.question)) continue;
    const source = spans[0];
    const before = answer.slice(source.start, pos);
    const after = answer.slice(pos + quote.length, spans.at(-1).end);
    const attachedWaw = /(?:^|\s)و$/u.test(before);
    if ((word.test(before.at(-1) ?? '') && !attachedWaw) || word.test(after[0] ?? '')) continue;
    if (negation.test(normal(before)) || restrictedSuffix.test(after)) continue;
    const known = spans.flatMap(part => part.records).filter(r => r.topic === item.topic &&
      (quote.includes(r.quote) || r.quote.includes(quote)));
    if (known.length) {
      if (known.some(r => r.subject === item.subject && quote.includes(r.quote))) return true;
      continue;
    }
    const prefix = normal((before + quote).replace(/^و/u,''));
    const explicitlyPartner = partnerOpening.test(before + quote) || partnerOpening.test((before + quote).replace(/^و/u,'')) || /^(?:شريكي|شريكتي|زوجي|زوجتي|شريك حياتي|شريكه حياتي)(?:\s|$)/u.test(prefix);
    const explicitlySelf = /^(?:انا|عن نفسي|طولي|عمري|هوايتي|احب|اهوى)(?:\s|$)/u.test(prefix);
    if ((explicitlyPartner && item.subject !== 'partner') ||
      (explicitlySelf && !explicitlyPartner && item.subject === 'partner') ||
      (!explicitlySelf && !explicitlyPartner && source.owner === 'partner' && item.subject === 'self')) continue;
    if (item.topic === 'nextStep' && (item.subject !== 'intent' || negation.test(normal(quote)) ||
      /(?:^|\s)(?:مدري|محتار|يمكن)(?:\s|$)/u.test(normal(quote)))) continue;
    return true;
  }
  return false;
}

function asArray(value) { return Array.isArray(value) ? value.slice(0, maxStatements) : []; }

function direction(item) {
  // Only mutually exclusive, unqualified directions. Numeric bounds and situational
  // descriptions remain separate statements and may refine the original preference.
  const value = normal(item.quote);
  if (item.topic === 'age') {
    if (/^اصغر مني$/u.test(value)) return -1;
    if (/^اكبر مني$/u.test(value)) return 1;
  }
  if (item.topic === 'height') {
    if (/^قصير(?:ه)?(?: القامه)?$/u.test(value)) return -1;
    if (/^طويل(?:ه)?(?: القامه)?$/u.test(value)) return 1;
  }
  return 0;
}

function reconcile(previous, candidates, turns, recover) {
  const sources = new Map(turns.filter(t => !t.skipped && typeof t.answer === 'string').map(t => [t.id, t]));
  const parts = new Map([...sources.values()].map(turn => [turn.id, clauses(turn, turn === turns[0])]));
  const records = [];
  const earlier = [];
  const provided = [...asArray(previous), ...asArray(candidates)].map(item => validStatement(item, sources, parts)).filter(Boolean);
  for (const turn of sources.values()) {
    const observed = provided.filter(item => item.turnId === turn.id);
    const recovered = recover ? parts.get(turn.id).flatMap(part => part.records)
      .map(item => validStatement(item, sources, parts)).filter(Boolean) : [];
    // A model can supply a more complete literal quote for a phrase the parser recognized.
    const additions = recovered.filter(item => !observed.some(o => o.topic === item.topic && o.subject === item.subject &&
      (o.quote.includes(item.quote) || item.quote.includes(o.quote))));
    const statements = [...additions, ...observed].sort((a, b) => turn.answer.indexOf(a.quote) - turn.answer.indexOf(b.quote));
    for (const item of statements) {
      const duplicate = records.find(r => r.turnId === item.turnId && r.topic === item.topic && r.subject === item.subject && r.quote === item.quote);
      if (duplicate && !item.replacesQuote) continue;
      const correction = records.find(r => r.subject === item.subject && r.topic === item.topic && r.quote === item.replacesQuote && r.turnId !== item.turnId);
      // When a correction has already been applied, its predecessor may exist only in the transcript.
      if (!correction && item.replacesQuote &&
        !earlier.some(t => supportsQuote(t.answer, parts.get(t.id), item, item.replacesQuote))) delete item.replacesQuote;
      // Keep independent interests and descriptions. An explicit withdrawal replaces the old
      // preference, while a numeric clarification can coexist with its original qualitative wording.
      const replacement = exclusive.has(item.topic) &&
        (withdrawn.test(normal(item.quote)) || parts.get(turn.id).some(part =>
          part.text.includes(item.quote) && correctionLead.test(part.text)));
      for (let i = records.length - 1; i >= 0; --i) {
        const old = records[i];
        const sameField = old.subject === item.subject && old.topic === item.topic && old.turnId !== item.turnId;
        const changedPreference = sameField && exclusive.has(item.topic) &&
          (replacement || withdrawn.test(normal(old.quote)) || direction(old) * direction(item) === -1);
        if (old === duplicate || old === correction || changedPreference) records.splice(i, 1);
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
