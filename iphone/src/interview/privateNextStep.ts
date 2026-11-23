import openingPrompts from './opening-prompts.json' with { type: 'json' };
import type { InterviewDocument } from './types';

export function recalledNextStep(doc?: InterviewDocument | null) {
  if (!doc || doc.pendingAnalysis) return;
  const note = doc.readiness.find(item => item.id === 'nextStep');
  for (const turn of [...doc.turns].reverse()) {
    if (turn.skipped || !turn.answer.trim()) continue;
    if (turn.question.split('\u2029').at(-1) === openingPrompts.nextStep) {
      return {text: turn.answer.trim(), answer: turn.answer.trim()};
    }
    const statement = [...(doc.statements ?? [])].reverse().find(item => item.subject === 'intent' && item.topic === 'nextStep'
      && item.turnId === turn.id && item.quote.trim() && turn.answer.includes(item.quote));
    if (statement) return {text: statement.quote, answer: turn.answer.trim()};
    const evidence = note?.evidence.filter(item => item.turnId === turn.id && item.quote.trim() && turn.answer.includes(item.quote));
    if (evidence?.length) {
      const sentences = turn.answer.split(/(?<=[.!؟؛])\s+|\n+/u);
      const text = [...new Set(evidence.map(item => sentences.find(part => part.includes(item.quote)) ?? turn.answer))].join(' … ');
      // A substring can omit a negation. Only the whole answer can suggest a readiness choice.
      return {text: text.trim(), answer: turn.answer.trim()};
    }
  }
}

export function privateNextStep(doc?: InterviewDocument | null) {
  return doc?.status === 'confirmed' ? recalledNextStep(doc) : undefined;
}
