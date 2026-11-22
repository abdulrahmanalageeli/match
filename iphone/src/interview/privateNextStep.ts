import openingPrompts from './opening-prompts.json' with { type: 'json' };
import type { InterviewDocument } from './types';

export function privateNextStep(doc?: InterviewDocument | null) {
  if (!doc || doc.status !== 'confirmed') return;
  const turn = doc.turns.filter(item => !item.skipped && item.question.split('\u2029').at(-1) === openingPrompts.nextStep).at(-1);
  if (turn?.answer.trim()) return { text: turn.answer.trim(), answer: turn.answer.trim() };

  const note = doc.readiness.find(item => item.id === 'nextStep');
  const evidence = note?.evidence.flatMap(item => {
    const source = doc.turns.find(turn => turn.id === item.turnId && !turn.skipped);
    if (!item.quote.trim() || !source?.answer.includes(item.quote)) return [];
    const sentence = source.answer.split(/(?<=[.!؟؛])\s+|\n+/u).find(part => part.includes(item.quote));
    return [{ text: (sentence ?? source.answer).trim(), answer: source.answer.trim() }];
  });
  if (evidence?.length) return { text: [...new Set(evidence.map(item => item.text))].join(' … '), answer: evidence.length === 1 ? evidence[0].answer : '' };
}
