import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { action } = req.body

  if (action === "create") {
    // Auto-assign the next available number
    try {
      // Get the highest assigned number
      const { data: existingParticipants, error: fetchError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .order("assigned_number", { ascending: false })
        .limit(1)

      if (fetchError) {
        console.error("Fetch Error:", fetchError)
        return res.status(500).json({ error: "Database fetch failed" })
      }

      // Calculate next number (start from 1 if no participants exist)
      const nextNumber = existingParticipants && existingParticipants.length > 0 
        ? existingParticipants[0].assigned_number + 1 
        : 1

      // Check if this number already exists (race condition protection)
      const { data: existing, error: checkError } = await supabase
        .from("participants")
        .select("secure_token")
        .eq("assigned_number", nextNumber)
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .single()

      if (existing) {
        // Number already exists, return existing token
        return res.status(200).json({ 
          secure_token: existing.secure_token,
          assigned_number: nextNumber,
          is_new: false
        })
      }

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Check Token Error:", checkError)
        return res.status(500).json({ error: "Database check failed" })
      }

      // Create new participant with auto-assigned number
      const { data, error } = await supabase
        .from("participants")
        .insert([
          {
            assigned_number: nextNumber,
            match_id: "00000000-0000-0000-0000-000000000000",
          },
        ])
        .select("secure_token, assigned_number")
        .single()

      if (error) {
        console.error("Create Token Error:", error)
        return res.status(500).json({ error: "Database insert failed" })
      }

      return res.status(200).json({ 
        secure_token: data.secure_token,
        assigned_number: data.assigned_number,
        is_new: true
      })
    } catch (error) {
      console.error("Unexpected error:", error)
      return res.status(500).json({ error: "Unexpected error occurred" })
    }
  }

  if (action === "resolve") {
    const { secure_token } = req.body

    if (!secure_token) {
      return res.status(400).json({ error: "Missing secure_token" })
    }

    const { data, error } = await supabase
      .from("participants")
      .select("assigned_number, q1, q2, q3, q4, summary")
      .eq("secure_token", secure_token)
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, error: "Invalid token" })
    }

    return res.status(200).json({
      success: true,
      assigned_number: data.assigned_number,
      q1: data.q1,
      q2: data.q2,
      q3: data.q3,
      q4: data.q4,
      summary: data.summary
    })
  }

  return res.status(400).json({ error: "Invalid action" })
}
