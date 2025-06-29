import { createClient } from "@supabase/supabase-js"

// Replace these with your actual Supabase credentials
const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
)

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Only GET allowed" })
  }

  try {
    const { data, error } = await supabase
      .from("participants")
      .select("id, assigned_num, table_number, q1, q2, q3, q4")
      .eq("match_id", STATIC_MATCH_ID)
      .order("assigned_num", { ascending: true }) // fixed field name

    if (error) throw error

    return res.status(200).json({ participants: data })
  } catch (err) {
    console.error("❌ Error fetching participants:", err)
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
}
