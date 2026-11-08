import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyNext } from '../src/community/journeyNext.ts';

test('next-step summary distinguishes both participants, current agreement, and pending rewind', () => {
  const current = { stage: 0, mine: false, peer: false, exclusive: false };
  assert.equal(journeyNext(current, 'رهام').waiting, 'عندما تكونان مستعدّين');
  assert.equal(journeyNext({ ...current, consentMine: true }, 'رهام').waiting, 'بانتظار رهام');
  assert.equal(journeyNext({ ...current, consentPeer: true }, 'رهام').yours, true);
  const next = journeyNext({ ...current, exclusive: true, stage: 1, peer: true }, 'رهام');
  assert.equal(next.waiting, 'بانتظار موافقتك'); assert.equal(next.title, 'الخطوة الرسمية أو العائلية');
  assert.equal(next.agreed, 'نقاش جاد حول الزواج · حصري');
  assert.equal(journeyNext({ ...current, rewindPeer: true }, 'رهام').title, 'مراجعة العودة خطوة');
  assert.equal(journeyNext({ ...current, exclusive: true, stage: 2 }, 'رهام').title, 'تنسيق الخطوة العائلية');
});
