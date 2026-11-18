import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { seedCommunicationMember } from './communication-fixture.mjs';
import { addUser, asService, createDatabase } from './harness.mjs';

test('receipt recording accepts the four configured products and legacy renewals only', async () => {
  const db = await createDatabase();
  try {
    const member = { id: randomUUID(), email: 'membership-test@example.test', sessionId: randomUUID() };
    await addUser(db, member);
    const appAccountToken = await seedCommunicationMember(db, member, 'woman');
    const prefix = 'com.blindmatch.marriage.monthly';
    async function record(productId) {
      const receipt = {
        bundleId: 'com.blindmatch.marriage', productId, appAccountToken,
        originalTransactionId: randomUUID(), transactionId: randomUUID(),
        signedDate: Date.now(), expiresDate: Date.now() + 86_400_000, environment: 'Sandbox',
      };
      const result = await asService(db, () => db.query(
        'select public.marriage_record_receipt($1,$2,false) as state', [member.id, receipt],
      ));
      return result.rows[0].state;
    }

    for (const suffix of ['', '.men', '.women', '.seriousness', '.seriousness.women']) {
      assert.equal((await record(prefix + suffix)).membership.active, true);
    }
    await assert.rejects(record(prefix + '.unknown'), { code: '22023' });
    await assert.rejects(record(undefined), { code: '22023' });
  } finally {
    await db.close();
  }
});
