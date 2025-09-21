import { createClient } from "@supabase/supabase-js"

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Only GET allowed" })
  }

  try {
    console.log('[ADMIN] Fetching event status information')

    // Get all unique event_ids and their status
    const { data: events, error } = await supabase
      .from('match_results')
      .select('event_id, event_finished')
      .order('event_id')

    if (error) {
      console.error('[ADMIN] Error fetching event status:', error)
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch event status' 
      })
    }

    // Group by event_id and get unique status for each
    const eventStatusMap = {}
    events?.forEach(event => {
      if (!eventStatusMap[event.event_id]) {
        eventStatusMap[event.event_id] = {
          event_id: event.event_id,
          event_finished: event.event_finished,
          match_count: 0
        }
      }
      eventStatusMap[event.event_id].match_count++
    })

    const eventStatuses = Object.values(eventStatusMap)

    // Also get participant counts for each event
    const { data: participantCounts, error: participantError } = await supabase
      .from('participants')
      .select('event_id')
      .order('event_id')

    if (!participantError && participantCounts) {
      const participantCountMap = {}
      participantCounts.forEach(p => {
        const eventId = p.event_id || 1
        participantCountMap[eventId] = (participantCountMap[eventId] || 0) + 1
      })

      // Add participant counts to event statuses
      eventStatuses.forEach(event => {
        event.participant_count = participantCountMap[event.event_id] || 0
      })
    }

    console.log(`[ADMIN] Found ${eventStatuses.length} events`)

    return res.status(200).json({
      success: true,
      events: eventStatuses
    })

  } catch (error) {
    console.error('[ADMIN] Unexpected error:', error)
    return res.status(500).json({ 
      success: false, 
      error: 'Unexpected error occurred' 
    })
  }
}
