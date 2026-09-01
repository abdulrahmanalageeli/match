import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

test("event brand migration updates only legacy 4.0 database values", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.twilio_response_rules (
        action_key text primary key,
        response_text text not null
      );
      create table public.event_state (
        id integer primary key,
        whatsapp_config jsonb
      );
      insert into public.twilio_response_rules (action_key, response_text) values
        ('event_information', 'الفعالية: التوافق الأعمى 4.0'),
        ('custom', 'فعالية خاصة');
      insert into public.event_state (id, whatsapp_config) values
        (1, '{"eventName":"التوافق الأعمى 4.0","location":"Riyadh"}'),
        (2, '{"eventName":"اسم مخصص"}'),
        (3, '{"location":"Jeddah"}');
    `)

    const migration = await readFile(
      new URL("../../supabase/migrations/20260901133409_update_event_brand_to_5_0.sql", import.meta.url),
      "utf8",
    )
    await db.exec(migration)
    await db.exec(migration)

    const responses = (await db.query(
      "select action_key,response_text from public.twilio_response_rules order by action_key",
    )).rows
    assert.deepEqual(responses, [
      { action_key: "custom", response_text: "فعالية خاصة" },
      { action_key: "event_information", response_text: "الفعالية: التوافق الأعمى 5.0" },
    ])

    const states = (await db.query(`
      select id,whatsapp_config->>'eventName' as event_name,whatsapp_config->>'location' as location
      from public.event_state
      order by id
    `)).rows
    assert.deepEqual(states, [
      { id: 1, event_name: "التوافق الأعمى 5.0", location: "Riyadh" },
      { id: 2, event_name: "اسم مخصص", location: null },
      { id: 3, event_name: null, location: "Jeddah" },
    ])
  } finally {
    await db.close()
  }
})
