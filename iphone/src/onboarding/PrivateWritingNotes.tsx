import type { InterviewDocument } from '../interview/types';

export type WritingNotes = { bio: string[]; lookingFor: string[] };

export function writingNotes(document?: InterviewDocument | null): WritingNotes {
  const notes: WritingNotes = { bio: [], lookingFor: [] };
  if (document?.status !== 'confirmed' || document.pendingAnalysis) return notes;
  const answers = new Map(document.turns.filter(turn => !turn.skipped).map(turn => [turn.id, turn.answer]));
  for (const { subject, topic, turnId, quote } of document.statements ?? []) {
    if (!quote.trim() || !answers.get(turnId)?.includes(quote)) continue;
    const field = subject === 'self' && ['description','social','interest'].includes(topic) ? 'bio'
      : subject === 'partner' && ['seriousness','interest','social','description'].includes(topic) ? 'lookingFor' : null;
    if (field && !notes[field].includes(quote)) notes[field].push(quote);
  }
  return notes;
}

export function PrivateWritingNotes({ quotes, onAdd, value, limit }: {
  quotes?: readonly string[]; value: string; limit: number; onAdd: (next: string) => void;
}) {
  if (!quotes?.length) return null;
  return <details className="nf-story-more wd-private-writing-notes">
    <summary>كلامي مع لونا</summary>
    <p>هذه العبارات خاصة بك. اختر فقط ما تحب إضافته إلى مسودة ملفك.</p>
    {quotes.map(quote => {
      const included = value.includes(quote);
      const next = [value.trimEnd(), quote].filter(Boolean).join('\n');
      return <button className="wd-slide-rephrase" key={quote} type="button"
        disabled={included || next.length > limit}
        aria-label={`أضف إلى المسودة: ${quote}`} onClick={() => onAdd(next)}>
        {included ? '✓' : '+'} «{quote}»
      </button>;
    })}
  </details>;
}
