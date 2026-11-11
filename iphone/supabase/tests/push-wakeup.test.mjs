import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './harness.mjs';

test('wake requests deduplicate within a transaction and deny untrusted callers',async()=>{
  const db=await createDatabase();
  try {
    await db.exec(`create temp table wake_test(kind text);
      create trigger wake after insert on wake_test for each row execute function marriage.wake_push_worker();
      begin; insert into wake_test values ('message'),('message');`);
    assert.equal((await db.query('select count(*)::int n from net.wake_requests')).rows[0].n,1);
    await db.exec('commit');
    assert.equal((await db.query("select public.nisfayn_push_wake_authorized(repeat('0',64)) ok")).rows[0].ok,false);
    assert.equal((await db.query("select has_function_privilege('anon','public.nisfayn_push_wake_authorized(text)','execute') ok")).rows[0].ok,false);
    await db.exec("insert into wake_test values ('message')");
    assert.equal((await db.query('select count(*)::int n from net.wake_requests')).rows[0].n,2);
  } finally {await db.close();}
});
