import prompts from './refinement-prompts.json' with { type: 'json' };

const formalTiming = 'preference:marriage_timeline:self';

function flexiblePreference(quote) {
  return /(?:ما\s*(?:يهمني|يفرق معي|عندي (?:حد|تفضيل))|أي\s+(?:طول|عمر|وقت)\s+يناسبني|بدون\s+(?:حدود|تحديد))/u.test(quote);
}

function canRefine(statement) {
  if (statement.topic === 'timeline') return statement.subject === 'intent' || statement.subject === 'self';
  return statement.subject === 'partner' && (statement.topic === 'height' || statement.topic === 'age');
}

/** Prefer a clarification that fills missing fields. A private observation on its own
 * never supplies an age, height or timing code. Manual review can reopen other topics. */
export function nextRefinement(
  doc,
  context = [],
  choices = {},
  manual = false,
) {
  if (doc.pendingAnalysis || doc.status !== 'review') return;
  const answered = new Set(doc.turns.map(turn => turn.question.split('\u2029').at(-1)));
  if (!manual && Object.values(prompts).some(prompt => answered.has(prompt))) return;
  const resolved = [
    ...(doc.profileContext ?? []), ...context,
    ...(doc.profileProposals ?? []).filter(p => !p.needsClarification),
    ...(doc.profileConfirmed ?? []),
  ];
  const has = (field) => resolved.some(p => p.fieldId === field);
  const ageSet = resolved.some(p =>
    (p.fieldId === 'preferredMinAge' && Number(p.values[0]) > 18)
    || (p.fieldId === 'preferredMaxAge' && Number(p.values[0]) < 110)
  );
  const hasFormalTiming = Boolean(choices[formalTiming]?.length || doc.confirmed.some(p => p.id === formalTiming));
  const turns = new Map(doc.turns.filter(t => !t.skipped).map(t => [t.id, t.answer]));
  let best;
  let bestValue = 0;
  for (const note of doc.statements ?? []) {
    if (!canRefine(note) || answered.has(prompts[note.topic]) || !note.quote.trim()
      || !turns.get(note.turnId)?.includes(note.quote) || flexiblePreference(note.quote)) continue;
    // A relative age can already guide the member; asking for their range can
    // fill both age bounds. A vague height has no usable structured filter.
    // Formal-step and wedding timing have distinct meanings and values.
    const value = note.topic === 'height' ? (has('partnerCriteria.height') ? 0 : 3)
      : note.topic === 'age' ? (ageSet ? 0 : 2)
      : (has('marriageBasics.marriageTimeline') ? 0 : hasFormalTiming ? 1 : 2);
    if (!value) continue;
    // When the member calls something essential, resolving it takes precedence.
    const priority = value + (/(?:شرط|ضروري|لازم|أهم شيء|اهم شي)/u.test(note.quote) ? 3 : 0);
    if (priority > bestValue) {
      bestValue = priority;
      best = note;
    }
  }
  return best;
}
