import type { InterviewProposal, InterviewTurn } from './types';

export function groundedSuggestions(proposals: readonly InterviewProposal[], allowedIds: readonly string[] = [], turns: readonly InterviewTurn[] = []) {
  const allowed = new Set(allowedIds);
  const answers = new Map(turns.filter(turn => !turn.skipped && !turn.id.startsWith('context:')).map(turn => [turn.id, turn.answer]));
  return proposals.flatMap(proposal => {
    if (!allowed.has(proposal.id) || proposal.needsClarification || proposal.source === 'self_default' || proposal.values.length !== 1) return [];
    const evidence = proposal.evidence.filter(({turnId, quote}) => quote.trim() && answers.get(turnId)?.includes(quote));
    return evidence.length ? [{ ...proposal, evidence }] : [];
  });
}

type Highlight = { start: number; end: number; sources: { id: string; quote: string }[] };

/** Preserve UTF-16 offsets into the member's original string, including punctuation and diacritics. */
export function openingHighlights(text: string, turnId: string | undefined, proposals: readonly InterviewProposal[], fieldIds: ReadonlySet<string>): Highlight[] {
  const matches: { start: number; end: number; id: string; quote: string }[] = [];
  for (const proposal of proposals) {
    if (!fieldIds.has(proposal.id)) continue;
    for (const {turnId: source, quote} of proposal.evidence) {
      if (source !== turnId || !quote.trim()) continue;
      let start = text.indexOf(quote);
      while (start >= 0) {
        matches.push({ start, end: start + quote.length, id: proposal.id, quote });
        start = text.indexOf(quote, start + quote.length);
      }
    }
  }
  const highlights: Highlight[] = [];
  for (const {start, end, id, quote} of matches.sort((a, b) => a.start - b.start || b.end - a.end)) {
    const previous = highlights.at(-1);
    if (!previous || start >= previous.end) {
      highlights.push({ start, end, sources: [{ id, quote }] });
    } else {
      previous.end = Math.max(previous.end, end);
      if (!previous.sources.some(item => item.id === id && item.quote === quote)) previous.sources.push({ id, quote });
    }
  }
  return highlights;
}
