import assert from 'node:assert/strict';
import test from 'node:test';
import { groundedSuggestions, openingHighlights } from '../src/interview/openingEvidence.ts';

const self = 'preference:children_plan:self';
const partner = 'preference:children_plan:partner';
const text = 'أرغب في الإنجاب، وأفضّل شريكًا يرغب في الإنجاب.';
const turn = { id: 'intro', answer: text, skipped: false };
const proposal = (id, quote, turnId = 'intro') => ({ id, values: ['A'], evidence: [{ turnId, quote }] });

test('admits only attested catalog answers with literal evidence from an answered member turn', () => {
  const actual = proposal(self, 'أرغب في الإنجاب');
  const dialog = [turn, { id: 'context:old', answer: text }, { id: 'skipped', answer: text, skipped: true }];
  const rejected = [
    proposal(partner, 'أفضّل شريكًا'), proposal(self, 'أرغبُ في الإنجاب'), proposal(self, ' '),
    proposal(self, 'في الإنجاب', 'missing'), proposal(self, 'في الإنجاب', 'context:old'), proposal(self, 'في الإنجاب', 'skipped'),
    { ...actual, needsClarification: true }, { ...actual, source: 'self_default' }, { ...actual, values: [] },
  ];
  assert.deepEqual(groundedSuggestions([actual, ...rejected], [self], dialog), [actual]);
  assert.deepEqual(groundedSuggestions([actual], undefined, dialog), []);
  const mixed = { ...actual, evidence: [...actual.evidence, { turnId: 'intro', quote: 'قول آخر' }] };
  assert.deepEqual(groundedSuggestions([mixed], [self], dialog), [actual]);
});

test('shared and overlapping phrases keep each field and exact source, including partner perspective', () => {
  const proposals = [proposal(self, 'أرغب في الإنجاب'), proposal(partner, 'أفضّل شريكًا يرغب في الإنجاب'),
    proposal('shared', 'شريكًا يرغب'), proposal('shared', 'شريكًا يرغب'), proposal('other', 'في الإنجاب', 'later')];
  const parts = openingHighlights(text, 'intro', proposals, new Set(proposals.map(item => item.id)));
  assert.deepEqual(parts.map(p => text.slice(p.start, p.end)), ['أرغب في الإنجاب', 'أفضّل شريكًا يرغب في الإنجاب']);
  assert.deepEqual(parts.map(p => p.sources.map(s => s.id)), [[self], [partner, 'shared']]);
  assert.deepEqual(parts[1].sources[1], { id: 'shared', quote: 'شريكًا يرغب' });
});

test('repeated exact occurrences preserve punctuation, unselected prose, line breaks and diacritics', () => {
  const original = 'أهلًا 🌿\nما أريد قوله: أهلًا.';
  const parts = openingHighlights(original, turn.id, [proposal(self, 'أهلًا'), proposal(partner, 'ما أريد')], new Set([self]));
  assert.deepEqual(parts.map(p => original.slice(p.start, p.end)), ['أهلًا', 'أهلًا']);
  assert.equal(original.slice(parts[0].end, parts[1].start), ' 🌿\nما أريد قوله: ');
  assert.deepEqual(openingHighlights(original, turn.id, [proposal(self, 'أهلا')], new Set([self])), []);
});
