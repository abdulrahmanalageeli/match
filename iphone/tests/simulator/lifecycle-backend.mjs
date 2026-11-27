// Loopback only. All actors, sessions, memberships and data reside in disposable PostgreSQL.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { asMember } from '../../supabase/tests/harness.mjs';
import { openRegisteredPair } from './lifecycle-registration-backend.mjs';

const allowedRPC = new Set([
  'marriage_state', 'marriage_browse', 'marriage_discover', 'marriage_request', 'marriage_inbox',
  'marriage_act', 'marriage_progress', 'marriage_agreement', 'marriage_thread', 'marriage_thread_page',
  'marriage_message', 'marriage_confirm_thread_delivery', 'marriage_mark_thread_read', 'marriage_thread_read_state',
  'marriage_journey_choice', 'marriage_close_introduction', 'marriage_family_contact', 'marriage_share_family_contact',
  'marriage_request_history', 'marriage_request_history_item', 'marriage_request_history_page', 'marriage_push_updates',
  'marriage_set_typing', 'marriage_rewind_step',
]);
const watched = new Set(['marriage_request','marriage_act','marriage_agreement','marriage_message','marriage_mark_thread_read',
  'marriage_confirm_thread_delivery','marriage_journey_choice','marriage_close_introduction','marriage_share_family_contact']);

export function startLifecycleServer(port = 18767) {
  const actors = new Map(), events = [], branches = [];
  let db, users, registered, membership, checkpoint, queue = Promise.resolve();
  let sequence = 0, branch = 'initial';
  const record = (event, details = {}) => events.push({sequence:++sequence, branch, event, ...details});
  const actorMap = () => users ? {male:users.man.id,female:users.woman.id,man:users.man.id,woman:users.woman.id,membership} : {};
  const actorFor = (ref) => {
    assert.ok(users, 'Both signups must complete first');
    const actor = Object.values(users).find(user => user.id === ref || user.gender === ref ||
      ({male:'man',female:'woman'})[ref] === user.gender);
    assert.ok(actor, 'Choose one of the two registered members');
    return actor;
  };
  const rpc = (database,user,name,args) => {
    assert.ok(allowedRPC.has(name), 'Unknown lifecycle RPC');
    assert.ok(Array.isArray(args) && args.length <= 6, 'Expected positional arguments');
    const values = args.map((_,i)=>'$'+(i+1)).join(',');
    return asMember(database,user.id,user.sessionId,async () =>
      (await database.query('select public.'+name+'('+values+') as value',args)).rows[0].value);
  };
  const signUp = async (submission) => {
    const {profile,account,photo} = submission;
    const gender = profile?.gender;
    assert.ok(gender === 'man' || gender === 'woman', 'Missing submitted gender');
    assert.ok(account?.id && account.email && account.email === profile.contact, 'Signup identity does not match profile');
    const previous = actors.get(gender);
    if (previous) assert.deepEqual(previous,submission,'A different signup already occupies this slot');
    if (!previous) {
      actors.set(gender,submission);
      record('nativeSignup',{gender,actor:account.id});
    }
    if (actors.size === 2 && !db) {
      const records = ['man','woman'].map(gender=>actors.get(gender));
      const pair = await openRegisteredPair(records.map(item=>item.profile),
        Object.fromEntries(records.map(item=>[item.profile.gender,item.account])),
        Object.fromEntries(records.map(item=>[item.profile.gender,item.photo])));
      db = pair.db;
      users = pair.users;
      registered = pair.result;
      membership = {};
      for (const user of Object.values(users)) {
        const state = await rpc(db,user,'marriage_state',[]);
        membership[user.gender] = state.membership;
      }
      record('registeredPair',{man:users.man.id,woman:users.woman.id});
    }
    return {ready:Boolean(db), received:[...actors.keys()], ...actorMap()};
  };
  async function relationship(database,id) {
    assert.ok(users && id, 'Expected a registered pair and request ID');
    const row = (await database.query(
      'select id,status from marriage.member_requests where id=$1 and requester_id in ($2,$3) and recipient_id in ($2,$3)',
      [id,users.man.id,users.woman.id])).rows[0];
    assert.ok(row, 'No request between the submitted members matches this ID');
    return row;
  }
  const digest = async (database,id) => {
    const request = await relationship(database,id);
    if (request.status !== 'accepted') {
      const history = await rpc(database,users.man,'marriage_request_history_item',[id]);
      return {...request, closureContext:history?.closureContext,canRequestAgain:history?.canRequestAgain,hasFamilyContact:history?.hasFamilyContact};
    }
    const pact = await rpc(database,users.man,'marriage_agreement',[id,'read',{}]);
    const progress = await rpc(database,users.man,'marriage_progress',[id]);
    return {...request, pact:pact.status, proposalId:pact.proposalId, exclusive:progress.exclusive, stage:progress.stage};
  };
  async function route(method,path,body) {
    if (method==='GET' && path==='/health') return {ok:true,ready:Boolean(db)};
    if (method==='POST' && path==='/signup') return signUp(body);
    if (method==='POST' && path==='/actors') {
      await signUp(body.male ?? body.man);
      return signUp(body.female ?? body.woman);
    }
    if (method==='GET' && path==='/actors') return actorMap();
    if (method==='GET' && path==='/results') {
      const current = checkpoint ? await digest(db,checkpoint.id) : null;
      return {ready:Boolean(db),actors:actorMap(),registration:registered,checkpoint:checkpoint?.state,branches,current,events};
    }
    if (method==='POST' && path==='/rpc') {
      const {actor:ref,name,args=[]} = body;
      const actor = actorFor(ref);
      const track = watched.has(name) && (name!=='marriage_agreement' || (args[1] && args[1]!=='read'));
      const details = {actor:actor.id,gender:actor.gender,rpc:name};
      if (name !== 'marriage_request') details.requestId=args[0];
      if (name === 'marriage_act' || name === 'marriage_agreement') details.action=args[1];
      if (name === 'marriage_journey_choice') Object.assign(details,{topic:args[1],action:args[2],stage:args[4]});
      if (name === 'marriage_close_introduction') Object.assign(details,{context:args[1],allowRematch:args[2]});
      try {
        const value = await rpc(db,actor,name,args);
        if (name === 'marriage_request') details.requestId=value;
        if (name === 'marriage_journey_choice') Object.assign(details,{exclusive:value.exclusive,reachedStage:value.stage});
        if (name === 'marriage_agreement' && value) details.pact=value.status;
        if (track) record('rpc',{...details,ok:true});
        return {data:value ?? null,error:null};
      } catch (error) {
        if (track) record('rpc',{...details,ok:false,code:error.code});
        return {data:null,error:{message:error.message,code:error.code ?? 'LOCAL_AUDIT'}};
      }
    }
    if (method==='POST' && path==='/checkpoint') {
      const id = body.requestId;
      const state = await digest(db,id);
      assert.equal(state.pact,'accepted','Checkpoint must be taken after both members sign');
      // A complete PostgreSQL checkpoint preserves the same request ID, data and sessions in both branches.
      const backup = await db.dumpDataDir('gzip');
      checkpoint = {id,state,backup};
      record('checkpoint',{requestId:id,pact:state.pact});
      branch = String(body.branch || 'first');
      return {ok:true,requestId:id,...state};
    }
    if (method==='POST' && (path==='/reset' || path==='/branch')) {
      assert.ok(checkpoint, 'Create the signed-pact checkpoint first');
      const finished = await digest(db,checkpoint.id);
      const oldDB = db;
      const restored = new oldDB.constructor({loadDataDir:checkpoint.backup});
      try {
        await restored.waitReady;
        assert.deepEqual(await digest(restored,checkpoint.id),checkpoint.state);
      } catch (error) { await restored.close(); throw error; }
      db = restored;
      await oldDB.close();
      branches.push({branch,state:finished});
      branch = String(body.branch || 'second');
      record('restored',{requestId:checkpoint.id});
      return {ok:true,requestId:checkpoint.id,...checkpoint.state};
    }
    if (method==='POST' && path==='/expire') {
      const id = body.requestId;
      const state = await digest(db,id);
      assert.equal(state.pact,'accepted','Only a mutually signed, active pact may expire in this fixture');
      await db.query("update marriage.conversation_agreements set data=jsonb_set(data,'{deadline}',to_jsonb(now()-interval '1 second')) where request_id=$1",[id]);
      await db.query('select public.nisfayn_enqueue_deadline_reminders()');
      const expired = await digest(db,id);
      assert.equal(expired.pact,'expired');
      record('fixtureDeadline',{requestId:id,pact:expired.pact});
      return {ok:true,requestId:id,...expired};
    }
    throw Object.assign(new Error('Unknown audit route'),{status:404});
  }
  const server = createServer(async (request,response)=>{
    const origin = request.headers.origin;
    const allowedOrigin = !origin || origin==='null' || /^(capacitor|ionic):\/\/localhost$/.test(origin)
      || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!allowedOrigin) { response.writeHead(403); response.end(); return; }
    if (origin) response.setHeader('Access-Control-Allow-Origin',origin);
    response.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers','content-type');
    response.setHeader('Cache-Control','no-store');
    if (request.method==='OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
      const parts = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        assert.ok(bytes <= 262144, 'Audit payload too large');
        parts.push(chunk);
      }
      const body = bytes ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {};
      const path = new URL(request.url,'http://127.0.0.1').pathname;
      // The PGlite harness emulates each RPC's authenticated session on one connection.
      const run = queue.then(()=>route(request.method,path,body));
      queue=run.catch(()=>{});
      const data = await run;
      response.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      response.end(JSON.stringify(data));
    } catch (error) {
      console.error('Lifecycle control failed:',request.method,request.url,error.message);
      response.writeHead(error.status ?? 400,{'Content-Type':'application/json; charset=utf-8'});
      response.end(JSON.stringify({error:{message:error.message,code:error.code ?? 'LOCAL_AUDIT'}}));
    }
  });
  server.listen(port,'127.0.0.1',()=>console.log('Lifecycle fixture listening on 127.0.0.1:'+server.address().port));
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) startLifecycleServer();
