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
    
    // Test participant constraint validation
    console.log("Testing participant constraints...");
    
    // Test that participant_a_number cannot be 0 (should fail)
    try {
      const { data: testData, error: testError } = await supabase
        .from("match_results")
        .insert([{
          participant_a_number: 0,  // This should violate constraint
          participant_b_number: 1,
          compatibility_score: 50,
          reason: "Test constraint",
          match_id: match_id,
          round: 999  // Use a test round
        }])
      
      if (testError) {
        console.log("✅ Correctly rejected participant_a_number = 0:", testError.message);
        results.participant_a_constraint = {
          working: true,
          error: testError.message
        };
      } else {
        console.log("❌ ERROR: Database allowed participant_a_number = 0");
        results.participant_a_constraint = {
          working: false,
          error: "Database incorrectly allowed participant_a_number = 0"
        };
        // Clean up test data
        await supabase.from("match_results").delete().eq("round", 999).eq("match_id", match_id);
      }
    } catch (err) {
      console.log("✅ Constraint test failed as expected:", err.message);
      results.participant_a_constraint = {
        working: true,
        error: err.message
      };
    }
    
    // Test that participant_b_number can be 0 (should succeed)
    try {
      const { data: testData2, error: testError2 } = await supabase
        .from("match_results")
        .insert([{
          participant_a_number: 999,  // Valid positive integer
          participant_b_number: 0,    // This should be allowed
          compatibility_score: 50,
          reason: "Test organizer match",
          match_id: match_id,
          round: 998  // Use another test round
        }])
      
      if (!testError2) {
        console.log("✅ Successfully allowed participant_b_number = 0");
        results.participant_b_organizer = {
          working: true,
          error: null
        };
        // Clean up test data
        await supabase.from("match_results").delete().eq("round", 998).eq("match_id", match_id);
      } else {
        console.log("❌ ERROR: Database rejected valid organizer match:", testError2.message);
        results.participant_b_organizer = {
          working: false,
          error: testError2.message
        };
      }
    } catch (err) {
      console.log("❌ Organizer match test failed:", err.message);
      results.participant_b_organizer = {
        working: false,
        error: err.message
      };
    }
    
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