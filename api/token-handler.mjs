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
  const { assigned_number } = req.body;

  if (!assigned_number) {
    return res.status(400).json({ error: "Missing assigned_number" });
  }

  // Check if participant already exists
  const { data: existing, error: fetchError } = await supabase
    .from("participants")
    .select("secure_token")
    .eq("assigned_number", assigned_number)
    .eq("match_id", "00000000-0000-0000-0000-000000000000")
    .single();

  if (existing) {
    return res.status(200).json({ secure_token: existing.secure_token });
  }

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("Check Token Error:", fetchError);
    return res.status(500).json({ error: "Database fetch failed" });
  }

  // Create new participant if none found
  const { data, error } = await supabase
    .from("participants")
    .insert([
      {
        assigned_number,
        match_id: "00000000-0000-0000-0000-000000000000",
      },
    ])
    .select("secure_token")
    .single();

  if (error) {
    console.error("Create Token Error:", error);
    return res.status(500).json({ error: "Database insert failed" });
  }

  return res.status(200).json({ secure_token: data.secure_token });
}

  if (action === "resolve") {
    // 🔍 RESOLVE TOKEN LOGIC (from resolve-token.mjs)
    const { secure_token } = req.body

    if (!secure_token) {
      return res.status(400).json({ error: "Missing secure_token" })
    }

    const { data, error } = await supabase
      .from("participants")
      .select("assigned_number")
      .eq("secure_token", secure_token)
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, error: "Invalid token" })
    }

    return res.status(200).json({ success: true, assigned_number: data.assigned_number })
  }

  return res.status(400).json({ error: "Invalid action" })
}
