import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';

// Disposable PostgreSQL/WASM instance; the Auth tables below model only the
// GoTrue columns used by this project, not an Auth service or a real account.
export async function createDatabase({coreOnly=false, throughMigration}={}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz,raw_app_meta_data jsonb not null default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    -- Model the hosted Realtime policy surface and capture database broadcasts
    -- so recipient, payload, and role isolation can be tested transactionally.
    create schema realtime;
    create table realtime.messages(topic text not null, extension text not null, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
    create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void
      language sql as $$ insert into realtime.messages values ($3,'broadcast',$1 || jsonb_build_object('id',gen_random_uuid()),$2,$4) $$;
    grant usage on schema realtime to authenticated;
    grant select on realtime.messages to authenticated;
    revoke all on function realtime.send(jsonb,text,text,boolean) from public;
    -- Minimal Storage service surface; tests set the trusted operation like its API.
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,owner_id text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    create function storage.allow_any_operation(names text[]) returns boolean language sql stable as $$
      select regexp_replace(coalesce(current_setting('storage.operation',true),''),'^storage\\.','')=any(names)
    $$;
    create function storage.allow_only_operation(name text) returns boolean language sql stable as $$ select storage.allow_any_operation(array[name]) $$;
  `);
  const directory = new URL('../migrations/',import.meta.url);
  for (const file of (await readdir(directory)).filter(s=>s.endsWith('.sql')).sort()) {
    if(throughMigration && file>throughMigration) continue;
    if(coreOnly && !file.endsWith('_marriage_core.sql')) continue;
    let sql=await readFile(new URL(file,directory),'utf8');
    if(file.endsWith('_immediate_push_wakeup.sql')) {
      // Hosted networking and encrypted Vault are unavailable in WASM.
      // Capture wake requests locally; never contact a production endpoint.
      await db.exec(`
        create schema extensions;
        create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat('ab',n),'hex') $$;
        create schema vault;
        create table vault.secrets(name text, decrypted_secret text);
        create view vault.decrypted_secrets as select * from vault.secrets;
        create function vault.create_secret(secret text,name text) returns void language sql as $$ insert into vault.secrets values ($2,$1) $$;
        create schema net;
        create table net.wake_requests(id bigint generated always as identity,url text,body jsonb,headers jsonb);
        create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$ insert into net.wake_requests(url,body,headers) values ($1,$2,$3) returning id $$;
      `);
      sql=sql.replace('create extension if not exists pg_net with schema extensions;','');
    }
    try { await db.exec(sql); }
    catch(error) { throw new Error(file+' line '+sql.slice(0,Number(error.position||1)).split('\n').length+': '+error.message); }
  }
  return db;
}

export async function addUser(db,{id,email,sessionId}) {
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,email]);
  await db.query('insert into auth.sessions values($1,$2,null)',[sessionId,id]);
}

export async function asMember(db,id,sessionId,fn) {
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated',session_id:sessionId})]);
  await db.exec('set role authenticated');
  try { return await fn(db); }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims','',false)");
  }
}

export async function asService(db,fn) {
  await db.exec('set role service_role');
  try { return await fn(db); } finally { await db.exec('reset role'); }
}
