import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { seedCommunicationMember } from './communication-fixture.mjs';
import { createDatabase, addUser } from './harness.mjs';

test('support repair requires owner MFA and a matching case, extends grants once, and requires member authorization for deletion', async()=>{
  const db=await createDatabase({throughMigration:'20261123000000'});
  try {
    await db.exec("alter table auth.users add column if not exists created_at timestamptz default now(), add column if not exists last_sign_in_at timestamptz;create table if not exists auth.identities(user_id uuid,provider text)");
    await db.exec(await readFile(new URL('../migrations/20261123121000_member_operations.sql',import.meta.url),'utf8'));
    const newUser=async()=>{const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);return u;};
    const owner=await newUser(), member=await newUser(),other=await newUser();
    await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','المالك')",[owner.id]);
    await db.query('insert into marriage.members(id) values($1) on conflict do nothing',[member.id]);
    const rpc=async(actor,fn,params,aal='aal2')=>{
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor.id,session_id:actor.sessionId,role:'authenticated',aal,amr:[{method:'totp',timestamp:Date.now()/1000}]})]);
      await db.exec('set role authenticated');try{return(await db.query('select public.'+fn+' as result',params)).rows[0].result;}finally{await db.exec('reset role');}
    };
    const act=(cmd,args)=>rpc(owner,'marriage_ops_action($1,$2)',[cmd,{member:member.id,reason:'طلب مساعدة موثق',id:randomUUID(),...args}]);
    const inspect=()=>rpc(owner,'marriage_ops_inspect($1,$2)',['member',{member:member.id}]);
    await assert.rejects(rpc(other,'marriage_ops_inspect($1,$2)',['member',{member:member.id}]));
    await assert.rejects(rpc(owner,'marriage_ops_inspect($1,$2)',['member',{member:member.id}],'aal1'));
    assert.equal((await inspect()).id,member.id);
    const {ticket}=await act('open_case',{category:'billing',subject:'مراجعة اشتراك'});
    await assert.rejects(act('note',{ticket:randomUUID()}));
    const initial=await act('grant',{ticket,tier:'premium',days:20,mode:'extend',expectedEnd:null});
    const payload={ticket,tier:'premium',days:7,mode:'extend',expectedEnd:initial.ends,id:randomUUID()};
    const extended=await act('grant',payload);
    assert.equal(Date.parse(extended.ends)-Date.parse(initial.ends),7*86400000);
    assert.deepEqual(await act('grant',payload),extended);
    await assert.rejects(act('grant',{...payload,id:randomUUID()}));
    const future=await act('grant',{ticket,tier:'seriousness',days:10,mode:'after',expectedEnd:extended.ends});
    assert.equal(Date.parse(future.starts),Date.parse(extended.ends));
    assert.equal((await inspect()).tier,'premium');
    const caseRpc=(actor,action,payload)=>rpc(actor,'marriage_support($1,$2)',[action,payload]);
    await seedCommunicationMember(db,member,'woman');
    await seedCommunicationMember(db,other,'man');
    await act('request_filters',{ticket});
    const options={mode:'all',includeIneligible:true,minAge:60};
    await assert.rejects(caseRpc(other,'case_filters',{id:ticket,options}));
    assert.equal(await caseRpc(member,'case_filters',{id:ticket,options}),true);
    const snapshot=(await inspect()).filterResult;
    assert.equal(snapshot.before,1);assert.equal(snapshot.after,0);
    assert.deepEqual(Object.keys(snapshot).sort(),['after','at','before','mode']);
    await act('offer_export',{ticket});
    const pending=(await inspect()).tickets.find(t=>t.id===ticket);
    await assert.rejects(caseRpc(owner,'admin_reply',{id:ticket,revision:pending.revision,requestId:randomUUID(),status:'resolved',response:'اكتمل التحقق من الإصلاح'}),/لم يتأكّد/);
    await assert.rejects(caseRpc(other,'case_export',{id:ticket}));
    const own=await caseRpc(member,'case_export',{id:ticket});
    assert.ok(own.exportVersion);
    assert.ok((await inspect()).checks.find(c=>c.kind==='export').ok);
    await act('verify_identity',{ticket,field:'تاريخ الميلاد'});
    await assert.rejects(rpc(other,'marriage_ops_member_proof($1)',[ticket]));
    assert.ok((await rpc(member,'marriage_ops_member_proof($1)',[ticket])).verified);
    await act('request_deletion',{ticket});
    await assert.rejects(act('delete',{ticket,confirm:member.id}));
    await assert.rejects(rpc(other,'marriage_confirm_case_deletion($1,$2)',[ticket,true]));
    assert.equal(await rpc(member,'marriage_confirm_case_deletion($1,$2)',[ticket,true]),true);
    assert.equal((await act('delete',{ticket,confirm:member.id})).deleted,true);
  } finally {await db.close();}
});
