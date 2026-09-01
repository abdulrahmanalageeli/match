import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

test("legal acceptance migration records a versioned audit row and keeps browser roles out", async () => {
  const db = new PGlite()
  const participantId = "00000000-0000-0000-0000-000000000078"
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.participants (
        id uuid primary key,
        assigned_number integer not null,
        terms_version text,
        privacy_notice_version text,
        consented_at timestamptz
      );
      insert into public.participants (id, assigned_number)
      values ('${participantId}', 78);
    `)
    const migration = await readFile(
      new URL("../../supabase/migrations/20260901115457_legal_acceptance_tracking.sql", import.meta.url),
      "utf8",
    )
    await db.exec(migration)

    const acceptedAt = "2026-09-01T12:00:00.000Z"
    const { rows } = await db.query(
      `select (public.record_participant_legal_acceptance(
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
      )).*`,
      [participantId, 78, "2026-09-01", "2026-09-01", "2026-09-01", "participant_popup", 26, acceptedAt, JSON.stringify({ terms: "/terms", privacy: "/privacy", event: "/about" })],
    )
    assert.equal(rows[0].assigned_number, 78)
    assert.equal(rows[0].document_bundle_version, "2026-09-01")

    const participant = (await db.query("select terms_version, privacy_notice_version, consented_at from public.participants where id=$1", [participantId])).rows[0]
    assert.equal(participant.terms_version, "2026-09-01")
    assert.equal(participant.privacy_notice_version, "2026-09-01")
    assert.equal(new Date(participant.consented_at).toISOString(), acceptedAt)

    const laterAttempt = "2026-09-01T13:00:00.000Z"
    await db.query(
      "select public.record_participant_legal_acceptance($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
      [participantId, 78, "2026-09-01", "2026-09-01", "2026-09-01", "participant_popup", 26, laterAttempt, "{}"],
    )
    const preserved = (await db.query("select accepted_at from public.participant_legal_acceptances where participant_id=$1", [participantId])).rows[0]
    assert.equal(new Date(preserved.accepted_at).toISOString(), acceptedAt)

    const tablePrivileges = (await db.query(`
      select
        has_table_privilege('anon', 'public.participant_legal_acceptances', 'SELECT') as anon,
        has_table_privilege('authenticated', 'public.participant_legal_acceptances', 'SELECT') as authenticated,
        has_table_privilege('service_role', 'public.participant_legal_acceptances', 'SELECT') as service
    `)).rows[0]
    assert.deepEqual(tablePrivileges, { anon: false, authenticated: false, service: true })

    const signature = "public.record_participant_legal_acceptance(uuid,integer,text,text,text,text,integer,timestamp with time zone,jsonb)"
    const functionPrivileges = (await db.query("select has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('authenticated',$1,'EXECUTE') as authenticated,has_function_privilege('service_role',$1,'EXECUTE') as service", [signature])).rows[0]
    assert.deepEqual(functionPrivileges, { anon: false, authenticated: false, service: true })
  } finally {
    await db.close()
  }
})
