import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  const match_id = "00000000-0000-0000-0000-000000000000"
  
  try {
    console.log("Initializing event state for match_id:", match_id);
    
    // Check if event state exists
    const { data: existingState, error: checkError } = await supabase
      .from("event_state")
      .select("phase")
      .eq("match_id", match_id)
      .single()
    
    if (checkError && checkError.code === 'PGRST116') {
      // No event state exists, create default
      console.log("No event state found, creating default...");
      
      const { data: newState, error: createError } = await supabase
        .from("event_state")
        .insert({
          match_id: match_id,
          phase: "registration",
          current_round: 1,
          total_rounds: 4,
          emergency_paused: false,
          announcement: null,
          announcement_type: null,
          announcement_time: null,
          pause_time: null
        })
        .select()
        .single()
      
      if (createError) {
        console.error("Failed to create event state:", createError);
        return res.status(500).json({
          error: "Failed to create event state",
          details: createError.message
        });
      }
      
      console.log("Event state created successfully:", newState);
      return res.status(200).json({
        message: "Event state initialized successfully",
        data: newState
      });
      
    } else if (checkError) {
      console.error("Error checking event state:", checkError);
      return res.status(500).json({
        error: "Failed to check event state",
        details: checkError.message
      });
    } else {
      console.log("Event state already exists:", existingState);
      return res.status(200).json({
        message: "Event state already exists",
        data: existingState
      });
    }
    
  } catch (error) {
    console.error("Init event state error:", error);
    return res.status(500).json({
      error: "Failed to initialize event state",
      details: error.message
    });
  }
} 