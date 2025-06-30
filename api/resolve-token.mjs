import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY // ✅ Anon key is fine here (read-only)
)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { secure_token } = req.body

  if (!secure_token) {
    return res.status(400).json({ error: "Missing token" })
  }

  const match_id = "00000000-0000-0000-0000-000000000000" // Or dynamic if needed

  const { data, error } = await supabase
    .from("participants")
    .select("assigned_number")
    .eq("secure_token", secure_token)
    .eq("match_id", match_id)
    .maybeSingle()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  if (!data) {
    return res.status(404).json({ success: false, error: "Token not found" })
  }

  return res.status(200).json({ success: true, assigned_number: data.assigned_number })
}
