import prompts from '../../src/interview/refinement-prompts.json' with { type: 'json' };
import fields from '../../src/interview/profile-catalog.json' with { type: 'json' };

const catalog = new Map(fields.map(field => [field.fieldId, field]));
const number = new Intl.NumberFormat('ar-SA', {useGrouping:false});
const rangeNames = { height: 'طول الشريك', age: 'عمر الشريك' };
const unit = { height: 'سم', age: 'سنة' };
const subjects = {height:'partner', age:'partner', timeline:'intent'};
const fieldsForTopic = {
  height:['partnerCriteria.height'],
  age:['preferredMinAge','preferredMaxAge'],
  timeline:['marriageBasics.marriageTimeline'],
};

// Corrections to private wording also supersede older structured interpretations of
// that same preference. Recompute from the transcript on every analysis so an old
// extraction cannot reappear if the model repeats it during a later correction.
export function correctedRefinementFields(statements, turns) {
  const positions = new Map(turns.map((turn,index) => [turn.id,index]));
  const corrected = new Map();
  for (const note of statements) {
    if (!Object.hasOwn(fieldsForTopic,note.topic) ||
      (note.subject !== subjects[note.topic] && !(note.topic === 'timeline' && note.subject === 'self'))) continue;
    const position = positions.get(note.turnId);
    if (position === undefined || turns[position].question === prompts[note.topic]) continue;
    // Recovery for unambiguous withdrawals even if the model omitted replacesQuote.
    // A free-form alternative or a mention of another topic is not a withdrawal.
    const withdrawn = /^(?:(?:العمر|الطول|فرق العمر|طول الشريك|عمر الشريك)\s+(?:ما يهمني|ما يفرق معي|مو مهم)|(?:ما يهمني|ما يفرق معي)\s+(?:طول(?:ها|ه)?|عمر(?:ها|ه)?|الطول|العمر|فرق العمر))[.!،\s]*$/u.test(note.quote);
    if (!withdrawn && !note.replacesQuote) continue;
    for (const field of fieldsForTopic[note.topic]) corrected.set('profile:' + field, position);
  }
  return corrected;
}


export function endsInRefinement(document) {
  return document?.status === 'review' && !document.pendingAnalysis &&
    Object.values(prompts).includes(document.turns.at(-1)?.question);
}

export function canRefine(document, topic) {
  const turns = document.turns;
  const lastOffer = turns.findLastIndex(turn => turn.question === prompts[topic]);
  return Object.hasOwn(prompts, topic) && document.statements?.some(statement =>
    statement.topic === topic && (statement.subject === subjects[topic] || (topic === 'timeline' && statement.subject === 'self')) &&
    turns.findIndex(turn => turn.id === statement.turnId) > lastOffer);
}

// Generate the member's own statement from their explicit editor selection. An open bound
// remains open, and the existing catalog defines the allowed ranges and timing codes.
export function refinementSelection(topic, selection) {
  if (!Object.hasOwn(prompts, topic) || !selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
  const keys = Object.keys(selection);
  if (keys.length === 1 && selection.approximate === true) return {
    question: prompts[topic], answer:'يكفيني الوصف اللي ذكرته بدون تحديد أدق.', fields:[],
  };
  if (topic === 'timeline') {
    if (keys.length !== 1 || keys[0] !== 'value') return null;
    const fieldId = 'marriageBasics.marriageTimeline';
    const option = catalog.get(fieldId).options.find(item => item.value === selection.value);
    return option ? {question:prompts[topic], answer:`توقيت إتمام الزواج المناسب لي: ${option.label}.`,
      fields:[{fieldId,values:[option.value],mode:null}]} : null;
  }
  const { min, max } = selection;
  const boundKeys = keys.filter(key => key === 'min' || key === 'max');
  const acceptsMode = topic === 'height' && ['prefer','require'].includes(selection.mode);
  if (!boundKeys.length || keys.some(key => !boundKeys.includes(key) && !(key === 'mode' && acceptsMode))) return null;
  const bounds = catalog.get(topic === 'height' ? 'partnerCriteria.height' : 'preferredMinAge');
  if (boundKeys.some(key => !Number.isInteger(selection[key]) || selection[key] < bounds.min || selection[key] > bounds.max) ||
    (min !== undefined && max !== undefined && min > max)) return null;
  const quantity = min === undefined ? `بحد أقصى ${number.format(max)}` :
    max === undefined ? `بحد أدنى ${number.format(min)}` : `من ${number.format(min)} إلى ${number.format(max)}`;
  const profile = topic === 'height' ? [{fieldId:'partnerCriteria.height', values:[String(min ?? ''),String(max ?? '')], mode:selection.mode ?? 'prefer'}] :
    [['preferredMinAge', min], ['preferredMaxAge', max]].filter(([,bound]) => bound !== undefined)
      .map(([fieldId,bound]) => ({fieldId, values:[String(bound)], mode:null}));
  const verb = selection.mode === 'require' ? 'أشترط أن يكون' : 'أفضّل';
  return {question:prompts[topic],answer:`${verb} ${rangeNames[topic]} ${quantity} ${unit[topic]}.`,fields:profile};
}

/** One entered endpoint preserves the other endpoint already in the member's draft. */
export function ageRangeConflict(document, selection) {
  if (selection.approximate || (selection.min !== undefined && selection.max !== undefined)) return null;
  const editingMinimum = selection.min !== undefined;
  const oppositeId = editingMinimum ? 'preferredMaxAge' : 'preferredMinAge';
  const stored = document.profileContext?.find(item => item.fieldId === oppositeId)
    ?? document.profileConfirmed?.find(item => item.fieldId === oppositeId);
  if (!stored) return null;
  const opposite = Number(stored.values[0]);
  if (editingMinimum ? selection.min <= opposite : selection.max >= opposite) return null;
  const side = editingMinimum ? 'الأعلى' : 'الأدنى';
  return `الحد ${side} المحفوظ للعمر ${number.format(opposite)} سنة. عدّل العمر اللي أدخلته، أو حدّد الحدّين مع بعض لتغيير النطاق.`;
}

export function applyRefinement(document, selection, requestId, turnId) {
  const turn = {id:turnId,topic:'intent',question:selection.question,answer:selection.answer,skipped:false};
  const proposals = selection.fields.map(field => ({...field, id:'profile:' + field.fieldId, exclude:false,
    summary:turn.answer,evidence:[{turnId, quote:turn.answer}],needsClarification:false}));
  const ids = new Set(proposals.map(p => p.id));
  const replace = prior => [...(prior ?? []).filter(p => !ids.has(p.id)), ...proposals];
  return {...document,turns:[...document.turns,turn],lastRequestId:requestId,
    profileProposals:replace(document.profileProposals),profileConfirmed:replace(document.profileConfirmed)};
}
