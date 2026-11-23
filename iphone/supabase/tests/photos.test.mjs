import {seedCommunicationMember} from './communication-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

test('retirement closes legacy photo access and queues existing blobs while keeping cleanup operational',async()=>{
 const db=await createDatabase({throughMigration:'20261123144300_shorter_demo_close_dispatch.sql'});
 try {
  const u={id:randomUUID(),sessionId:randomUUID(),email:'photo-retirement@example.invalid'};
  await addUser(db,u);await seedCommunicationMember(db,u,'man');
  const path=u.id+'/'+randomUUID()+'.jpg';
  await db.query("insert into storage.objects(bucket_id,name) values('nisfayn-private-photos',$1)",[path]);
  const { readFile }=await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261123144400_retire_temporary_photo_sharing.sql',import.meta.url),'utf8'));
  for(const fn of ['public.marriage_photo_prepare()','public.marriage_photo_share(uuid,boolean)','marriage.photo_state(uuid)']){
   assert.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') ok",[fn])).rows[0].ok,false);
  }
  assert.equal((await asMember(db,u.id,u.sessionId,()=>db.query("select name from storage.objects where name=$1",[path]))).rows.length,0);
  assert.ok((await asService(db,()=>db.query('select public.marriage_photo_cleanup_batch() paths'))).rows[0].paths.includes(path));
 } finally {await db.close();}
});
