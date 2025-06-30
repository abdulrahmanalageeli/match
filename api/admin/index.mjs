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

    if (action === "trigger-match") {
      const { data: participants, error } = await supabase
        .from("participants")
        .select("id, assigned_number, q1, q2, q3, q4")
        .eq("match_id", STATIC_MATCH_ID)

      if (error) return res.status(500).json({ error: error.message })
      if (!participants || participants.length < 2) {
        return res.status(400).json({ error: "Not enough participants." })
      }

      const pairs = []
      for (let i = 0; i < participants.length; i++) {
        for (let j = i + 1; j < participants.length; j++) {
          pairs.push([participants[i], participants[j]])
        }
      }

      const compatibility = {}
      for (const [a, b] of pairs) {
        const prompt = `Evaluate compatibility between two participants based on their answers...\n\nA:\nq1: ${a.q1}\nq2: ${a.q2}\nq3: ${a.q3}\nq4: ${a.q4}\n\nB:\nq1: ${b.q1}\nq2: ${b.q2}\nq3: ${b.q3}\nq4: ${b.q4}\n\nRespond with a JSON: { "score": number (0–100), "reason": "..." }`

        const completion = await openai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "gpt-4",
        })

        const parsed = JSON.parse(completion.choices[0].message.content)
        const score = parsed.score || 0

        compatibility[`${a.id}-${b.id}`] = {
          score,
          reason: parsed.reason,
        }
      }

      const size = participants.length
      const matrix = Array(size)
        .fill(0)
        .map(() => Array(size).fill(10000))

      const indexMap = Object.fromEntries(participants.map((p, i) => [p.id, i]))

      for (const key in compatibility) {
        const [idA, idB] = key.split("-")
        const i = indexMap[idA]
        const j = indexMap[idB]
        const score = compatibility[key].score
        matrix[i][j] = matrix[j][i] = 100 - score
      }

      const result = munkres(matrix)
      const matches = []
      for (const [i, j] of result) {
        if (i >= j) continue
        const a = participants[i]
        const b = participants[j]
        const meta = compatibility[`${a.id}-${b.id}`] || compatibility[`${b.id}-${a.id}`]

        matches.push({
          match_id: STATIC_MATCH_ID,
          participant_a_id: a.id,
          participant_b_id: b.id,
          participant_a_number: a.assigned_number,
          participant_b_number: b.assigned_number,
          match_type: "توأم روح",
          reason: meta.reason,
          compatibility_score: meta.score,
        })
      }

      await supabase.from("match_results").delete().eq("match_id", STATIC_MATCH_ID)
      await supabase.from("match_results").insert(matches)

      return res.status(200).json({ message: "Matching complete", analysis: `✅ ${matches.length} pairs matched.` })
    }
  }

  return res.status(405).json({ error: "Unsupported method or action" })
}
