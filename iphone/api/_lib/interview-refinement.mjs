import prompts from '../../src/interview/refinement-prompts.json' with { type: 'json' };
import fields from '../../src/interview/profile-catalog.json' with { type: 'json' };

const catalog = new Map(fields.map(field => [field.fieldId, field]));
const number = new Intl.NumberFormat('ar-SA', {useGrouping:false});
const rangeNames = { height: 'طول الشريك', age: 'عمر الشريك' };
const unit = { height: 'سم', age: 'سنة' };
const subjects = {height:'partner', age:'partner', timeline:'intent'};

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
  if (!keys.length || keys.some(key => !['min','max'].includes(key))) return null;
  const bounds = catalog.get(topic === 'height' ? 'partnerCriteria.height' : 'preferredMinAge');
  if (keys.some(key => !Number.isInteger(selection[key]) || selection[key] < bounds.min || selection[key] > bounds.max) ||
    (min !== undefined && max !== undefined && min > max)) return null;
  const quantity = min === undefined ? `بحد أقصى ${number.format(max)}` :
    max === undefined ? `بحد أدنى ${number.format(min)}` : `من ${number.format(min)} إلى ${number.format(max)}`;
  const profile = topic === 'height' ? [{fieldId:'partnerCriteria.height', values:[String(min ?? ''),String(max ?? '')], mode:'prefer'}] :
    [['preferredMinAge', min], ['preferredMaxAge', max]].filter(([,bound]) => bound !== undefined)
      .map(([fieldId,bound]) => ({fieldId, values:[String(bound)], mode:null}));
  return {question:prompts[topic],answer:`أفضّل ${rangeNames[topic]} ${quantity} ${unit[topic]}.`,fields:profile};
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
