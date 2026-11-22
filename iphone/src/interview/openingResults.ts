import type { InterviewProposal } from './types';

type Choices = Record<string, string[]>;
type Field = { id: string; options: readonly {code: string}[] };

/** Compare grounded suggestions with the effective answers for this catalog and family context. */
export function assessmentProgress(fields: readonly Field[], choices: Choices, saved: Choices, proposals: readonly InterviewProposal[], openingTurnId?: string) {
  const suggestions = new Map(proposals.filter(p => !p.needsClarification && p.source !== 'self_default' && p.values.length === 1 && p.evidence.some(e => !e.turnId.startsWith('context:'))).map(p => [p.id, p]));
  const retained = new Set<string>();
  const pending = new Set<string>();
  const extracted = new Set<string>();
  const openingIds = new Set<string>();
  let openingPending = 0, openingMatched = 0, remaining = 0, savedCount = 0;
  for (const field of fields) {
    const answer = choices[field.id];
    if (answer?.length !== 1 || !field.options.some(option => option.code === answer[0])) {
      remaining++;
      continue;
    }
    const savedAnswer = saved[field.id];
    const isSaved = savedAnswer?.length === 1 && savedAnswer[0] === answer[0];
    if (isSaved) savedCount++;
    const proposal = suggestions.get(field.id);
    if (!proposal || !field.options.some(option => option.code === proposal.values[0])) continue;
    extracted.add(field.id);
    if (proposal.values[0] !== answer[0]) continue;
    retained.add(field.id);
    if (!isSaved) pending.add(field.id);
    if (openingTurnId && proposal.evidence.some(e => e.turnId === openingTurnId)) {
      openingIds.add(proposal.id);
      if (isSaved) openingMatched++;
      else openingPending++;
    }
  }
  const opening = [...suggestions.values()].filter(p => openingIds.has(p.id));
  return { retained, pending, extracted, opening, openingPending, openingMatched, remaining, savedCount };
}
