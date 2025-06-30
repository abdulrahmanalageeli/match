import { createClient } from "@supabase/supabase-js"
import { customAlphabet } from "nanoid"

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { assigned_number } = req.body

  if (!assigned_number) {
    return res.status(400).json({ error: "Missing assigned_number" })
  }

  const match_id = "00000000-0000-0000-0000-000000000000" // or load dynamically if needed

  // Check if already exists
  const { data: existing, error: lookupError } = await supabase
    .from("participants")
    .select("secure_token")
    .eq("assigned_number", assigned_number)
    .eq("match_id", match_id)
    .maybeSingle()

  if (lookupError) {
    return res.status(500).json({ error: "Lookup failed" })
  }

  if (existing?.secure_token) {
    return res.status(200).json({ secure_token: existing.secure_token })
  }

  const secure_token = nanoid()

  const { error: insertError } = await supabase.from("participants").insert([
    {
      assigned_number,
      secure_token,
      match_id,
    },
  ])

  if (insertError) {
    return res.status(500).json({ error: insertError.message })
  }

  return res.status(200).json({ secure_token })
}
