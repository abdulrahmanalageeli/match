import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import munkres from "munkres-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

export default async function handler(req, res) {
  const method = req.method
  const action = req.query.action || req.body?.action

  // 🔹 GET participants
  if (method === "GET") {
    const { data, error } = await supabase
      .from("participants")
      .select("id, assigned_number, table_number, q1, q2, q3, q4")
      .eq("match_id", STATIC_MATCH_ID)
      .order("assigned_number", { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ participants: data })
  }

  // 🔹 POST actions
  if (method === "POST") {
    if (action === "participants") {
  const { data, error } = await supabase
    .from("participants")
    .select("id, assigned_number, table_number, q1, q2, q3, q4")
    .eq("match_id", STATIC_MATCH_ID)
    .order("assigned_number", { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ participants: data })
}

    if (action === "delete") {
      const { assigned_number } = req.body
      const { error } = await supabase
        .from("participants")
        .delete()
        .eq("assigned_number", assigned_number)
        .eq("match_id", STATIC_MATCH_ID)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Deleted successfully" })
    }

    if (action === "set-phase") {
      const { phase } = req.body
      const { error } = await supabase
        .from("event_state")
        .upsert({ match_id: STATIC_MATCH_ID, phase }, { onConflict: "match_id" })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Phase updated" })
    }

    if (action === "set-table") {
      const { data: participants } = await supabase
        .from("participants")
        .select("id, assigned_number")
        .eq("match_id", STATIC_MATCH_ID)
        .order("assigned_number")

      const updates = participants.map((p, idx) => ({
        id: p.id,
        table_number: Math.floor(idx / 2) + 1,
      }))

      const { error } = await supabase.from("participants").upsert(updates)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Tables assigned" })
    }

    if (action === "update-table") {
      const { assigned_number, table_number } = req.body
      const { error } = await supabase
        .from("participants")
        .update({ table_number })
        .eq("assigned_number", assigned_number)
        .eq("match_id", STATIC_MATCH_ID)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ message: "Table updated" })
    }
if (action === "participants") {
  const { data, error } = await supabase
    .from("participants")
    .select("id, assigned_number, table_number, q1, q2, q3, q4")
    .eq("match_id", STATIC_MATCH_ID)
    .order("assigned_number", { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ participants: data })
}

if (action === "event-phase") {
  const { data, error } = await supabase
    .from("event_state")
    .select("phase")
    .eq("match_id", STATIC_MATCH_ID)
    .single()

  if (error) {
    // If no event state exists, return "form" as default
    if (error.code === 'PGRST116') {
      return res.status(200).json({ phase: "form" })
    }
    return res.status(500).json({ error: error.message })
  }
  return res.status(200).json({ phase: data.phase })
}

if (action === "set-announcement") {
  const { message, type = "info" } = req.body
  const { error } = await supabase
    .from("event_state")
    .upsert({ 
      match_id: STATIC_MATCH_ID, 
      announcement: message,
      announcement_type: type,
      announcement_time: new Date().toISOString()
    }, { onConflict: "match_id" })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: "Announcement set" })
}

if (action === "clear-announcement") {
  const { error } = await supabase
    .from("event_state")
    .update({ 
      announcement: null,
      announcement_type: null,
      announcement_time: null
    })
    .eq("match_id", STATIC_MATCH_ID)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: "Announcement cleared" })
}

if (action === "set-emergency-pause") {
  const { paused } = req.body
  const { error } = await supabase
    .from("event_state")
    .upsert({ 
      match_id: STATIC_MATCH_ID, 
      emergency_paused: paused,
      pause_time: paused ? new Date().toISOString() : null
    }, { onConflict: "match_id" })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: `Emergency ${paused ? 'pause' : 'resume'} set` })
}

if (action === "get-event-state") {
  const { data, error } = await supabase
    .from("event_state")
    .select("phase, announcement, announcement_type, announcement_time, emergency_paused, pause_time")
    .eq("match_id", STATIC_MATCH_ID)
    .single()

  if (error) {
    // If no event state exists, return default values
    if (error.code === 'PGRST116') {
      return res.status(200).json({ 
        phase: "form",
        announcement: null,
        announcement_type: null,
        announcement_time: null,
        emergency_paused: false,
        pause_time: null
      })
    }
    return res.status(500).json({ error: error.message })
  }
  return res.status(200).json({ 
    phase: data.phase,
    announcement: data.announcement,
    announcement_type: data.announcement_type,
    announcement_time: data.announcement_time,
    emergency_paused: data.emergency_paused || false,
    pause_time: data.pause_time
  })
}

  }
  return res.status(405).json({ error: "Unsupported method or action" })

}
