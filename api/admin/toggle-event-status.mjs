import { createClient } from "@supabase/supabase-js"

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { event_id, event_finished } = req.body

  if (!event_id || typeof event_finished !== 'boolean') {
    return res.status(400).json({ 
      error: 'Missing or invalid parameters. Required: event_id (number), event_finished (boolean)' 
    })
  }

  try {
    console.log(`[ADMIN] Toggling event status for event_id: ${event_id} to: ${event_finished}`)

    // Update all match_results for this event_id
    const { data, error } = await supabase
      .from('match_results')
      .update({ event_finished: event_finished })
      .eq('event_id', event_id)
      .select('id')

    if (error) {
      console.error('[ADMIN] Error updating event status:', error)
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to update event status' 
      })
    }

    console.log(`[ADMIN] Successfully updated ${data?.length || 0} match results`)

    // Get current status for confirmation
    const { data: statusCheck, error: statusError } = await supabase
      .from('match_results')
      .select('event_finished')
      .eq('event_id', event_id)
      .limit(1)
      .single()

    return res.status(200).json({
      success: true,
      message: `Event ${event_id} status updated successfully`,
      event_id: event_id,
      event_finished: statusCheck?.event_finished || event_finished,
      updated_records: data?.length || 0
    })

  } catch (error) {
    console.error('[ADMIN] Unexpected error:', error)
    return res.status(500).json({ 
      success: false, 
      error: 'Unexpected error occurred' 
    })
  }
}
