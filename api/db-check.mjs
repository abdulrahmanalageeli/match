import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  const match_id = "00000000-0000-0000-0000-000000000000"
  
  try {
    console.log("Checking database schema...");
    
    // Test participants table
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("count")
      .eq("match_id", match_id)
      .limit(1)
    
    // Test event_state table
    const { data: eventState, error: eventStateError } = await supabase
      .from("event_state")
      .select("phase")
      .eq("match_id", match_id)
      .limit(1)
    
    // Test match_results table
    const { data: matchResults, error: matchResultsError } = await supabase
      .from("match_results")
      .select("round")
      .eq("match_id", match_id)
      .limit(1)
    
    // Test group_matches table
    const { data: groupMatches, error: groupMatchesError } = await supabase
      .from("group_matches")
      .select("group_id")
      .eq("match_id", match_id)
      .limit(1)
    
    const results = {
      participants: {
        accessible: !participantsError,
        error: participantsError?.message || null
      },
      event_state: {
        accessible: !eventStateError,
        error: eventStateError?.message || null
      },
      match_results: {
        accessible: !matchResultsError,
        error: matchResultsError?.message || null
      },
      group_matches: {
        accessible: !groupMatchesError,
        error: groupMatchesError?.message || null
      }
    };
    
    console.log("Database check results:", results);
    
    return res.status(200).json({
      message: "Database schema check completed",
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Database check error:", error);
    return res.status(500).json({
      error: "Failed to check database schema",
      details: error.message
    });
  }
} 