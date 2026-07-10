import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

// In-memory cache for e3 token resolution (5 min TTL) to reduce Supabase API load
const _e3TokenCache = new Map() // token -> { participant, expiresAt }
const E3_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Add better error logging
const logError = (context, error) => {
  console.error(`❌ ${context}:`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    stack: error.stack
  })
}

// Initialize Supabase client with error handling
let supabase
try {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  supabase = createClient(supabaseUrl, supabaseKey)
  console.log('✅ Supabase client initialized successfully')
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error)
  throw error
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  if (!req.body?.action) return res.status(400).json({ error: 'Missing action' })

  const { action } = req.body

  // TOKEN HANDLER ACTIONS
  if (action === "create-token") {
    // Check if registration is enabled
    try {
      const { data: eventState, error: eventError } = await supabase
        .from("event_state")
        .select("registration_enabled")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .single()

      // If registration is disabled, return error
      if (eventState && eventState.registration_enabled === false) {
        return res.status(403).json({ 
          error: "Registration is currently closed",
          message: "التسجيل مغلق حالياً - التوافق بدأ بالفعل"
        })
      }

      // If no event_state record exists, allow registration (default behavior)
      if (eventError && eventError.code !== 'PGRST116') {
        console.error("Error checking registration status:", eventError)
        // Continue with registration if we can't check status
      }
    } catch (err) {
      console.error("Error checking registration enabled:", err)
      // Continue with registration if we can't check status
    }

    // Auto-assign the next available number
    try {
      // Get the highest assigned number
      const { data: existingParticipants, error: fetchError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .neq("assigned_number", 9999)  // Exclude organizer participant
        .order("assigned_number", { ascending: false })
        .limit(1)

      if (fetchError) {
        console.error("Fetch Error:", fetchError)
        return res.status(500).json({ error: "Database fetch failed" })
      }

      // Calculate next number (start from 1 if no participants exist)
      let nextNumber = existingParticipants && existingParticipants.length > 0 
        ? existingParticipants[0].assigned_number + 1 
        : 1
      
      // Skip 9999 as it's reserved for organizer
      if (nextNumber === 9999) {
        nextNumber = 10000;
      }

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

      // Get current event ID for new participants
      let currentEventId = 1 // Default to event 1
      try {
        const { data: eventState, error: eventError } = await supabase
          .from("event_state")
          .select("current_event_id")
          .eq("match_id", "00000000-0000-0000-0000-000000000000")
          .single()

        if (!eventError && eventState?.current_event_id) {
          currentEventId = eventState.current_event_id
        } else {
          // If no current event ID is set, determine it based on existing participants
          const { data: maxEventData, error: maxEventError } = await supabase
            .from("participants")
            .select("event_id")
            .order("event_id", { ascending: false })
            .limit(1)
            .single()

          if (!maxEventError && maxEventData?.event_id) {
            currentEventId = maxEventData.event_id
          }
        }
      } catch (err) {
        console.log("Using default event_id = 1 due to error:", err.message)
      }

      console.log(`Creating new participant with event_id: ${currentEventId}`)

      // Create new participant with auto-assigned number and current event_id
      const { data, error } = await supabase
        .from("participants")
        .insert([
          {
            assigned_number: nextNumber,
            match_id: "00000000-0000-0000-0000-000000000000",
            event_id: currentEventId,
          },
        ])
        .select("secure_token, assigned_number, event_id")
        .single()

      if (error) {
        console.error("Create Token Error:", error)
        return res.status(500).json({ error: "Database insert failed" })
      }

      return res.status(200).json({ 
        secure_token: data.secure_token,
        assigned_number: data.assigned_number,
        event_id: data.event_id,
        is_new: true
      })
    } catch (error) {
      console.error("Unexpected error:", error)
      return res.status(500).json({ error: "Unexpected error occurred" })
    }
  }

  // GROUP PHONE LOGIN: semi-login for groups by phone number
  if (action === "group-phone-login") {
    try {
      const { phone_number } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      if (!phone_number || typeof phone_number !== 'string') {
        return res.status(400).json({ success: false, error: "Missing or invalid phone_number" })
      }

      // Normalize: use last 7 digits (for higher uniqueness)
      const normalized = phone_number.replace(/\D/g, '')
      if (normalized.length < 7) {
        return res.status(400).json({ success: false, error: "رقم الهاتف يجب أن يحتوي على 7 أرقام على الأقل" })
      }
      const lastSeven = normalized.slice(-7)

      // Determine current event id
      let currentEventId = 1
      try {
        const { data: eventRow, error: eventErr } = await supabase
          .from("event_state")
          .select("current_event_id")
          .eq("match_id", match_id)
          .single()

        if (!eventErr && eventRow?.current_event_id) {
          currentEventId = eventRow.current_event_id
        } else if (eventErr && eventErr.code === 'PGRST116') {
          // Fallback: use maximum event_id from participants, match_results, or group_matches
          const [maxP, maxM, maxG] = await Promise.all([
            supabase.from("participants").select("event_id").order("event_id", { ascending: false }).limit(1).single(),
            supabase.from("match_results").select("event_id").order("event_id", { ascending: false }).limit(1).single(),
            supabase.from("group_matches").select("event_id").order("event_id", { ascending: false }).limit(1).single(),
          ])
          let maxId = 1
          if (!maxP.error && maxP.data?.event_id) maxId = Math.max(maxId, maxP.data.event_id)
          if (!maxM.error && maxM.data?.event_id) maxId = Math.max(maxId, maxM.data.event_id)
          if (!maxG.error && maxG.data?.event_id) maxId = Math.max(maxId, maxG.data.event_id)
          currentEventId = maxId
        }
      } catch (e) {
        // keep default 1
      }

      // Special-case admin bypass: participant #7 (phone 0560899666) always allowed into groups with a fake group
      try {
        const isAdminByPhone = normalized === '0560899666' || lastSeven === '0899666'
        if (isAdminByPhone) {
          // Try to fetch existing participant #7 for token/name; otherwise use sensible defaults
          let adminRow = null
          try {
            const { data: row, error: rowErr } = await supabase
              .from("participants")
              .select("assigned_number, secure_token, name")
              .eq("match_id", match_id)
              .eq("assigned_number", 7)
              .order("created_at", { ascending: false })
              .limit(1)
              .single()
            if (!rowErr && row) adminRow = row
          } catch (_) {}

          const adminName = adminRow?.name || 'أدمن'
          const adminToken = adminRow?.secure_token || null

          // Build a randomized fake group (3–6 participants including admin #7)
          const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
          const groupSize = randInt(3, 6)
          const candidatePool = []
          // Create pool of candidate numbers (avoid 7 and 9999)
          for (let n = 50; n <= 250; n++) {
            if (n !== 7 && n !== 9999) candidatePool.push(n)
          }
          // Shuffle and pick (groupSize - 1) others
          for (let i = candidatePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const tmp = candidatePool[i]
            candidatePool[i] = candidatePool[j]
            candidatePool[j] = tmp
          }
          const others = candidatePool.slice(0, Math.max(0, groupSize - 1))
          const participant_numbers = [7, ...others]
          const participant_names = participant_numbers.map((num, idx) => idx === 0 ? (adminName || `أدمن #7`) : `عضو #${num}`)
          const group_members = participant_names
          const table_number = randInt(1, 30)
          const group_number = randInt(1, 50)

          return res.status(200).json({
            success: true,
            admin_bypass: true,
            event_id: currentEventId,
            assigned_number: 7,
            secure_token: adminToken,
            name: adminName,
            table_number,
            group_number,
            group_members,
            participant_numbers,
            participant_names
          })
        }
      } catch (_) {}

      // Find participant(s) by phone last 7 digits (across all events for this match)
      const { data: candidates, error: searchErr } = await supabase
        .from("participants")
        .select("id, assigned_number, secure_token, name, survey_data, phone_number, event_id, created_at")
        .eq("match_id", match_id)
        .not("phone_number", "is", null)
        .ilike("phone_number", `%${lastSeven}`)
        .order("created_at", { ascending: false })

      if (searchErr) {
        logError("group-phone-login: participant search error", searchErr)
        return res.status(500).json({ success: false, error: "فشل البحث عن المشارك" })
      }

      if (!candidates || candidates.length === 0) {
        return res.status(404).json({ success: false, error: "لم يتم العثور على مشارك برقم الهاتف هذا" })
      }

      // If multiple candidates share the same ending, try to pick one that has a group assignment
      // Sort by created_at desc as secondary heuristic
      const sorted = [...candidates].sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0
        return bt - at
      })

      let chosen = null
      let groupInfo = null

      // Helper to resolve group info from group_matches first, then match_results round 0
      const resolveGroupInfo = async (assignedNumber) => {
        // Try group_matches
        const { data: groups, error: groupErr } = await supabase
          .from("group_matches")
          .select("group_id, group_number, table_number, participant_numbers, participant_names")
          .eq("match_id", match_id)
          .eq("event_id", currentEventId)

        if (!groupErr && groups && groups.length > 0) {
          const found = groups.find(g => {
            const nums = Array.isArray(g.participant_numbers) ? g.participant_numbers : []
            const parsed = nums.map(n => (typeof n === 'string' ? parseInt(n, 10) : n))
            return parsed.includes(assignedNumber)
          })
          if (found) {
            // Build members: prefer provided names, fallback to numbered labels
            const nums = Array.isArray(found.participant_numbers) ? found.participant_numbers : []
            const names = Array.isArray(found.participant_names) ? found.participant_names : []
            const members = nums.map((n, idx) => {
              const num = typeof n === 'string' ? parseInt(n, 10) : n
              const baseName = names[idx] || `المشارك #${num}`
              return baseName
            })
            return {
              table_number: found.table_number ?? null,
              group_number: found.group_number ?? null,
              participant_numbers: nums,
              participant_names: names,
              group_members: members,
              source: 'group_matches'
            }
          }
        }

        // Fallback: match_results round 0
        const { data: groupRound, error: roundErr } = await supabase
          .from("match_results")
          .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number, table_number, group_number")
          .eq("match_id", match_id)
          .eq("event_id", currentEventId)
          .eq("round", 0)
          .or(`participant_a_number.eq.${assignedNumber},participant_b_number.eq.${assignedNumber},participant_c_number.eq.${assignedNumber},participant_d_number.eq.${assignedNumber},participant_e_number.eq.${assignedNumber},participant_f_number.eq.${assignedNumber}`)
          .limit(1)
          .single()

        if (!roundErr && groupRound) {
          const nums = [
            groupRound.participant_a_number,
            groupRound.participant_b_number,
            groupRound.participant_c_number,
            groupRound.participant_d_number,
            groupRound.participant_e_number,
            groupRound.participant_f_number
          ].filter(n => !!n && n !== 9999)

          // Fetch names for these numbers
          let names = []
          try {
            const { data: rows } = await supabase
              .from("participants")
              .select("assigned_number, name, survey_data")
              .eq("match_id", match_id)
              .eq("event_id", currentEventId)
              .in("assigned_number", nums)
            names = (rows || []).map(r => ({ num: r.assigned_number, name: r.name || r?.survey_data?.name || `المشارك #${r.assigned_number}` }))
          } catch (_) {}
          const memberNames = nums.map(num => names.find(n => n.num === num)?.name || `المشارك #${num}`)
          return {
            table_number: groupRound.table_number ?? null,
            group_number: groupRound.group_number ?? null,
            participant_numbers: nums,
            participant_names: memberNames,
            group_members: memberNames,
            source: 'match_results'
          }
        }

        return null
      }

      for (const cand of sorted) {
        const info = await resolveGroupInfo(cand.assigned_number)
        if (info) {
          chosen = cand
          groupInfo = info
          break
        }
      }

      // If none of the candidates have a group, allow login for participants
      // explicitly excluded from group generation (admin group-only exclusion, code -2)
      if (!chosen) {
        try {
          for (const cand of sorted) {
            const { data: ex, error: exErr } = await supabase
              .from("excluded_pairs")
              .select("id")
              .eq("match_id", match_id)
              .eq("participant1_number", cand.assigned_number)
              .eq("participant2_number", -2)
              .limit(1)

            if (!exErr && Array.isArray(ex) && ex.length > 0) {
              const name = cand.name || cand?.survey_data?.name || cand?.survey_data?.answers?.name || `المشارك #${cand.assigned_number}`
              // Return a success with admin_bypass to let the client proceed without a real group
              return res.status(200).json({
                success: true,
                admin_bypass: true,
                event_id: currentEventId,
                assigned_number: cand.assigned_number,
                secure_token: cand.secure_token,
                name,
                table_number: null,
                group_number: null,
                group_members: [],
                participant_numbers: [],
                participant_names: []
              })
            }
          }
        } catch (_) {}

        // Otherwise, fail as before
        return res.status(403).json({ success: false, error: "لم يتم العثور على مجموعة لك في الحدث الحالي" })
      }

      const name = chosen.name || chosen?.survey_data?.name || chosen?.survey_data?.answers?.name || `المشارك #${chosen.assigned_number}`

      return res.status(200).json({
        success: true,
        event_id: currentEventId,
        assigned_number: chosen.assigned_number,
        secure_token: chosen.secure_token,
        name,
        table_number: groupInfo?.table_number ?? null,
        group_number: groupInfo?.group_number ?? null,
        group_members: groupInfo?.group_members || [],
        participant_numbers: groupInfo?.participant_numbers || [],
        participant_names: groupInfo?.participant_names || []
      })

    } catch (error) {
      console.error("Error in group-phone-login:", error)
      return res.status(500).json({ success: false, error: "حدث خطأ أثناء تسجيل الدخول" })
    }
  }

  if (action === "resolve-token") {
    console.log("[API] Action: resolve-token started for token:", req.body.secure_token);
    if (!req.body.secure_token) {
      console.log("[API] Error: Missing secure_token");
      return res.status(400).json({ error: 'Missing secure_token' });
    }
    const { data, error } = await supabase
      .from("participants")
      .select("assigned_number, name, survey_data, summary, signup_for_next_event, auto_signup_next_event, humor_banter_style, early_openness_comfort, same_gender_preference, any_gender_preference, gender, phone_number, age, nationality, prefer_same_nationality, preferred_age_min, preferred_age_max, open_age_preference")
      .eq("secure_token", req.body.secure_token)
      .single();

    console.log("[API] Participant query result:", { data, error });

    if (error || !data) {
      console.log("[API] Error: Participant not found or DB error.");
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Compute gender preference from JSON or columns (normalize to: opposite_gender | same_gender | any_gender)
    let computedGenderPreference = "opposite_gender";
    try {
      const jsonPref = data?.survey_data?.answers?.gender_preference;
      const userGender = data?.gender || data?.survey_data?.answers?.gender || null;
      if (jsonPref === 'opposite_gender' || jsonPref === 'same_gender' || jsonPref === 'any_gender') {
        computedGenderPreference = jsonPref;
      } else if (jsonPref === 'any') {
        computedGenderPreference = 'any_gender';
      } else if (jsonPref === 'male' || jsonPref === 'female') {
        // Map raw choice to normalized using participant gender when available
        if (userGender && typeof userGender === 'string') {
          computedGenderPreference = (String(userGender).toLowerCase() === String(jsonPref).toLowerCase())
            ? 'same_gender'
            : 'opposite_gender';
        } else {
          computedGenderPreference = 'opposite_gender';
        }
      } else if (data?.any_gender_preference === true) {
        computedGenderPreference = 'any_gender';
      } else if (data?.same_gender_preference === true) {
        computedGenderPreference = 'same_gender';
      } else {
        computedGenderPreference = 'opposite_gender';
      }
    } catch (_) {}

    // Fetch participant history if they exist
    let history = []
    if (data.assigned_number) {
      console.log(`[API] Fetching history for participant #${data.assigned_number}`);
      try {
        const { data: matches, error: matchError } = await supabase
          .from("match_results")
          .select(`
            *,
            participant_a:participants!match_results_participant_a_id_fkey(name, age, phone_number),
            participant_b:participants!match_results_participant_b_id_fkey(name, age, phone_number)
          `)
          .eq("match_id", "00000000-0000-0000-0000-000000000000")
          .or(`participant_a_number.eq.${data.assigned_number},participant_b_number.eq.${data.assigned_number}`)
          .order("created_at", { ascending: false });

        console.log("[API] History query result:", { matches, matchError });

        if (!matchError && matches) {
          history = matches.map(match => {
            // Determine which participant is the partner
            const isParticipantA = match.participant_a_number === data.assigned_number
            const partnerNumber = isParticipantA ? match.participant_b_number : match.participant_a_number
            const partnerInfo = isParticipantA ? match.participant_b : match.participant_a
            const wantsMatch = isParticipantA ? match.participant_a_wants_match : match.participant_b_wants_match
            const partnerWantsMatch = isParticipantA ? match.participant_b_wants_match : match.participant_a_wants_match
            
            return {
              with: partnerNumber,
              partner_name: partnerInfo?.name || `لاعب رقم ${partnerNumber}`,
              partner_age: partnerInfo?.age || null,
              partner_phone: partnerInfo?.phone_number || null,
              type: match.match_type || "غير محدد",
              reason: match.reason || "السبب غير متوفر",
              round: match.round || 1,
              table_number: match.table_number,
              score: match.compatibility_score || 0,
              is_repeat_match: match.is_repeat_match || false,
              mutual_match: match.mutual_match || false,
              wants_match: wantsMatch,
              partner_wants_match: partnerWantsMatch,
              created_at: match.created_at
            }
          })
        }
      } catch (historyError) {
        console.error("[API] CRITICAL: Error fetching participant history:", historyError)
        // Don't fail the request if history fetch fails
      }
    }

    console.log("[API] Successfully resolved token. Sending response.");
    return res.status(200).json({
      success: true,
      assigned_number: data.assigned_number,
      name: data.name,
      survey_data: data.survey_data,
      summary: data.summary,
      signup_for_next_event: data.signup_for_next_event,
      auto_signup_next_event: data.auto_signup_next_event,
      humor_banter_style: data.humor_banter_style,
      early_openness_comfort: data.early_openness_comfort,
      gender_preference: computedGenderPreference,
      // Extra fields to help client-side completeness checks with fallbacks
      gender: data.gender || null,
      phone_number: data.phone_number || null,
      age: data.age || null,
      nationality: data.nationality || null,
      prefer_same_nationality: typeof data.prefer_same_nationality === 'boolean' ? data.prefer_same_nationality : null,
      preferred_age_min: data.preferred_age_min ?? null,
      preferred_age_max: data.preferred_age_max ?? null,
      open_age_preference: typeof data.open_age_preference === 'boolean' ? data.open_age_preference : null,
      history: history
    })
  }

  // MATCH PREFERENCE ACTION
  if (action === "match-preference") {
    try {
      const { assigned_number, partner_number, wants_match, round = 1, event_id } = req.body
      const match_id = "00000000-0000-0000-0000-000000000000"

      if (!assigned_number || !partner_number) {
        return res.status(400).json({ error: "Missing assigned_number or partner_number" })
      }

      if (typeof wants_match !== 'boolean') {
        return res.status(400).json({ error: "wants_match must be a boolean" })
      }

      // Find the match result for this pair
      const { data: matchResults, error: findError } = await supabase
        .from("match_results")
        .select("*")
        .eq("match_id", match_id)
        .eq("event_id", event_id || 1)
        .eq("round", round)
        .or(`and(participant_a_number.eq.${assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${assigned_number})`)

      if (findError) {
        console.error("Error finding match result:", findError)
        return res.status(500).json({ error: "Failed to find match result" })
      }

      if (!matchResults || matchResults.length === 0) {
        return res.status(404).json({ error: "Match result not found" })
      }

      const matchResult = matchResults[0]
      
      // Determine which participant is making the preference
      const isParticipantA = matchResult.participant_a_number === assigned_number
      const updateField = isParticipantA ? 'participant_a_wants_match' : 'participant_b_wants_match'
      const partnerField = isParticipantA ? 'participant_b_wants_match' : 'participant_a_wants_match'
      
      // Update the match preference
      const updateData = {
        [updateField]: wants_match
      }
      
      // Check if both participants want to match to set mutual_match
      const partnerWantsMatch = matchResult[partnerField]
      if (partnerWantsMatch !== null) {
        updateData.mutual_match = wants_match && partnerWantsMatch
      }

      const { error: updateError } = await supabase
        .from("match_results")
        .update(updateData)
        .eq("id", matchResult.id)

      if (updateError) {
        console.error("Error updating match preference:", updateError)
        return res.status(500).json({ error: "Failed to update match preference" })
      }

      // If both participants want to match, fetch partner information
      let partnerInfo = null
      if (updateData.mutual_match) {
        const { data: partnerData, error: partnerError } = await supabase
          .from("participants")
          .select("name, age, phone_number")
          .eq("assigned_number", partner_number)
          .eq("match_id", match_id)
          .eq("event_id", event_id || 1)
          .single()

        if (!partnerError && partnerData) {
          partnerInfo = {
            name: partnerData.name,
            age: partnerData.age,
            phone_number: partnerData.phone_number
          }
        }
      }

      return res.status(200).json({
        success: true,
        mutual_match: updateData.mutual_match || false,
        partner_info: partnerInfo
      })

    } catch (error) {
      console.error("Unexpected error in match-preference:", error)
      return res.status(500).json({ error: "Unexpected error occurred" })
    }
  }

  // SAVE PARTICIPANT ACTION
  if (action === "save-participant") {
    try {
      console.log('📨 Received save-participant request:', {
        method: req.method,
        body: req.body,
        headers: req.headers
      })

      const { assigned_number, summary, survey_data, feedback, round, secure_token, event_id } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      if (!req.body?.assigned_number) {
        console.error('❌ Missing assigned_number in request body')
        return res.status(400).json({ error: 'Missing assigned_number' })
      }
      
      // Check for either survey data, summary, or feedback
      if (!survey_data && !summary && !feedback) {
        console.error('❌ Missing required data: survey_data, summary, or feedback')
        return res.status(400).json({ error: 'Missing survey data, summary, or feedback' })
      }

      // Handle feedback saving
      if (feedback && round) {
        console.log('📝 Processing feedback for round:', round, 'event_id:', event_id)
        
        const {
          compatibilityRate,
          conversationQuality,
          personalConnection,
          sharedInterests,
          comfortLevel,
          communicationStyle,
          wouldMeetAgain,
          overallExperience,
          recommendations,
          organizerImpression,
          participantMessage
        } = feedback

        // Check if feedback already exists for this participant, round, and event
        const { data: existingFeedback, error: existingFeedbackError } = await supabase
          .from("match_feedback")
          .select("id")
          .eq("match_id", match_id)
          .eq("participant_number", assigned_number)
          .eq("round", round)
          .eq("event_id", event_id || 1)

        if (existingFeedbackError) {
          logError("Error checking existing feedback", existingFeedbackError)
          throw new Error("Database query failed")
        }

        const feedbackData = {
          match_id,
          participant_number: assigned_number,
          participant_token: secure_token || null,
          round,
          event_id: event_id || 1,
          compatibility_rate: compatibilityRate,
          conversation_quality: conversationQuality,
          personal_connection: personalConnection,
          shared_interests: sharedInterests,
          comfort_level: comfortLevel,
          communication_style: communicationStyle,
          would_meet_again: wouldMeetAgain,
          overall_experience: overallExperience,
          recommendations: recommendations || null,
          organizer_impression: organizerImpression || null,
          participant_message: participantMessage || null,
          submitted_at: new Date().toISOString()
        }

        if (existingFeedback && existingFeedback.length > 0) {
          // Update existing feedback
          const { error: updateFeedbackError } = await supabase
            .from("match_feedback")
            .update(feedbackData)
            .eq("match_id", match_id)
            .eq("participant_number", assigned_number)
            .eq("round", round)
            .eq("event_id", event_id || 1)

          if (updateFeedbackError) {
            logError("Error updating feedback", updateFeedbackError)
            throw new Error("Failed to update feedback")
          }
        } else {
          // Insert new feedback
          const { error: insertFeedbackError } = await supabase
            .from("match_feedback")
            .insert([feedbackData])

          if (insertFeedbackError) {
            logError("Error inserting feedback", insertFeedbackError)
            throw new Error("Failed to save feedback")
          }
        }

        console.log('✅ Feedback saved successfully')
        return res.status(200).json({ 
          success: true, 
          message: "Feedback saved successfully" 
        })
      }

      console.log('📝 Processing participant data for assigned_number:', assigned_number)

      const phoneNumber = survey_data?.phoneNumber || survey_data?.answers?.phone_number

      // Security check: If phone number is provided, ensure it's not already taken by another user
      /* --- PHONE CHECK TEMPORARILY DISABLED ---
      if (phoneNumber) {
        const { data: phoneOwner, error: phoneOwnerError } = await supabase
          .from("participants")
          .select("id, secure_token, assigned_number")
          .eq("phone_number", phoneNumber)
          .eq("match_id", match_id)
          .limit(1)

        if (phoneOwnerError) {
          logError("Error checking phone owner", phoneOwnerError)
          throw phoneOwnerError
        }

        if (phoneOwner && phoneOwner.length > 0) {
          const owner = phoneOwner[0]
          // If the phone number belongs to someone else (identified by a different token), block the request.
          if (owner.secure_token !== secure_token) {
            return res.status(409).json({ 
              error: "Phone number already registered.",
              message: "رقم الهاتف مسجل بالفعل. يرجى استخدام الرابط الأصلي الخاص بك لتعديل بياناتك."
            })
          }
        }
      }
      */

      // Find the participant to update using their secure_token as the primary identifier
      const { data: existing, error: existingError } = await supabase
        .from("participants")
        .select("id, assigned_number, survey_data")
        .eq("match_id", match_id)
        .eq("secure_token", secure_token)

      if (existingError) {
        logError("Error checking existing participant", existingError)
        throw existingError
      }

      const updateFields = {}

      // Handle survey data (only if present)
      if (survey_data) {
        console.log('📊 Processing survey data:', survey_data)
        
        const answers = req.body.survey_data?.answers || {};
        const redLinesRaw = answers.redLines;
        const redLines = Array.isArray(redLinesRaw)
          ? redLinesRaw
          : typeof redLinesRaw === "string"
            ? redLinesRaw.split(",").map(s => s.trim()).filter(Boolean)
            : [];
        
        // Prepare survey_data JSONB object according to schema
        updateFields.survey_data = {
          ...survey_data,
          answers: {
            ...answers,
            redLines,
          },
        }

        // Persist personal info to dedicated columns (extracted from answers)
        if (typeof survey_data.name === 'string' && survey_data.name.trim()) {
          updateFields.name = survey_data.name.trim()
        } else if (typeof answers.name === 'string' && answers.name.trim()) {
          updateFields.name = answers.name.trim()
        }
        
        // Handle age from answers (comes as string from form)
        const ageValue = survey_data.age || answers.age
        if (ageValue) {
          const ageNum = typeof ageValue === 'number' ? ageValue : parseInt(ageValue)
          if (!isNaN(ageNum) && ageNum >= 18 && ageNum <= 65) {
            updateFields.age = ageNum
            console.log('🎂 Age:', ageNum)
          }
        }
        
        if (typeof survey_data.gender === 'string' && survey_data.gender.trim()) {
          updateFields.gender = survey_data.gender.trim()
        } else if (typeof answers.gender === 'string' && answers.gender.trim()) {
          updateFields.gender = answers.gender.trim()
        }
        
        if (typeof survey_data.phoneNumber === 'string' && survey_data.phoneNumber.trim()) {
          updateFields.phone_number = survey_data.phoneNumber.trim()
        } else if (typeof answers.phone_number === 'string' && answers.phone_number.trim()) {
          updateFields.phone_number = answers.phone_number.trim()
        }

        // Nationality (text) and nationality preference (boolean: prefers same nationality)
        if (typeof answers.nationality === 'string' && answers.nationality.trim()) {
          updateFields.nationality = answers.nationality.trim()
          console.log('🌍 Nationality:', updateFields.nationality)
        }
        if (typeof answers.nationality_preference === 'string') {
          if (answers.nationality_preference === 'same') {
            updateFields.prefer_same_nationality = true
          } else if (answers.nationality_preference === 'any') {
            updateFields.prefer_same_nationality = false
          }
          console.log('🤝 Nationality Preference (prefer_same_nationality):', updateFields.prefer_same_nationality)
        }

        // Preferred age range (min/max integers)
        const minPrefRaw = answers.preferred_age_min
        const maxPrefRaw = answers.preferred_age_max
        const minPref = typeof minPrefRaw === 'string' ? parseInt(minPrefRaw) : (typeof minPrefRaw === 'number' ? minPrefRaw : null)
        const maxPref = typeof maxPrefRaw === 'string' ? parseInt(maxPrefRaw) : (typeof maxPrefRaw === 'number' ? maxPrefRaw : null)
        // Open age preference (optional)
        if (answers.open_age_preference !== undefined) {
          const openAge = answers.open_age_preference === true || answers.open_age_preference === 'true'
          updateFields.open_age_preference = openAge
          console.log('🟢 Open Age Preference:', openAge)
          if (openAge) {
            // Clear stored range if user opted for open age
            updateFields.preferred_age_min = null
            updateFields.preferred_age_max = null
          }
        }

        if (!isNaN(minPref) && !isNaN(maxPref)) {
          // Basic guard rails; DB will enforce too
          if (minPref >= 16 && maxPref <= 80 && minPref <= maxPref) {
            // Only persist range if NOT explicitly open age
            if (!(updateFields.open_age_preference === true)) {
              updateFields.preferred_age_min = minPref
              updateFields.preferred_age_max = maxPref
              console.log('📏 Preferred Age Range:', minPref, '-', maxPref)
            } else {
              console.log('ℹ️ Skipping saving age range because open_age_preference is true')
            }
          }
        }
        
        // Save MBTI personality type to dedicated column (4 characters max)
        if (survey_data.mbtiType && survey_data.mbtiType.length === 4) {
          updateFields.mbti_personality_type = survey_data.mbtiType
          console.log('🧠 MBTI Type:', survey_data.mbtiType)
        }
        
        // Save attachment style to dedicated column (must match constraint values)
        if (survey_data.attachmentStyle) {
          const validAttachmentStyles = ['Secure', 'Anxious', 'Avoidant', 'Fearful']
          if (validAttachmentStyles.includes(survey_data.attachmentStyle) || 
              survey_data.attachmentStyle.startsWith('Mixed (')) {
            updateFields.attachment_style = survey_data.attachmentStyle
            console.log('🔒 Attachment Style:', survey_data.attachmentStyle)
          }
        }
        
        // Save communication style to dedicated column (must match constraint values)
        if (survey_data.communicationStyle) {
          const validCommunicationStyles = ['Assertive', 'Passive', 'Aggressive', 'Passive-Aggressive']
          if (validCommunicationStyles.includes(survey_data.communicationStyle)) {
            updateFields.communication_style = survey_data.communicationStyle
            console.log('💬 Communication Style:', survey_data.communicationStyle)
          }
        }
        
        // Handle gender preferences from new structure
        const genderPref = answers.actual_gender_preference || answers.gender_preference || answers.same_gender_preference
        let normalizedGenderPrefStr = 'opposite_gender'
        if (Array.isArray(genderPref)) {
          // Old checkbox structure: check for specific values
          updateFields.same_gender_preference = genderPref.includes('same_gender') || genderPref.includes('yes')
          updateFields.any_gender_preference = genderPref.includes('any_gender')
          console.log('👥 Same Gender Preference (old):', updateFields.same_gender_preference)
          console.log('🌐 Any Gender Preference (old):', updateFields.any_gender_preference)
          normalizedGenderPrefStr = updateFields.any_gender_preference ? 'any_gender' : (updateFields.same_gender_preference ? 'same_gender' : 'opposite_gender')
        } else if (typeof genderPref === 'string') {
          // Support both raw UI values (male|female|any) and normalized values
          if (genderPref === 'same_gender' || genderPref === 'any_gender' || genderPref === 'opposite_gender') {
            normalizedGenderPrefStr = genderPref
          } else if (genderPref === 'any') {
            normalizedGenderPrefStr = 'any_gender'
          } else if (genderPref === 'male' || genderPref === 'female') {
            const userGenderForPref = answers.gender || survey_data.gender
            normalizedGenderPrefStr = (userGenderForPref && String(userGenderForPref).toLowerCase() === genderPref)
              ? 'same_gender'
              : 'opposite_gender'
          } else {
            normalizedGenderPrefStr = 'opposite_gender'
          }

          if (normalizedGenderPrefStr === 'same_gender') {
            updateFields.same_gender_preference = true
            updateFields.any_gender_preference = false
            console.log('👥 Gender Preference: same gender only')
          } else if (normalizedGenderPrefStr === 'any_gender') {
            updateFields.same_gender_preference = false
            updateFields.any_gender_preference = true
            console.log('🌐 Gender Preference: any gender')
          } else {
            // opposite_gender or default
            updateFields.same_gender_preference = false
            updateFields.any_gender_preference = false
            console.log('👫 Gender Preference: opposite gender')
          }
        } else {
          // Default to false if not provided (opposite gender matching)
          updateFields.same_gender_preference = false
          updateFields.any_gender_preference = false
          normalizedGenderPrefStr = 'opposite_gender'
          console.log('👥 Gender Preferences (default): opposite gender matching')
        }

        // Persist normalized value back into survey_data JSONB for consistency
        try {
          if (updateFields.survey_data && updateFields.survey_data.answers) {
            updateFields.survey_data.answers.gender_preference = normalizedGenderPrefStr
            // Keep actual_gender_preference in sync as well
            updateFields.survey_data.answers.actual_gender_preference = normalizedGenderPrefStr
          }
        } catch (e) {
          console.warn('⚠️ Could not persist normalized gender_preference into survey_data:', e?.message)
        }
        
        // Save interaction style preferences to dedicated columns
        const humorBanterStyle = answers.humor_banter_style
        if (humorBanterStyle && ['A', 'B', 'C', 'D'].includes(humorBanterStyle)) {
          updateFields.humor_banter_style = humorBanterStyle
          console.log('😄 Humor/Banter Style:', humorBanterStyle)
        }
        
        const earlyOpennessComfort = answers.early_openness_comfort
        if (earlyOpennessComfort !== undefined) {
          const comfortLevel = parseInt(earlyOpennessComfort)
          if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
            updateFields.early_openness_comfort = comfortLevel
            console.log('🤝 Early Openness Comfort:', comfortLevel)
          }
        }
        
        // NEW: Persist additional interaction & goal fields to dedicated columns
        const intentGoal = answers.intent_goal
        if (typeof intentGoal === 'string' && ['A','B','C'].includes(intentGoal)) {
          updateFields.intent_goal = intentGoal
          console.log('🎯 Intent Goal:', intentGoal)
        }

        // Persist openness to different goal (checkbox)
        const openIntentMismatchRaw = answers.open_intent_goal_mismatch
        if (openIntentMismatchRaw !== undefined) {
          const openIntentMismatch = (openIntentMismatchRaw === true || String(openIntentMismatchRaw).toLowerCase() === 'true')
          updateFields.open_intent_goal_mismatch = openIntentMismatch
          console.log('✅ Open to different goal:', openIntentMismatch)
        }

        const conversationalRole = answers.conversational_role
        if (typeof conversationalRole === 'string' && ['A','B','C'].includes(conversationalRole)) {
          updateFields.conversational_role = conversationalRole
          console.log('🗣️ Conversational Role:', conversationalRole)
        }

        const conversationDepth = answers.conversation_depth_pref
        if (typeof conversationDepth === 'string' && ['A','B'].includes(conversationDepth)) {
          updateFields.conversation_depth_pref = conversationDepth
          console.log('📚 Conversation Depth Pref:', conversationDepth)
        }

        const socialBattery = answers.social_battery
        if (typeof socialBattery === 'string' && ['A','B'].includes(socialBattery)) {
          updateFields.social_battery = socialBattery
          console.log('🔋 Social Battery:', socialBattery)
        }

        const curiosityStyle = answers.curiosity_style
        if (typeof curiosityStyle === 'string' && ['A','B','C'].includes(curiosityStyle)) {
          updateFields.curiosity_style = curiosityStyle
          console.log('🧩 Curiosity Style:', curiosityStyle)
        }

        const silenceComfort = answers.silence_comfort
        if (typeof silenceComfort === 'string' && ['A','B'].includes(silenceComfort)) {
          updateFields.silence_comfort = silenceComfort
          console.log('🤫 Silence Comfort:', silenceComfort)
        }

        const humorSubtype = answers.humor_subtype
        if (typeof humorSubtype === 'string' && ['A','B','C','D'].includes(humorSubtype)) {
          updateFields.humor_subtype = humorSubtype
          console.log('✨ Humor Subtype:', humorSubtype)
        }

        // Note: lifestyle_preferences, core_values, vibe_description, ideal_person_description
        // are not separate columns in the schema - they should be stored in survey_data JSONB
      }

      // Allow saving summary alone or with form data
      if (summary) {
        updateFields.summary = summary
        console.log('📝 Summary:', summary)
      }

      if (Object.keys(updateFields).length === 0) {
        console.error('❌ No valid fields to save')
        return res.status(400).json({ error: "No valid fields to save" })
      }

      console.log('💾 Saving fields:', updateFields)

      if (existing && existing.length > 0) {
        // ✅ Update existing participant identified by their secure_token
        console.log('🔄 Updating existing participant')
        const { error: updateError } = await supabase
          .from("participants")
          .update(updateFields)
          .eq("match_id", match_id)
          .eq("secure_token", secure_token)

        if (updateError) {
          logError("Update error", updateError)
          throw updateError
        }
      } else {
        // 🔎 Fallback: check by assigned_number ONLY (match_id is same for everyone per app design)
        const { data: existingByNumber, error: numberCheckErr } = await supabase
          .from("participants")
          .select("id, secure_token, survey_data")
          .eq("assigned_number", assigned_number)
          .limit(1)

        if (numberCheckErr) {
          logError("Error checking existing by assigned_number", numberCheckErr)
          throw numberCheckErr
        }

        if (existingByNumber && existingByNumber.length > 0) {
          const hadSurvey = !!existingByNumber[0]?.survey_data
          console.log(`🔄 Updating existing participant by assigned_number #${assigned_number} (previous survey_data=${hadSurvey ? 'yes' : 'no'})`)
          const { error: updateByNumberErr } = await supabase
            .from("participants")
            .update(updateFields)
            .eq("assigned_number", assigned_number)

          if (updateByNumberErr) {
            logError("Update error (by number)", updateByNumberErr)
            throw updateByNumberErr
          }
        } else {
          // ✅ Insert new when truly not existing
          console.log('➕ Inserting new participant (no existing by token or number)')
          const { error: insertError } = await supabase.from("participants").insert([
            {
              assigned_number,
              match_id,
              is_host: false,
              ...updateFields,
            },
          ])
          if (insertError) {
            logError("Insert error", insertError)
            throw insertError
          }
        }
      }

      // Log survey change history if participant re-submitted with changed answers
      try {
        const prevExisting = existing?.[0] || existingByNumber?.[0]
        const prevSurveyData = prevExisting?.survey_data
        const logNumber = prevExisting?.assigned_number || assigned_number
        if (prevSurveyData && updateFields.survey_data && logNumber) {
          const oldAnswers = prevSurveyData.answers || {}
          const newAnswers = updateFields.survey_data.answers || {}
          const allKeys = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])
          const changedFields = [...allKeys].filter(k => JSON.stringify(oldAnswers[k]) !== JSON.stringify(newAnswers[k]))
          if (changedFields.length > 0) {
            const changePercentage = Math.round((changedFields.length / allKeys.size) * 100)
            const suspiciousFlags = []
            if (changedFields.includes('gender') && oldAnswers.gender && newAnswers.gender && oldAnswers.gender !== newAnswers.gender)
              suspiciousFlags.push({ level: 'high', code: 'gender_change', message: `Gender changed: ${oldAnswers.gender} → ${newAnswers.gender}` })
            const oldAge = oldAnswers.age ?? oldAnswers.ageGroup
            const newAge = newAnswers.age ?? newAnswers.ageGroup
            if (oldAge != null && newAge != null) {
              const diff = Math.abs(parseInt(newAge) - parseInt(oldAge))
              if (!isNaN(diff) && diff > 2) suspiciousFlags.push({ level: 'medium', code: 'age_change', message: `Age changed by ${diff}: ${oldAge} → ${newAge}` })
            }
            if (changedFields.includes('mbtiType') && oldAnswers.mbtiType && newAnswers.mbtiType)
              suspiciousFlags.push({ level: 'medium', code: 'mbti_change', message: `MBTI changed: ${oldAnswers.mbtiType} → ${newAnswers.mbtiType}` })
            const prevFiltered = {}, newFiltered = {}
            changedFields.forEach(k => { prevFiltered[k] = oldAnswers[k]; newFiltered[k] = newAnswers[k] })
            await supabase.from('survey_change_history').insert({
              participant_number: logNumber, match_id,
              previous_answers: prevFiltered, new_answers: newFiltered,
              changed_fields: changedFields, change_percentage: changePercentage, suspicious_flags: suspiciousFlags
            })
            console.log(`📋 Logged survey change for participant #${logNumber}: ${changedFields.length} field(s) changed (${changePercentage}%)`)
          }
        }
      } catch (histErr) { console.error('Failed to log survey change history:', histErr) }

      console.log('✅ Participant data saved successfully')
      return res.status(200).json({ message: "Saved", match_id })
    } catch (err) {
      logError("Server Error", err)
      return res.status(500).json({ error: err.message || "Unexpected error" })
    }
  }

  // GET MATCH RESULTS BY TOKEN ACTION
  if (action === "get-match-results") {
    console.log("[API] Action: get-match-results started for token:", req.body.secure_token);
    if (!req.body.secure_token) {
      console.log("[API] Error: Missing secure_token");
      return res.status(400).json({ error: 'Missing secure_token' });
    }
    
    try {
      // First, resolve the token to get participant info including their match_id and event_id
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, match_id, event_id")
        .eq("secure_token", req.body.secure_token)
        .single();

      console.log("[API] Participant query result:", { participant, participantError });

      if (participantError || !participant) {
        console.log("[API] Error: Participant not found or DB error.");
        return res.status(404).json({ 
          success: false, 
          error: 'المشارك غير موجود أو الرمز غير صحيح' 
        });
      }

      // Fetch match results for this participant number across ALL events - only show results for finished events
      console.log(`[API] Fetching match results for participant #${participant.assigned_number} across all finished events`);
      const { data: matches, error: matchError } = await supabase
        .from("match_results")
        .select("*")
        .eq("match_id", participant.match_id)
        .eq("event_finished", true)
        .or(`participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${participant.assigned_number}`)
        .order("event_id", { ascending: false })
        .order("created_at", { ascending: false });

      console.log("[API] Match results query result:", { matches, matchError });

      if (matchError) {
        console.error("[API] Error fetching match results:", matchError);
        return res.status(500).json({ 
          success: false, 
          error: 'حدث خطأ أثناء جلب نتائج المطابقة' 
        });
      }

      // Filter out old match_results entries with event_id >= 20 — those are now handled by Event 3 code path
      const filteredMatches = (matches || []).filter(m => !(m.event_id && m.event_id >= 20));

      // Format the match results and fetch partner information
      const history = await Promise.all(filteredMatches.map(async (match) => {
        // Determine which participant is the partner
        const isParticipantA = match.participant_a_number === participant.assigned_number
        const partnerNumber = isParticipantA ? match.participant_b_number : match.participant_a_number
        const wantsMatch = isParticipantA ? match.participant_a_wants_match : match.participant_b_wants_match
        const partnerWantsMatch = isParticipantA ? match.participant_b_wants_match : match.participant_a_wants_match
        const effectiveRound = (match.round ?? 1)
        const effectiveEventId = (match.event_id ?? 1)
        
        // Fetch partner information from the same match_id
        let partnerInfo = null
        let partnerMessage = null
        let myFeedback = null
        if (partnerNumber && partnerNumber !== 9999) {
          try {
            const { data: partnerData, error: partnerError } = await supabase
              .from("participants")
              .select("name, age, phone_number, event_id")
              .eq("assigned_number", partnerNumber)
              .eq("match_id", match.match_id)  // Use the match's match_id to get partner from correct match
              .single()
            
            if (!partnerError && partnerData) {
              partnerInfo = partnerData
            }
          } catch (err) {
            console.log(`[API] Could not fetch partner info for #${partnerNumber}:`, err)
          }

          // Fetch partner's message from match_feedback
          try {
            const tryEventIds = [effectiveEventId, participant.event_id].filter(
              (v, i, arr) => typeof v === 'number' && v > 0 && arr.indexOf(v) === i
            )

            let msgRow = null
            for (const evId of tryEventIds) {
              const { data: fbRows, error: fbErr } = await supabase
                .from('match_feedback')
                .select('participant_message, submitted_at')
                .eq('match_id', match.match_id)
                .eq('participant_number', partnerNumber)
                .eq('round', effectiveRound)
                .eq('event_id', evId)
                .order('submitted_at', { ascending: false })
                .limit(1)

              if (!fbErr && Array.isArray(fbRows) && fbRows[0]) {
                msgRow = fbRows[0]
                break
              }
            }

            if (!msgRow) {
              const { data: fbRows, error: fbErr } = await supabase
                .from('match_feedback')
                .select('participant_message, submitted_at')
                .eq('match_id', match.match_id)
                .eq('participant_number', partnerNumber)
                .eq('round', effectiveRound)
                .order('submitted_at', { ascending: false })
                .limit(1)

              if (!fbErr && Array.isArray(fbRows) && fbRows[0]) {
                msgRow = fbRows[0]
              }
            }

            if (msgRow?.participant_message) partnerMessage = msgRow.participant_message
          } catch (err) {
            console.log(`[API] Could not fetch partner message for #${partnerNumber}:`, err)
          }
        }

        try {
          const columns = 'compatibility_rate, conversation_quality, personal_connection, shared_interests, comfort_level, communication_style, would_meet_again, overall_experience, recommendations, participant_message, submitted_at'
          const tryEventIds = [effectiveEventId, participant.event_id].filter(
            (v, i, arr) => typeof v === 'number' && v > 0 && arr.indexOf(v) === i
          )

          let myFbRow = null
          for (const evId of tryEventIds) {
            const { data: rows, error: e } = await supabase
              .from('match_feedback')
              .select(columns)
              .eq('match_id', match.match_id)
              .eq('participant_number', participant.assigned_number)
              .eq('round', effectiveRound)
              .eq('event_id', evId)
              .order('submitted_at', { ascending: false })
              .limit(1)

            if (!e && Array.isArray(rows) && rows[0]) {
              myFbRow = rows[0]
              break
            }
          }

          if (!myFbRow) {
            const { data: rows, error: e } = await supabase
              .from('match_feedback')
              .select(columns)
              .eq('match_id', match.match_id)
              .eq('participant_number', participant.assigned_number)
              .eq('round', effectiveRound)
              .order('submitted_at', { ascending: false })
              .limit(1)

            if (!e && Array.isArray(rows) && rows[0]) {
              myFbRow = rows[0]
            }
          }

          if (myFbRow) {
            myFeedback = {
              compatibilityRate: myFbRow.compatibility_rate ?? null,
              conversationQuality: myFbRow.conversation_quality ?? null,
              personalConnection: myFbRow.personal_connection ?? null,
              sharedInterests: myFbRow.shared_interests ?? null,
              comfortLevel: myFbRow.comfort_level ?? null,
              communicationStyle: myFbRow.communication_style ?? null,
              wouldMeetAgain: myFbRow.would_meet_again ?? null,
              overallExperience: myFbRow.overall_experience ?? null,
              recommendations: myFbRow.recommendations ?? null,
              participantMessage: myFbRow.participant_message ?? null,
              submittedAt: myFbRow.submitted_at ?? null
            }
          }
        } catch (err) {
          console.log(`[API] Could not fetch participant feedback for #${participant.assigned_number}:`, err)
        }
        
        // Calculate mutual match based on current wants_match values
        const isMutualMatch = wantsMatch === true && partnerWantsMatch === true
        
        console.log(`[API] Match with #${partnerNumber}: wantsMatch=${wantsMatch}, partnerWantsMatch=${partnerWantsMatch}, isMutualMatch=${isMutualMatch}`)
        
        return {
          with: partnerNumber === 9999 ? "المنظم" : partnerNumber,
          partner_name: partnerNumber === 9999 ? "المنظم" : (partnerInfo?.name || `لاعب رقم ${partnerNumber}`),
          partner_age: partnerInfo?.age || null,
          partner_phone: partnerInfo?.phone_number || null,
          partner_event_id: partnerInfo?.event_id || null,
          type: match.match_type || "غير محدد",
          reason: match.reason || "السبب غير متوفر",
          round: effectiveRound,
          table_number: match.table_number,
          score: match.compatibility_score || 0,
          is_repeat_match: match.is_repeat_match || false,
          mutual_match: isMutualMatch,
          wants_match: wantsMatch,
          partner_wants_match: partnerWantsMatch,
          created_at: match.created_at,
          ai_personality_analysis: match.ai_personality_analysis || null,
          event_id: effectiveEventId,
          partner_message: partnerMessage,
          my_feedback: myFeedback,
          humor_early_openness_bonus: match.humor_early_openness_bonus || 'none',
          // New model numeric fields (if available in DB)
          synergy_score: match.synergy_score ?? null,
          humor_open_score: match.humor_open_score ?? null,
          intent_score: match.intent_score ?? null,
          communication_compatibility_score: match.communication_compatibility_score ?? null,
          lifestyle_compatibility_score: match.lifestyle_compatibility_score ?? null,
          vibe_compatibility_score: match.vibe_compatibility_score ?? null
        }
      }));

      // ── Fetch Event 3 (4.0) matches if the event is finished ──
      try {
        const E3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
        const MAIN_MATCH = "00000000-0000-0000-0000-000000000000"
        const firstName = (n) => n ? n.trim().split(/\s+/)[0] : "—"

        // Check if event3 phase is final_reveal (event finished)
        const { data: e3State } = await supabase
          .from("event_state")
          .select("phase")
          .eq("match_id", E3_MATCH_ID)
          .single()

        const e3Finished = e3State?.phase === "final_reveal"

        if (e3Finished) {
          // Fetch the participant's event3 matches (including feedback)
          const { data: e3Match } = await supabase
            .from("event3_matches")
            .select("phase2_partner,phase2_score,phase2_word,phase2_feedback,phase3_partner,phase3_score,phase3_word,phase3_feedback,match_preference")
            .eq("match_id", E3_MATCH_ID)
            .eq("participant_number", participant.assigned_number)
            .single()

          // Fetch partner feedback for mutual match computation
          let p2PartnerFb = null, p3PartnerFb = null
          if (e3Match?.phase2_partner) {
            const { data: p2Row } = await supabase.from("event3_matches").select("phase2_feedback").eq("match_id", E3_MATCH_ID).eq("participant_number", e3Match.phase2_partner).single()
            p2PartnerFb = p2Row?.phase2_feedback || null
          }
          if (e3Match?.phase3_partner) {
            const { data: p3Row } = await supabase.from("event3_matches").select("phase3_feedback").eq("match_id", E3_MATCH_ID).eq("participant_number", e3Match.phase3_partner).single()
            p3PartnerFb = p3Row?.phase3_feedback || null
          }

          if (e3Match) {
            const partnerNums = [e3Match.phase2_partner, e3Match.phase3_partner].filter(Boolean)
            if (partnerNums.length > 0) {
              const { data: partners } = await supabase
                .from("participants")
                .select("assigned_number,name,age,phone_number,survey_data")
                .eq("match_id", MAIN_MATCH)
                .in("assigned_number", partnerNums)

              const partnerMap = {}
              for (const p of partners || []) {
                const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
                partnerMap[p.assigned_number] = {
                  name: p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`,
                  age: p.age || null,
                  phone: p.phone_number || null,
                }
              }

              // Helper to get compatibility breakdown from cache
              const getBreakdown = async (partnerNum) => {
                if (!partnerNum) return null
                const [pa, pb] = [participant.assigned_number, partnerNum].sort((x, y) => x - y)
                const { data: cacheRow } = await supabase
                  .from("compatibility_cache")
                  .select("*")
                  .eq("participant_a_number", pa)
                  .eq("participant_b_number", pb)
                  .order("last_used", { ascending: false })
                  .limit(1)
                  .single()
                if (!cacheRow) return null
                return {
                  synergy: Math.round(parseFloat(cacheRow.interaction_synergy_score)),
                  vibe: Math.round(parseFloat(cacheRow.ai_vibe_score)),
                  lifestyle: Math.round(parseFloat(cacheRow.lifestyle_score)),
                  humorOpen: Math.max(0, Math.round(parseFloat(cacheRow.total_compatibility_score) - parseFloat(cacheRow.interaction_synergy_score) - parseFloat(cacheRow.ai_vibe_score) - parseFloat(cacheRow.lifestyle_score) - parseFloat(cacheRow.communication_score) - Math.round((parseFloat(cacheRow.core_values_score) / 20) * 5))),
                  communication: Math.round(parseFloat(cacheRow.communication_score)),
                  coreValues: Math.round((parseFloat(cacheRow.core_values_score) / 20) * 5),
                  intent: Math.round(parseFloat(cacheRow.intent_goal_score) || 0),
                  total: Math.round(parseFloat(cacheRow.total_compatibility_score)),
                }
              }

              // Add Phase 2 (Choice) match
              if (e3Match.phase2_partner) {
                const p2Partner = partnerMap[e3Match.phase2_partner]
                const p2Breakdown = await getBreakdown(e3Match.phase2_partner)
                const myFb2 = e3Match.phase2_feedback || null
                const partnerFb2 = p2PartnerFb
                const myWant2 = myFb2?.wantConnect ?? null
                const partnerWant2 = partnerFb2?.wantConnect ?? null
                const mutual2 = myWant2 === true && partnerWant2 === true
                history.push({
                  with: e3Match.phase2_partner,
                  partner_name: p2Partner?.name || `لاعب رقم ${e3Match.phase2_partner}`,
                  partner_age: p2Partner?.age || null,
                  partner_phone: p2Partner?.phone || null,
                  partner_event_id: 20,
                  type: "choice",
                  reason: p2Breakdown ? `Synergy: ${p2Breakdown.synergy}% + Vibe: ${p2Breakdown.vibe}% + Lifestyle: ${p2Breakdown.lifestyle}% + Humor/Openness: ${p2Breakdown.humorOpen}% + Communication: ${p2Breakdown.communication}% + Intent: ${p2Breakdown.intent}%` : "",
                  round: 20,
                  table_number: null,
                  score: e3Match.phase2_score || 0,
                  is_repeat_match: false,
                  mutual_match: mutual2,
                  wants_match: myWant2,
                  partner_wants_match: partnerWant2,
                  created_at: null,
                  ai_personality_analysis: null,
                  event_id: 20,
                  partner_message: partnerFb2?.organizerImpression || null,
                  match_type: "choice",
                  match_label: "اختيارك الشخصي",
                  match_word: e3Match.phase2_word || null,
                  breakdown: p2Breakdown,
                  my_feedback: myFb2 ? {
                    compatibilityRate: myFb2.compatibilityRate ?? null,
                    conversationQuality: myFb2.conversationQuality ?? null,
                    personalConnection: myFb2.personalConnection ?? null,
                    sharedInterests: myFb2.sharedInterests ?? null,
                    comfortLevel: myFb2.comfortLevel ?? null,
                    communicationStyle: myFb2.communicationStyle ?? null,
                    wouldMeetAgain: myFb2.wouldMeetAgain ?? null,
                    overallExperience: myFb2.overallExperience ?? null,
                    recommendations: myFb2.recommendations ?? null,
                    participantMessage: myFb2.organizerImpression ?? null,
                    submittedAt: null,
                    wantConnect: myFb2.wantConnect ?? null,
                    sliderMoved: myFb2.sliderMoved ?? false,
                  } : null,
                  partner_feedback: partnerFb2 ? {
                    conversationQuality: partnerFb2.conversationQuality ?? null,
                    personalConnection: partnerFb2.personalConnection ?? null,
                    overallExperience: partnerFb2.overallExperience ?? null,
                    wantConnect: partnerFb2.wantConnect ?? null,
                    compatibilityRate: partnerFb2.compatibilityRate ?? null,
                    sliderMoved: partnerFb2.sliderMoved ?? false,
                    organizerImpression: partnerFb2.organizerImpression ?? null,
                  } : null,
                  humor_early_openness_bonus: "none",
                  synergy_score: p2Breakdown?.synergy ?? null,
                  humor_open_score: p2Breakdown?.humorOpen ?? null,
                  intent_score: p2Breakdown?.intent ?? null,
                  communication_compatibility_score: p2Breakdown?.communication ?? null,
                  lifestyle_compatibility_score: p2Breakdown?.lifestyle ?? null,
                  vibe_compatibility_score: p2Breakdown?.vibe ?? null,
                })
              }

              // Add Phase 3 (Algorithm) match
              if (e3Match.phase3_partner) {
                const p3Partner = partnerMap[e3Match.phase3_partner]
                const p3Breakdown = await getBreakdown(e3Match.phase3_partner)
                const myFb3 = e3Match.phase3_feedback || null
                const partnerFb3 = p3PartnerFb
                const myWant3 = myFb3?.wantConnect ?? null
                const partnerWant3 = partnerFb3?.wantConnect ?? null
                const mutual3 = myWant3 === true && partnerWant3 === true
                history.push({
                  with: e3Match.phase3_partner,
                  partner_name: p3Partner?.name || `لاعب رقم ${e3Match.phase3_partner}`,
                  partner_age: p3Partner?.age || null,
                  partner_phone: p3Partner?.phone || null,
                  partner_event_id: 20,
                  type: "algorithm",
                  reason: p3Breakdown ? `Synergy: ${p3Breakdown.synergy}% + Vibe: ${p3Breakdown.vibe}% + Lifestyle: ${p3Breakdown.lifestyle}% + Humor/Openness: ${p3Breakdown.humorOpen}% + Communication: ${p3Breakdown.communication}% + Intent: ${p3Breakdown.intent}%` : "",
                  round: 21,
                  table_number: null,
                  score: e3Match.phase3_score || 0,
                  is_repeat_match: false,
                  mutual_match: mutual3,
                  wants_match: myWant3,
                  partner_wants_match: partnerWant3,
                  created_at: null,
                  ai_personality_analysis: null,
                  event_id: 20,
                  partner_message: partnerFb3?.organizerImpression || null,
                  match_type: "algorithm",
                  match_label: "اختيار الخوارزمية",
                  match_word: e3Match.phase3_word || null,
                  breakdown: p3Breakdown,
                  match_preference: e3Match.match_preference || null,
                  my_feedback: myFb3 ? {
                    compatibilityRate: myFb3.compatibilityRate ?? null,
                    conversationQuality: myFb3.conversationQuality ?? null,
                    personalConnection: myFb3.personalConnection ?? null,
                    sharedInterests: myFb3.sharedInterests ?? null,
                    comfortLevel: myFb3.comfortLevel ?? null,
                    communicationStyle: myFb3.communicationStyle ?? null,
                    wouldMeetAgain: myFb3.wouldMeetAgain ?? null,
                    overallExperience: myFb3.overallExperience ?? null,
                    recommendations: myFb3.recommendations ?? null,
                    participantMessage: myFb3.organizerImpression ?? null,
                    submittedAt: null,
                    wantConnect: myFb3.wantConnect ?? null,
                    sliderMoved: myFb3.sliderMoved ?? false,
                  } : null,
                  partner_feedback: partnerFb3 ? {
                    conversationQuality: partnerFb3.conversationQuality ?? null,
                    personalConnection: partnerFb3.personalConnection ?? null,
                    overallExperience: partnerFb3.overallExperience ?? null,
                    wantConnect: partnerFb3.wantConnect ?? null,
                    compatibilityRate: partnerFb3.compatibilityRate ?? null,
                    sliderMoved: partnerFb3.sliderMoved ?? false,
                    organizerImpression: partnerFb3.organizerImpression ?? null,
                  } : null,
                  humor_early_openness_bonus: "none",
                  synergy_score: p3Breakdown?.synergy ?? null,
                  humor_open_score: p3Breakdown?.humorOpen ?? null,
                  intent_score: p3Breakdown?.intent ?? null,
                  communication_compatibility_score: p3Breakdown?.communication ?? null,
                  lifestyle_compatibility_score: p3Breakdown?.lifestyle ?? null,
                  vibe_compatibility_score: p3Breakdown?.vibe ?? null,
                })
              }
            }
          }
        }
      } catch (e3Err) {
        console.log("[API] Event3 matches fetch skipped:", e3Err.message)
      }

      console.log("[API] Successfully fetched match results. Sending response.");
      return res.status(200).json({
        success: true,
        assigned_number: participant.assigned_number,
        event_id: participant.event_id,
        history: history
      });

    } catch (error) {
      console.error("[API] Unexpected error in get-match-results:", error);
      return res.status(500).json({ 
        success: false, 
        error: 'حدث خطأ غير متوقع' 
      });
    }
  }

  // CHECK FEEDBACK SUBMITTED ACTION
  if (action === "check-feedback-submitted") {
    try {
      const { secure_token, round, event_id } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      if (!secure_token || !round || !event_id) {
        return res.status(400).json({ error: 'Missing required parameters' })
      }

      // Check if feedback exists for this token, round, and event
      const { data: feedbackData, error: feedbackError } = await supabase
        .from("match_feedback")
        .select("id")
        .eq("match_id", match_id)
        .eq("participant_token", secure_token)
        .eq("round", round)
        .eq("event_id", event_id)

      if (feedbackError) {
        console.error("Error checking feedback:", feedbackError)
        return res.status(500).json({ error: "Database error" })
      }

      // REMOVED AUTOMATIC LOGIC: Event finished status is now ONLY controlled by manual admin toggle
      // No longer automatically marking events as finished based on current_event_id
      
      // Check the event_finished flag in match_results
      const { data: matchData, error: matchError } = await supabase
        .from("match_results")
        .select("event_finished")
        .eq("event_id", event_id)
        .eq("round", round)
        .limit(1)
        .single()

      if (matchError && matchError.code !== 'PGRST116') {
        console.error("Error checking event status:", matchError)
        return res.status(500).json({ error: "Database error" })
      }

      const eventFinished = matchData?.event_finished === true
      
      const feedbackSubmitted = feedbackData && feedbackData.length > 0

      return res.status(200).json({
        success: true,
        event_finished: eventFinished,
        feedback_submitted: feedbackSubmitted
      })
    } catch (error) {
      console.error("Error checking feedback status:", error)
      return res.status(500).json({ error: "Failed to check feedback status" })
    }
  }

  // CHECK IF PARTICIPANT HAS A VALID MATCH (not organizer #9999) FOR A GIVEN ROUND
  // Accepts optional `round` parameter (defaults to 1 for backwards compatibility).
  if (action === "has-valid-match") {
    try {
      const { secure_token, event_id: inputEventId, round: inputRound } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      const targetRound = (typeof inputRound === 'number' && inputRound > 0) ? inputRound : (parseInt(inputRound) || 1)

      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Resolve participant
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, event_id")
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)
        .single()

      if (participantError || !participant) {
        return res.status(404).json({ success: false, error: "Participant not found" })
      }

      // Determine target event_id (request > participant > event_state > 1)
      let eventId = inputEventId || participant.event_id || 1
      if (!inputEventId && !participant.event_id) {
        try {
          const { data: eventState } = await supabase
            .from("event_state")
            .select("current_event_id")
            .eq("match_id", match_id)
            .single()
          if (eventState?.current_event_id) {
            eventId = eventState.current_event_id
          }
        } catch (_) {}
      }

      // Look for any match in the requested round with a real partner (not 9999)
      const { data: matches, error: matchesError } = await supabase
        .from("match_results")
        .select("participant_a_number, participant_b_number")
        .eq("match_id", match_id)
        .eq("event_id", eventId)
        .eq("round", targetRound)
        .or(`participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${participant.assigned_number}`)
        .limit(20)

      if (matchesError) {
        console.error("Error checking matches:", matchesError)
        return res.status(500).json({ success: false, error: "Database error" })
      }

      const has_valid_match = Array.isArray(matches) && matches.some(m => {
        const partner = m.participant_a_number === participant.assigned_number
          ? m.participant_b_number
          : m.participant_a_number
        return partner && partner !== 9999
      })

      return res.status(200).json({ success: true, has_valid_match })
    } catch (error) {
      console.error("Error in has-valid-match:", error)
      return res.status(500).json({ success: false, error: "Unexpected error" })
    }
  }

  // CHECK PHONE NUMBER DUPLICATE (for survey validation)
  if (action === "check-phone-duplicate") {
    // TEMP DISABLE: Always report not duplicate
    return res.status(200).json({ duplicate: false, message: "Temporary phone duplicate check disabled" })
    const { phone_number, current_participant_number, secure_token } = req.body

    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" })
    }

    try {
      // Normalize phone number - extract last 7 digits for more precise matching
      const normalizedPhone = phone_number.replace(/\D/g, '') // Remove all non-digits
      if (normalizedPhone.length < 7) {
        return res.status(400).json({ error: "رقم الهاتف قصير جداً" })
      }
      
      const last7Digits = normalizedPhone.slice(-7)
      console.log(`🔍 Checking phone duplicate for last 7 digits: ${last7Digits}`)
      
      // If we have current participant info, this is an edit operation
      if (current_participant_number || secure_token) {
        console.log(`📝 Edit mode detected - current participant: #${current_participant_number}, token: ${secure_token ? 'provided' : 'none'}`)
      }

      // Search for participants with matching last 7 digits
      const { data: existingParticipants, error } = await supabase
        .from("participants")
        .select("assigned_number, name, phone_number, secure_token")
        .not("phone_number", "is", null)

      if (error) {
        console.error("Database error:", error)
        return res.status(500).json({ error: "Database error" })
      }

      // Check for matches in last 7 digits
      const matchingParticipants = existingParticipants.filter(p => {
        const existingNormalized = p.phone_number.replace(/\D/g, '')
        const existingLast7 = existingNormalized.slice(-7)
        const phoneMatches = existingLast7 === last7Digits
        
        // If this is an edit operation, exclude the current participant from duplicate check
        if (phoneMatches && (current_participant_number || secure_token)) {
          // Exclude if this is the same participant by number
          if (current_participant_number && p.assigned_number === current_participant_number) {
            console.log(`✅ Excluding current participant #${current_participant_number} from duplicate check`)
            return false
          }
          
          // Exclude if this is the same participant by token
          if (secure_token && p.secure_token === secure_token) {
            console.log(`✅ Excluding current participant with token ${secure_token.substring(0, 8)}... from duplicate check`)
            return false
          }
        }
        
        return phoneMatches
      })

      if (matchingParticipants.length > 0) {
        console.log(`❌ Phone duplicate found: ${matchingParticipants.length} matches (after excluding current participant)`)
        return res.status(409).json({ 
          duplicate: true,
          error: "رقم الهاتف مسجل مسبقاً",
          message: "يرجى استخدام زر 'لاعب عائد' لتعديل بياناتك"
        })
      }

      console.log(`✅ Phone number is unique`)
      return res.status(200).json({ 
        duplicate: false,
        message: "رقم الهاتف متاح"
      })

    } catch (error) {
      console.error("Error checking phone duplicate:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء فحص رقم الهاتف" })
    }
  }

  // PHONE LOOKUP FOR PARTICIPANT DATA (to check what questions they've filled)
  if (action === "phone-lookup-data") {
    const { phone_number } = req.body

    if (!phone_number) {
      return res.status(400).json({ error: "يرجى إدخال رقم الهاتف" })
    }

    try {
      // Normalize phone number - extract last 6 digits (same logic as signup)
      const normalizedPhone = phone_number.replace(/\D/g, '')
      if (normalizedPhone.length < 6) {
        return res.status(400).json({ error: "رقم الهاتف يجب أن يحتوي على 6 أرقام على الأقل" })
      }

      const lastSixDigits = normalizedPhone.slice(-6)

      // Find participant by phone number (last 6 digits)
      const { data: participants, error: searchError } = await supabase
        .from("participants")
        .select("assigned_number, name, humor_banter_style, early_openness_comfort, survey_data")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .ilike("phone_number", `%${lastSixDigits}`)

      if (searchError) {
        console.error("Phone lookup error:", searchError)
        return NextResponse.json({ success: false, error: 'خطأ في البحث عن المشارك' }, { status: 500 })
      }

      if (!participants || participants.length === 0) {
        return NextResponse.json({ success: false, error: 'لم يتم العثور على نتائج التوافق' }, { status: 404 })
      }

      if (participants.length > 1) {
        return NextResponse.json({ success: false, error: "تم العثور على أكثر من مشارك بهذا الرقم، يرجى التواصل مع المنظم" }, { status: 400 })
      }
      
      const participant = participants[0]

      return NextResponse.json({
        success: true,
        participant: {
          assigned_number: participant.assigned_number,
          name: participant.name,
          humor_banter_style: participant.humor_banter_style,
          early_openness_comfort: participant.early_openness_comfort,
          survey_data: participant.survey_data
        }
      })

    } catch (err) {
      console.error("Phone lookup data error:", err)
      return res.status(500).json({ error: "حدث خطأ في النظام" })
    }
  }

  // PHONE LOOKUP FOR RETURNING PARTICIPANTS
  if (action === "phone-lookup-signup") {
    const { phone_number, gender_preference, humor_banter_style, early_openness_comfort, auto_signup_next_event } = req.body

    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" })
    }

    try {
      // Normalize phone number - extract last 7 digits for higher uniqueness
      const normalizedPhone = phone_number.replace(/\D/g, '') // Remove all non-digits
      if (normalizedPhone.length < 7) {
        return res.status(400).json({ error: "رقم الهاتف قصير جداً (نحتاج آخر 7 أرقام)" })
      }
      const lastSevenDigits = normalizedPhone.slice(-7)
      console.log(`🔍 Looking up phone ending with: ${lastSevenDigits}`)

      // Query by ending digits directly (case-insensitive) and same match_id
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      const { data: matchingParticipants, error: searchError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, survey_data, signup_for_next_event, match_id, nationality, prefer_same_nationality, preferred_age_min, preferred_age_max, open_age_preference")
        .eq("match_id", match_id)
        .not("phone_number", "is", null)
        .ilike("phone_number", `%${lastSevenDigits}`)
        .order("created_at", { ascending: false })

      console.log(`🎯 Found ${matchingParticipants.length} matching participants`)

      if (matchingParticipants.length === 0) {
        return res.status(404).json({ 
          error: "لم يتم العثور على مشارك بهذا الرقم",
          message: `تأكد من الرقم أو قم بالتسجيل كمشارك جديد. البحث عن: ${lastSevenDigits}`,
          debug: {
            searchedDigits: lastSevenDigits
          }
        })
      }

      if (matchingParticipants.length > 1) {
        return res.status(400).json({ 
          error: "تم العثور على أكثر من مشارك بنفس الرقم",
          message: "يرجى التواصل مع المنظم"
        })
      }

      const participant = matchingParticipants[0]
      
      // Check if already signed up for next event
      if (participant.signup_for_next_event) {
        return res.status(400).json({ 
          error: "أنت مسجل بالفعل للحدث القادم",
          message: "سيتم التواصل معك قريباً"
        })
      }

      // Prepare update data
      const updateData = {
        signup_for_next_event: true,
        next_event_signup_timestamp: new Date().toISOString(),
        auto_signup_next_event: auto_signup_next_event === true ? true : false
      }

      console.log(`✨ Auto signup for all future events: ${auto_signup_next_event === true ? 'YES' : 'NO'}`)

      // Handle gender preference update if provided
      if (gender_preference) {
        if (gender_preference === "same_gender") {
          updateData.same_gender_preference = true
          updateData.any_gender_preference = false
          console.log('👥 Updated gender preference: same gender only')
        } else if (gender_preference === "any_gender") {
          updateData.same_gender_preference = false
          updateData.any_gender_preference = true
          console.log('🌐 Updated gender preference: any gender')
        } else {
          // Default or empty - opposite gender
          updateData.same_gender_preference = false
          updateData.any_gender_preference = false
          console.log('👫 Updated gender preference: opposite gender (default)')
        }
        // Also update the survey_data JSONB (only if it exists to avoid overwriting)
        if (participant.survey_data && typeof participant.survey_data === 'object') {
          const newSurveyData = JSON.parse(JSON.stringify(participant.survey_data));
          if (!newSurveyData.answers || typeof newSurveyData.answers !== 'object') {
            newSurveyData.answers = {};
          }
          newSurveyData.answers.gender_preference = gender_preference;

          // Mirror the logic from SurveyComponent to keep data consistent
          const userGender = newSurveyData.answers.gender || newSurveyData.gender || null;
          if (gender_preference === 'any_gender' || gender_preference === 'any') {
            newSurveyData.answers.actual_gender_preference = 'any_gender';
          } else if (userGender && (gender_preference === userGender)) {
            newSurveyData.answers.actual_gender_preference = 'same_gender';
          } else {
            newSurveyData.answers.actual_gender_preference = 'opposite_gender';
          }

          updateData.survey_data = newSurveyData;
          console.log('📝 Updated gender_preference in survey_data JSONB (merged)');
        } else {
          console.log('ℹ️ survey_data not present; skipping JSONB update to avoid overwriting');
        }
      }

      // Handle interaction style updates if provided
      if (humor_banter_style && ['A', 'B', 'C', 'D'].includes(humor_banter_style)) {
        updateData.humor_banter_style = humor_banter_style
        console.log('😄 Updated humor/banter style:', humor_banter_style)
      }

      if (early_openness_comfort !== undefined) {
        const comfortLevel = parseInt(early_openness_comfort)
        if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
          updateData.early_openness_comfort = comfortLevel
          console.log('🤝 Updated early openness comfort:', comfortLevel)
        }
      }

      // Update participant to sign up for next event
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", participant.id)

      if (updateError) {
        console.error("Update Error:", updateError)
        return res.status(500).json({ error: "Failed to register for next event" })
      }

      console.log(`✅ Participant ${participant.assigned_number} (${participant.name}) signed up for next event`)

      return res.status(200).json({
        success: true,
        message: "تم تسجيلك للحدث القادم بنجاح!",
        participant_name: participant.name,
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in phone-lookup-signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء التسجيل للحدث القادم" })
    }
  }

  // CHECK NEXT EVENT SIGNUP STATUS ACTION
  if (action === "check-next-event-signup") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Get participant data by token
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, signup_for_next_event, auto_signup_next_event, humor_banter_style, early_openness_comfort")
        .eq("secure_token", secure_token)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      return res.status(200).json({
        success: true,
        participant: {
          assigned_number: participant.assigned_number,
          name: participant.name,
          phone_number: participant.phone_number,
          signup_for_next_event: participant.signup_for_next_event,
          auto_signup_next_event: participant.auto_signup_next_event,
          humor_banter_style: participant.humor_banter_style,
          early_openness_comfort: participant.early_openness_comfort
        }
      })

    } catch (error) {
      console.error("Error checking next event signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء فحص حالة التسجيل" })
    }
  }

  // AUTO SIGNUP FOR NEXT EVENT ACTION (for logged in users)
  if (action === "auto-signup-next-event") {
    try {
      const { secure_token, gender_preference, humor_banter_style, early_openness_comfort, auto_signup_next_event } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Get participant data by token (include survey_data for safe merge)
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, signup_for_next_event, survey_data")
        .eq("secure_token", secure_token)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // Prepare update data
      const updateData = {
        signup_for_next_event: true,
        auto_signup_next_event: auto_signup_next_event === true ? true : false
      }

      // Only update timestamp if not already signed up
      if (!participant.signup_for_next_event) {
        updateData.next_event_signup_timestamp = new Date().toISOString()
      }

      console.log(`✨ Auto signup for all future events: ${auto_signup_next_event === true ? 'YES' : 'NO'}`)

      // Handle gender preference update if provided
      if (gender_preference) {
        if (gender_preference === "same_gender") {
          updateData.same_gender_preference = true
          updateData.any_gender_preference = false
          console.log('👥 Updated gender preference: same gender only')
        } else if (gender_preference === "any_gender") {
          updateData.same_gender_preference = false
          updateData.any_gender_preference = true
          console.log('🌐 Updated gender preference: any gender')
        } else {
          // Default or empty - opposite gender
          updateData.same_gender_preference = false
          updateData.any_gender_preference = false
          console.log('👫 Updated gender preference: opposite gender (default)')
        }

        // Also update the survey_data JSONB
        const newSurveyData = participant.survey_data ? JSON.parse(JSON.stringify(participant.survey_data)) : {};
        if (!newSurveyData.answers) {
          newSurveyData.answers = {};
        }
        newSurveyData.answers.gender_preference = gender_preference;

        // Mirror the logic from SurveyComponent to keep data consistent
        const userGender = newSurveyData.answers.gender;
        if (gender_preference === 'any_gender' || gender_preference === 'any') {
            newSurveyData.answers.actual_gender_preference = 'any_gender';
        } else if (gender_preference === userGender) {
            newSurveyData.answers.actual_gender_preference = 'same_gender';
        } else {
            newSurveyData.answers.actual_gender_preference = 'opposite_gender';
        }

        updateData.survey_data = newSurveyData;
        console.log('📝 Updated gender_preference in survey_data JSONB');
      }

      // Handle interaction style updates if provided
      if (humor_banter_style && ['A', 'B', 'C', 'D'].includes(humor_banter_style)) {
        updateData.humor_banter_style = humor_banter_style
        console.log('😄 Updated humor/banter style:', humor_banter_style)
      }

      if (early_openness_comfort !== undefined) {
        const comfortLevel = parseInt(early_openness_comfort)
        if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
          updateData.early_openness_comfort = comfortLevel
          console.log('🤝 Updated early openness comfort:', comfortLevel)
        }
      }

      // Update participant to sign up for next event
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", participant.id)

      if (updateError) {
        console.error("Update Error:", updateError)
        return res.status(500).json({ error: "Failed to register for next event" })
      }

      console.log(`✅ Auto-signup: Participant ${participant.assigned_number} (${participant.name}) signed up for next event`)

      return res.status(200).json({
        success: true,
        message: "تم تسجيلك للحدث القادم بنجاح!",
        participant_name: participant.name,
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in auto-signup-next-event:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء التسجيل للحدث القادم" })
    }
  }

  // DISABLE AUTO SIGNUP FOR NEXT EVENT ACTION
  if (action === "disable-auto-signup") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      // Find participant by secure_token
      const { data: participant, error: findError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("secure_token", secure_token)
        .single()

      if (findError || !participant) {
        console.error("Participant not found:", findError)
        return res.status(404).json({ error: "المشارك غير موجود" })
      }

      // Update participant to disable auto-signup only (keep next event signup)
      const { error: updateError } = await supabase
        .from("participants")
        .update({
          auto_signup_next_event: false
        })
        .eq("secure_token", secure_token)

      if (updateError) {
        console.error("Error disabling auto-signup:", updateError)
        return res.status(500).json({ error: "فشل إيقاف التسجيل التلقائي" })
      }

      console.log(`✅ Auto-signup disabled for participant #${participant.assigned_number}`)

      return res.status(200).json({
        success: true,
        message: "تم إيقاف التسجيل التلقائي بنجاح",
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in disable-auto-signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء إيقاف التسجيل التلقائي" })
    }
  }

  // UNREGISTER FROM NEXT EVENT ACTION
  if (action === "unregister-next-event") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      // Find participant by secure_token
      const { data: participant, error: findError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("secure_token", secure_token)
        .single()

      if (findError || !participant) {
        console.error("Participant not found:", findError)
        return res.status(404).json({ error: "المشارك غير موجود" })
      }

      // Update participant to unregister from next event
      const { error: updateError } = await supabase
        .from("participants")
        .update({
          signup_for_next_event: false
        })
        .eq("secure_token", secure_token)

      if (updateError) {
        console.error("Error unregistering from next event:", updateError)
        return res.status(500).json({ error: "فشل إلغاء التسجيل في الفعالية القادمة" })
      }

      console.log(`✅ Participant #${participant.assigned_number} unregistered from next event`)

      return res.status(200).json({
        success: true,
        message: "تم إلغاء تسجيلك في الفعالية القادمة بنجاح",
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in unregister-next-event:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء إلغاء التسجيل" })
    }
  }

  // UPDATE VIBE QUESTIONS ACTION
  if (action === "update-vibe-questions") {
    try {
      const { secure_token, vibe_answers } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      
      if (!secure_token || !vibe_answers) {
        return res.status(400).json({ error: "Missing secure_token or vibe_answers" })
      }

      console.log('📝 Updating vibe questions for token:', secure_token)

      // Get participant by token
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, survey_data")
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)
        .single()

      if (participantError || !participant) {
        console.error('❌ Participant not found:', participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // Determine if survey_data uses nested structure (answers.vibe_1) or top-level (vibe_1)
      const existingSurveyData = participant.survey_data || {}
      const hasNestedStructure = existingSurveyData.answers && typeof existingSurveyData.answers === 'object'
      
      let updatedSurveyData
      let answersForVibeExtraction
      
      if (hasNestedStructure) {
        // Update nested structure: survey_data.answers.vibe_1
        updatedSurveyData = {
          ...existingSurveyData,
          answers: {
            ...existingSurveyData.answers,
            ...vibe_answers
          }
        }
        answersForVibeExtraction = updatedSurveyData.answers
      } else {
        // Update top-level structure: survey_data.vibe_1
        updatedSurveyData = {
          ...existingSurveyData,
          ...vibe_answers
        }
        answersForVibeExtraction = updatedSurveyData
      }

      // Recalculate vibeDescription from updated vibe answers
      const weekend = (answersForVibeExtraction['vibe_1'] || '') 
      const hobbies = (answersForVibeExtraction['vibe_2'] || '')
      const music = (answersForVibeExtraction['vibe_3'] || '')
      const deepTalk = (answersForVibeExtraction['vibe_4'] || '')
      const friendsDescribe = (answersForVibeExtraction['vibe_5'] || '')
      const describeFriends = (answersForVibeExtraction['vibe_6'] || '')
      
      // Create structured vibe description combining all answers
      const vibeDescription = [
        weekend ? `Weekend: ${weekend}` : '',
        hobbies ? `Hobbies: ${hobbies}` : '',
        music ? `Music: ${music}` : '',
        deepTalk ? `Deep conversations: ${deepTalk}` : '',
        friendsDescribe ? `Friends describe me as: ${friendsDescribe}` : '',
        describeFriends ? `I describe my friends as: ${describeFriends}` : ''
      ].filter(Boolean).join(' | ')
      
      // Update vibeDescription in survey_data
      updatedSurveyData.vibeDescription = vibeDescription
      
      console.log('📝 Updating structure:', hasNestedStructure ? 'nested (answers.vibe_1)' : 'top-level (vibe_1)')
      console.log('✨ Recalculated vibeDescription:', vibeDescription.substring(0, 100) + '...')

      // Update participant in database
      const { error: updateError } = await supabase
        .from("participants")
        .update({ survey_data: updatedSurveyData })
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)

      if (updateError) {
        console.error('❌ Error updating vibe questions:', updateError)
        return res.status(500).json({ error: "Failed to update vibe questions" })
      }

      console.log('✅ Vibe questions updated successfully for participant:', participant.assigned_number)
      return res.status(200).json({ 
        success: true,
        message: "تم تحديث إجاباتك بنجاح"
      })

    } catch (err) {
      console.error('❌ Error in update-vibe-questions:', err)
      return res.status(500).json({ error: err.message })
    }
  }
// ---------------------------------------------------------------------------
  // ACTION: GENERATE AI VIBE ANALYSIS
  // ---------------------------------------------------------------------------
  if (action === "generate-vibe-analysis") {
    try {
      const { secure_token, partner_number, event_id } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      
      // 1. Validation
      if (!secure_token || !partner_number || !event_id) {
        return res.status(400).json({ error: "Missing secure_token, partner_number, or event_id" })
      }

      // --- HELPER FUNCTIONS ---

      // Safely extract answers from nested or flat structure
      const getAns = (p, key) => {
        return p.survey_data?.answers?.[key] || p.survey_data?.[key] || ""
      }

      // Map English names to Arabic to keep the narrative consistent
      const cleanName = (fullName) => {
        if (!fullName) return "المشارك"
        const first = fullName.trim().split(/\s+/)[0]
        // Common mappings
        const map = { 
          "Ahmed": "أحمد", "Sara": "سارة", "Mohammad": "محمد", "Ali": "علي", 
          "Fatima": "فاطمة", "Omar": "عمر", "Nora": "نورا", "Khalid": "خالد", 
          "Lama": "لمى", "Fahad": "فهد", "Saud": "سعود", "Reem": "ريم" 
        }
        return map[first] || first
      }

      // Convert Abstract Codes (A/B/C) to Semantic Meaning for AI
      const interpretProfile = (p) => {
        // Q35: Conversational Role
        const roleMap = { 'أ': 'مبادر ويقود السوالف', 'ب': 'متفاعل وحيوي', 'ج': 'مستمع هادئ' }
        // Q37: Social Battery
        const energyMap = { 'أ': 'طاقة عالية وتزيد مع الناس', 'ب': 'طاقة هادئة وتحتاج روقان' }
        // Q40: Intent
        const intentMap = { 'أ': 'تكوين صداقات', 'ب': 'بحث عن كيمياء عميقة (Spark)', 'ج': 'تجربة اجتماعية' }

        return {
          vibes: `${getAns(p, 'vibe_1')} | ${getAns(p, 'vibe_2')} | ${getAns(p, 'vibe_3')}`,
          personality: getAns(p, 'vibe_5'), // How friends describe them
          social_style: `${roleMap[getAns(p, 'q35')] || 'متوازن'} / ${energyMap[getAns(p, 'q37')] || 'طاقة متوسطة'}`,
          goal: intentMap[getAns(p, 'q40')] || 'تعارف عام',
          hooks: getAns(p, 'vibe_2') // Specific hobbies to target
        }
      }

      // ------------------------

      // 2. Get Participant 1 (Current User)
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, survey_data")
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // 3. Check Cache (Avoid paying for OpenAI if analysis exists)
      // Logic: Check match_results for this pair
      const { data: existingMatch, error: matchLookupError } = await supabase
        .from("match_results")
        .select("ai_personality_analysis")
        .eq("match_id", match_id)
        .eq("event_id", event_id)
        .or(`and(participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${participant.assigned_number})`)
        .single()

      if (existingMatch?.ai_personality_analysis) {
        console.log(`🔄 Returning Cached Analysis for ${participant.assigned_number} <-> ${partner_number}`)
        return res.status(200).json({
          success: true,
          analysis: existingMatch.ai_personality_analysis,
          cached: true
        })
      }

      // 4. Get Participant 2 (Partner)
      const { data: partner, error: partnerError } = await supabase
        .from("participants")
        .select("assigned_number, survey_data")
        .eq("assigned_number", partner_number)
        .eq("match_id", match_id)
        .single()

      if (partnerError || !partner) {
        console.error("Partner lookup error:", partnerError)
        return res.status(404).json({ error: "Partner not found" })
      }

      // 5. Build The Context Objects
      const name1 = cleanName(participant.survey_data?.name)
      const name2 = cleanName(partner.survey_data?.name)

      const p1Data = interpretProfile(participant)
      const p2Data = interpretProfile(partner)

      // 6. The "Spark" Narrative Prompt
      const prompt = `أنت "محلل ذكاء اجتماعي" متطور جداً، تفهم النفسيات وتعرف خبايا الرياض (Riyadh Local Expert).
مهمتك: قراءة ملفين لشخصين وتحليل "الكيمياء الخفية" بينهما بأسلوب ذكي، واقعي، وغير مبتذل.

[الملف الأول: ${name1}]
- "الجو العام": ${p1Data.vibes}
- "الشخصية": ${p1Data.personality}
- "الدور الاجتماعي": ${p1Data.social_style}
- "الهدف": ${p1Data.goal}

[الملف الثاني: ${name2}]
- "الجو العام": ${p2Data.vibes}
- "الشخصية": ${p2Data.personality}
- "الدور الاجتماعي": ${p2Data.social_style}
- "الهدف": ${p2Data.goal}

المطلوب:
اكتب تحليلاً واحداً مركزاً (160-180 كلمة) بلهجة "سعودية بيضاء" راقية جداً.

1. ابدأ بـ "المعادلة النفسية": (مثلاً: "اجتماع هدوء ${name1} مع اندفاع ${name2} يخلق توازن مطلوب...")
2. حلل "الديناميكية": لا تسرد الهوايات، بل اشرح *كيف* يتفاعلون. (مثلاً: "بما أن فهد يحب التفاصيل وسارة تحب الاستماع، الحوار بينهم ما راح يوقف").
3. استخدم مفرداتهم بذكاء: (إذا ذكروا "كشتة"، "بادل"، "قيمنق" -> وظفها في سياق التحليل).
4. اقترح "Setting" واقعي في الرياض: (مثلاً: "يناسبهم مكان رايق في حي السفارات"، "يحتاجون ضجة البوليفارد"، "جلسة شتوية في العمارية").

🚫 قائمة الممنوعات (Strict Constraints):
- ممنوع ذكر "أنهار"، "غابات"، "زقزقة عصافير" (نحن في الرياض!).
- ممنوع العبارات المستهلكة مثل: "مزيج رائع"، "كوب شاي دافئ"، "نتمنى لكم".
- ممنوع التكرار. كن مباشراً وحاد الذكاء.

الهدف: أن يقرأ المستخدم التحليل ويقول: "واو! الذكاء الاصطناعي فاهمني فعلاً".`

      // 7. Generate with Anti-Repetition Settings
      console.log(`🤖 Generating fresh Vibe Analysis for ${name1} & ${name2}...`)
      
      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 500,
        temperature: 0.82,     // High creativity but controlled
        presence_penalty: 0.8,  // Forces new vocabulary
        frequency_penalty: 0.3
            })

      const analysis = completion.choices[0]?.message?.content?.trim()
      
      if (!analysis) {
        throw new Error("AI generated empty analysis")
      }

      // 8. Store Result
      const { error: updateError } = await supabase
        .from("match_results")
        .update({ ai_personality_analysis: analysis })
        .eq("match_id", match_id)
        .eq("event_id", event_id)
        .or(`and(participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${participant.assigned_number})`)

      if (updateError) {
        console.error("Error storing analysis:", updateError)
        return res.status(500).json({ error: "Failed to store analysis" })
      }

      return res.status(200).json({
        success: true,
        analysis: analysis,
        cached: false
      })
      
    } catch (error) {
      console.error("Error in generate-vibe-analysis:", error)
      return res.status(500).json({ 
        error: "Failed to generate vibe analysis",
        details: error.message 
      })
    }
  }  // ENABLE AUTO-SIGNUP FOR ALL FUTURE EVENTS
  if (action === "enable-auto-signup") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Get participant data by token
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, auto_signup_next_event")
        .eq("secure_token", secure_token)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // Check if already enabled
      if (participant.auto_signup_next_event) {
        return res.status(200).json({ 
          success: true,
          message: "التسجيل التلقائي مفعّل بالفعل",
          already_enabled: true
        })
      }

      // Enable auto-signup
      const { error: updateError } = await supabase
        .from("participants")
        .update({ auto_signup_next_event: true })
        .eq("id", participant.id)

      if (updateError) {
        console.error("Update Error:", updateError)
        return res.status(500).json({ error: "Failed to enable auto-signup" })
      }

      console.log(`✨ Auto-signup enabled for participant ${participant.assigned_number} (${participant.name})`)

      return res.status(200).json({
        success: true,
        message: "تم تفعيل التسجيل التلقائي لجميع الأحداث القادمة!",
        participant_name: participant.name,
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in enable-auto-signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء تفعيل التسجيل التلقائي" })
    }
  }

  // 🔹 PREDICT MATCH SUCCESS
  if (action === "predict-match-success") {
    try {
      const { participant1, participant2 } = req.body

      if (!participant1 || !participant2) {
        return res.status(400).json({ error: "Both participant numbers are required" })
      }

      if (participant1 === participant2) {
        return res.status(400).json({ error: "Cannot predict match success for same participant" })
      }

      // Fetch both participants
      const { data: participants, error: fetchError } = await supabase
        .from("participants")
        .select("assigned_number, name, survey_data, mbti_personality_type, attachment_style, communication_style, age, gender")
        .eq("match_id", match_id)
        .in("assigned_number", [participant1, participant2])

      if (fetchError) {
        console.error("Error fetching participants:", fetchError)
        return res.status(500).json({ error: "Failed to fetch participant data" })
      }

      if (!participants || participants.length !== 2) {
        return res.status(404).json({ error: "One or both participants not found" })
      }

      const p1 = participants.find(p => p.assigned_number === participant1)
      const p2 = participants.find(p => p.assigned_number === participant2)

      if (!p1 || !p2) {
        return res.status(404).json({ error: "Participant data incomplete" })
      }

      // Check if participants have survey data
      if (!p1.survey_data || !p2.survey_data) {
        return res.status(400).json({ error: "Both participants must have completed survey data" })
      }

      // Fetch previous feedback patterns for similar matches
      const { data: feedbackMatches, error: feedbackError } = await supabase
        .from("match_results")
        .select(`
          compatibility_score,
          mbti_compatibility_score,
          attachment_compatibility_score,
          communication_compatibility_score,
          lifestyle_compatibility_score,
          core_values_compatibility_score,
          vibe_compatibility_score,
          feedback(compatibility_rate, conversation_quality, personal_connection, would_meet_again)
        `)
        .eq("match_id", match_id)
        .eq("event_id", event_id)
        .gte("round", 4)
        .not("feedback", "is", null)

      // Create AI prompt for prediction
      const prompt = `You are an expert relationship compatibility analyst. Analyze the following two participants and predict their match success probability based on their survey responses and historical feedback patterns.

PARTICIPANT 1 (#${participant1}):
- Name: ${p1.name || 'Not provided'}
- Age: ${p1.age || p1.survey_data?.age || 'Not provided'}
- Gender: ${p1.gender || p1.survey_data?.gender || 'Not provided'}
- MBTI: ${p1.mbti_personality_type || p1.survey_data?.mbti || 'Not provided'}
- Attachment Style: ${p1.attachment_style || 'Not provided'}
- Communication Style: ${p1.communication_style || 'Not provided'}
- Survey Answers: ${JSON.stringify(p1.survey_data?.answers || {}, null, 2)}

PARTICIPANT 2 (#${participant2}):
- Name: ${p2.name || 'Not provided'}
- Age: ${p2.age || p2.survey_data?.age || 'Not provided'}
- Gender: ${p2.gender || p2.survey_data?.gender || 'Not provided'}
- MBTI: ${p2.mbti_personality_type || p2.survey_data?.mbti || 'Not provided'}
- Attachment Style: ${p2.attachment_style || 'Not provided'}
- Communication Style: ${p2.communication_style || 'Not provided'}
- Survey Answers: ${JSON.stringify(p2.survey_data?.answers || {}, null, 2)}

HISTORICAL FEEDBACK PATTERNS:
${feedbackMatches ? `Based on ${feedbackMatches.length} previous matches with feedback data.` : 'No historical feedback data available.'}

TASK:
1. Calculate a success probability percentage (0-100%)
2. Provide a detailed analysis explaining the prediction
3. Focus on compatibility factors, potential challenges, and strengths
4. Consider personality compatibility, lifestyle alignment, and communication styles
5. Reference specific survey answers that support your prediction

Please respond in JSON format:
{
  "success_probability": [number between 0-100],
  "analysis": "[detailed analysis in Arabic, 200-300 words]",
  "compatibility_scores": {
    "personality": [0-100],
    "lifestyle": [0-100], 
    "communication": [0-100],
    "values": [0-100],
    "interests": [0-100]
  },
  "key_factors": {
    "strengths": ["factor1", "factor2", "factor3"],
    "challenges": ["challenge1", "challenge2"],
    "recommendations": ["rec1", "rec2"]
  }
}`

      // Generate prediction using OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert relationship compatibility analyst. Provide accurate, culturally sensitive predictions based on survey data and psychological compatibility factors. Always respond in valid JSON format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_completion_tokens: 1500
      })

      const predictionText = completion.choices[0]?.message?.content
      if (!predictionText) {
        return res.status(500).json({ error: "Failed to generate prediction" })
      }

      try {
        const prediction = JSON.parse(predictionText)
        
        console.log(`✅ Match success prediction generated for participants ${participant1} ↔ ${participant2}: ${prediction.success_probability}%`)
        
        return res.status(200).json({
          success: true,
          ...prediction,
          participants: {
            participant1: { number: participant1, name: p1.name },
            participant2: { number: participant2, name: p2.name }
          }
        })
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError)
        return res.status(500).json({ 
          error: "Failed to parse prediction response",
          raw_response: predictionText 
        })
      }

    } catch (error) {
      console.error("Error in predict-match-success:", error)
      return res.status(500).json({ 
        error: "Failed to predict match success",
        details: error.message 
      })
    }
  }

  // ── Event 4.0 participant actions ─────────────────────────────────────────────
  if (action && action.startsWith("e3-")) {
    const E3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
    const MAIN_MATCH = "00000000-0000-0000-0000-000000000000"
    const firstName = (n) => n ? n.trim().split(/\s+/)[0] : "—"

    // Resolve token to participant (cached to reduce DB load on polling actions)
    const resolveE3Token = async (tok) => {
      if (!tok) return null
      const cached = _e3TokenCache.get(tok)
      if (cached && cached.expiresAt > Date.now()) return cached.participant
      const { data } = await supabase.from("participants").select("assigned_number,name,gender,age,survey_data").eq("secure_token", tok).eq("match_id", MAIN_MATCH).single()
      const participant = data || null
      _e3TokenCache.set(tok, { participant, expiresAt: Date.now() + E3_TOKEN_CACHE_TTL_MS })
      return participant
    }

    const token = req.body.token || null
    const participant = token ? await resolveE3Token(token) : null
    const myNumber = participant?.assigned_number

    try {
      // e3-get-state (no auth required)
      if (action === "e3-get-state") {
        const { data: stateRow } = await supabase.from("event_state").select("phase,global_timer_active,global_timer_start_time,global_timer_duration,global_timer_round,phase2_score_revealed,phase3_score_revealed").eq("match_id", E3_MATCH_ID).single()
        const phase = stateRow?.phase || "setup"
        const { count: participantsSelected } = await supabase.from("event3_participants").select("id", { count: "exact", head: true }).eq("match_id", E3_MATCH_ID)

        // Server-side auto-save: if ranking phase and timer expired, auto-save for this participant
        if (participant && (phase === "ranking1" || phase === "ranking2") && stateRow?.global_timer_active && stateRow?.global_timer_start_time) {
          const elapsed = Math.floor((Date.now() - new Date(stateRow.global_timer_start_time).getTime()) / 1000)
          const remaining = Math.max(0, (stateRow.global_timer_duration || 150) - elapsed)
          if (remaining === 0) {
            // Check if participant already has rankings
            const { data: existingRanks } = await supabase.from("participant_rankings").select("id").eq("match_id", E3_MATCH_ID).eq("ranker_number", myNumber).limit(1)
            if (!existingRanks || existingRanks.length === 0) {
              // Determine max round based on ranking phase (ranking1=round 1, ranking2=rounds 1-2)
              const maxRound = phase === "ranking1" ? 1 : 2
              // Auto-save default rankings based on meeting order (only rounds 1..maxRound)
              const { data: allAssignments } = await supabase.from("session_assignments").select("round,table_number,participant_id").eq("match_id", E3_MATCH_ID).lte("round", maxRound)
              if (allAssignments && allAssignments.length > 0) {
                const myRounds = allAssignments.filter(a => a.participant_id === myNumber)
                if (myRounds.length > 0) {
                  const seenMates = new Set()
                  const mates = []
                  for (const row of myRounds.sort((a, b) => a.round - b.round)) {
                    const tableMates = allAssignments.filter(a => a.round === row.round && a.table_number === row.table_number && a.participant_id !== myNumber)
                    for (const m of tableMates) { if (!seenMates.has(m.participant_id)) { seenMates.add(m.participant_id); mates.push(m.participant_id) } }
                  }
                  if (mates.length > 0) {
                    const rows = mates.map((num, idx) => ({ match_id: E3_MATCH_ID, event_id: 3, ranker_number: myNumber, ranked_number: num, rank: idx + 1, auto_saved: true }))
                    await supabase.from("participant_rankings").delete().eq("match_id", E3_MATCH_ID).eq("ranker_number", myNumber)
                    await supabase.from("participant_rankings").insert(rows)
                    console.log(`[auto-save] Server auto-saved rankings for #${myNumber} (${rows.length} entries, rounds 1-${maxRound}) — ranking timer expired`)
                  }
                }
              }
            }
          }
        }

        let myAssignment = null
        if (participant) {
          const { data: ep } = await supabase.from("event3_participants").select("position").eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber).single()
          const roundMatch = phase.match(/^round(\d)$/)
          const currentRound = roundMatch ? parseInt(roundMatch[1]) : null
          if (ep && currentRound) {
            const { data: sa } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("round", currentRound).eq("participant_id", myNumber).single()
            myAssignment = sa ? { round: currentRound, table: sa.table_number, enrolled: true } : { enrolled: true }
          } else {
            myAssignment = { enrolled: !!ep }
          }
        }
        let myInfo = null
        if (participant) {
          const sd = typeof participant.survey_data === "string" ? JSON.parse(participant.survey_data || "{}") : (participant.survey_data || {})
          const fullName = participant.name || sd?.answers?.name || sd?.name || ""
          const firstName = fullName.split(" ")[0] || fullName
          myInfo = { number: myNumber, name: firstName, gender: participant.gender || sd?.answers?.gender || sd?.gender || null }
        }
        return res.status(200).json({ phase, timer_active: stateRow?.global_timer_active || false, timer_start: stateRow?.global_timer_start_time || null, timer_duration: stateRow?.global_timer_duration || 1200, timer_round: stateRow?.global_timer_round || null, my_assignment: myAssignment, enrolled: myAssignment?.enrolled || false, my_info: myInfo, participants_selected: participantsSelected || 0, phase2_score_revealed: stateRow?.phase2_score_revealed || false, phase3_score_revealed: stateRow?.phase3_score_revealed || false })
      }

      // e3-login-by-phone (no token required)
      if (action === "e3-login-by-phone") {
        const { phone } = req.body
        if (!phone) return res.status(400).json({ error: "رقم الجوال مطلوب" })
        const raw = String(phone).replace(/\D/g, '')
        const last7 = raw.slice(-7)
        if (last7.length < 7) return res.status(400).json({ error: "رقم الجوال غير صحيح" })
        const { data: candidates } = await supabase
          .from("participants").select("assigned_number,secure_token,name,phone_number")
          .eq("match_id", MAIN_MATCH).not("phone_number", "is", null)
        const match = (candidates || []).find(c => {
          const cp = String(c.phone_number || '').replace(/\D/g, '')
          return cp.length >= 7 && cp.slice(-7) === last7
        })
        if (!match) return res.status(404).json({ error: "لم يتم العثور على رقمك في الفعالية. تأكد من الرقم أو تواصل مع المنظم." })
        const { data: ep } = await supabase.from("event3_participants")
          .select("participant_number").eq("match_id", E3_MATCH_ID)
          .eq("participant_number", match.assigned_number).maybeSingle()
        if (!ep) return res.status(403).json({ error: "رقمك غير مسجّل في هذه الفعالية. تواصل مع المنظم." })
        const firstName = (match.name || '').trim().split(/\s+/)[0] || 'مشارك'
        return res.status(200).json({ token: match.secure_token, name: firstName })
      }

      if (!participant) return res.status(401).json({ error: "Invalid or missing token" })

      // e3-get-assignment
      if (action === "e3-get-assignment") {
        const { round } = req.body
        const { data: sa } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("round", round).eq("participant_id", myNumber).single()
        if (!sa) return res.status(404).json({ error: "No assignment found" })
        const { data: mates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", E3_MATCH_ID).eq("round", round).eq("table_number", sa.table_number).neq("participant_id", myNumber)
        const mateNums = (mates || []).map(t => t.participant_id)
        const { data: mateData } = await supabase.from("participants").select("assigned_number,name,survey_data,gender").eq("match_id", MAIN_MATCH).in("assigned_number", mateNums)
        const tablemates = (mateData || []).map(p => { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); return { number: p.assigned_number, first_name: firstName(p.name || sd?.answers?.name || sd?.name), gender: p.gender || sd?.answers?.gender || sd?.gender || null } })
        return res.status(200).json({ round, table: sa.table_number, tablemates })
      }

      // e3-get-participants-met
      if (action === "e3-get-participants-met") {
        const completedRounds = Math.min(parseInt(req.body.completed_rounds || "3") || 3, 3)
        const { data: allRounds } = await supabase.from("session_assignments").select("round,table_number,participant_id").eq("match_id", E3_MATCH_ID).eq("participant_id", myNumber).lte("round", completedRounds)
        if (!allRounds || allRounds.length === 0) return res.status(404).json({ error: "No session assignments found" })
        const metNumbers = []
        const seenNums = new Set()
        for (const row of allRounds.sort((a, b) => a.round - b.round)) {
          const { data: mates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", E3_MATCH_ID).eq("round", row.round).eq("table_number", row.table_number).neq("participant_id", myNumber)
          for (const m of mates || []) {
            if (m.participant_id !== myNumber && !seenNums.has(m.participant_id)) {
              seenNums.add(m.participant_id)
              metNumbers.push({ number: m.participant_id, round: row.round })
            }
          }
        }
        if (metNumbers.length === 0) return res.status(200).json({ people: [], existing_rankings: {}, already_submitted: false })
        const nums = metNumbers.map(m => m.number)
        const { data: pdata } = await supabase.from("participants").select("assigned_number,name,survey_data").eq("match_id", MAIN_MATCH).in("assigned_number", nums)
        const nameMap = {}
        for (const p of pdata || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); nameMap[p.assigned_number] = p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}` }
        // Build table_number map from session_assignments
        const tableMap = {}
        for (const row of allRounds) { const { data: mates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", E3_MATCH_ID).eq("round", row.round).eq("table_number", row.table_number).neq("participant_id", myNumber); for (const m of mates || []) { if (!tableMap[m.participant_id]) tableMap[m.participant_id] = row.table_number } }
        const { data: existingRankings } = await supabase.from("participant_rankings").select("ranked_number,rank").eq("match_id", E3_MATCH_ID).eq("ranker_number", myNumber)
        const rankingMap = {}
        for (const r of existingRankings || []) rankingMap[r.ranked_number] = r.rank
        return res.status(200).json({ people: metNumbers.map(m => ({ number: m.number, first_name: firstName(nameMap[m.number]), round: m.round, table_number: tableMap[m.number] || null })), existing_rankings: rankingMap, already_submitted: (existingRankings || []).length > 0 && (existingRankings || []).length >= metNumbers.length })
      }

      // e3-submit-ranking
      if (action === "e3-submit-ranking") {
        const { ranked_list, auto_saved } = req.body
        if (!Array.isArray(ranked_list) || ranked_list.length === 0) return res.status(400).json({ error: "Ranking list cannot be empty" })
        await supabase.from("participant_rankings").delete().eq("match_id", E3_MATCH_ID).eq("ranker_number", myNumber)
        const { error } = await supabase.from("participant_rankings").insert(ranked_list.map((num, idx) => ({ match_id: E3_MATCH_ID, event_id: 3, ranker_number: myNumber, ranked_number: num, rank: idx + 1, auto_saved: !!auto_saved })))
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Rankings submitted successfully" })
      }

      // e3-get-phase2-reveal
      if (action === "e3-get-phase2-reveal") {
        const { data: matchRow } = await supabase.from("event3_matches").select("phase2_partner,phase2_word,phase2_score").eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber).single()
        if (!matchRow || !matchRow.phase2_partner) return res.status(404).json({ error: "No Phase 2 match found yet" })
        const [{ data: partner }, { data: tableRow }] = await Promise.all([
          supabase.from("participants").select("assigned_number,name,survey_data,mbti_personality_type,age").eq("match_id", MAIN_MATCH).eq("assigned_number", matchRow.phase2_partner).single(),
          supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("round", 20).eq("participant_id", myNumber).single(),
        ])
        const sd = typeof partner?.survey_data === "string" ? JSON.parse(partner.survey_data || "{}") : (partner?.survey_data || {})
        const getF = (p, k) => { try { const s = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); return s?.answers?.[k] ?? s?.[k] ?? p?.[k] ?? "" } catch { return "" } }
        const partnerMbti = (getF(partner, "mbti_type") || partner?.mbti_personality_type || "").toUpperCase()
        const partnerAttachment = getF(partner, "attachment_style") || ""
        const partnerCommunication = getF(partner, "communication_style") || ""
        const partnerAge = parseInt(getF(partner, "age") || partner?.age) || null
        // Use stored phase2_score (real compatibility), fallback to heuristic if missing
        let phase2Score = matchRow.phase2_score || 0
        if (!phase2Score) {
          phase2Score = 50
          const mA = (getF(participant, "mbti_type") || participant.mbti_personality_type || "").toUpperCase()
          const mB = (getF(partner, "mbti_type") || partner?.mbti_personality_type || "").toUpperCase()
          if (mA.length === 4 && mB.length === 4) { let s = 0; for (let i = 0; i < 4; i++) if (mA[i] === mB[i]) s++; phase2Score += s >= 3 ? 10 : s === 2 ? 5 : 0 }
          const ageA = parseInt(getF(participant, "age") || participant.age) || 0, ageB = parseInt(getF(partner, "age") || partner?.age) || 0
          if (ageA && ageB) { const d = Math.abs(ageA - ageB); phase2Score += d <= 2 ? 10 : d <= 5 ? 5 : d > 10 ? -10 : 0 }
          const atA = (getF(participant, "attachment_style") || "").toLowerCase(), atB = (getF(partner, "attachment_style") || "").toLowerCase()
          if (atA && atB) { if (atA === atB && atA === "secure") phase2Score += 10; else if (atA === "secure" || atB === "secure") phase2Score += 5 }
          phase2Score = Math.min(99, Math.max(1, phase2Score))
        }
        // Fetch compatibility breakdown from cache (same as Phase 3)
        let breakdown = null
        const [a, b] = [myNumber, matchRow.phase2_partner].sort((x, y) => x - y)
        const { data: cacheRow } = await supabase.from("compatibility_cache").select("*").eq("participant_a_number", a).eq("participant_b_number", b).order("last_used", { ascending: false }).limit(1).single()
        if (cacheRow) {
          const coreScaled5 = Math.round((parseFloat(cacheRow.core_values_score) / 20) * 5)
          const humorOpen = Math.max(0, Math.round(parseFloat(cacheRow.total_compatibility_score) - parseFloat(cacheRow.interaction_synergy_score) - parseFloat(cacheRow.ai_vibe_score) - parseFloat(cacheRow.lifestyle_score) - parseFloat(cacheRow.communication_score) - coreScaled5))
          breakdown = {
            synergy: Math.round(parseFloat(cacheRow.interaction_synergy_score)),
            vibe: Math.round(parseFloat(cacheRow.ai_vibe_score)),
            lifestyle: Math.round(parseFloat(cacheRow.lifestyle_score)),
            humorOpen,
            communication: Math.round(parseFloat(cacheRow.communication_score)),
            coreValues: coreScaled5,
            intent: Math.round(parseFloat(cacheRow.intent_goal_score) || 0),
            total: Math.round(parseFloat(cacheRow.total_compatibility_score)),
          }
        }
        return res.status(200).json({ partner_number: matchRow.phase2_partner, partner_first_name: firstName(partner?.name || sd?.answers?.name || sd?.name), table_number: tableRow?.table_number ?? null, word_submitted: !!matchRow.phase2_word, my_word: matchRow.phase2_word || null, compatibility_score: breakdown?.total ?? phase2Score, partner_mbti: partnerMbti, partner_attachment: partnerAttachment, partner_communication: partnerCommunication, partner_age: partnerAge, breakdown })
      }

      // e3-submit-phase2-word
      if (action === "e3-submit-phase2-word") {
        const word = (req.body.word || "").trim().split(/\s+/)[0]
        if (!word) return res.status(400).json({ error: "Word is required" })
        const { error } = await supabase.from("event3_matches").update({ phase2_word: word }).eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Word saved" })
      }

      // e3-get-phase3-reveal
      if (action === "e3-get-phase3-reveal") {
        const { data: matchRow } = await supabase.from("event3_matches").select("phase3_partner,phase3_score,phase3_word,phase2_partner").eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber).single()
        if (!matchRow || !matchRow.phase3_partner) return res.status(404).json({ error: "No Phase 3 match found yet" })
        const { data: partner } = await supabase.from("participants").select("assigned_number,name,survey_data,mbti_personality_type,age").eq("match_id", MAIN_MATCH).eq("assigned_number", matchRow.phase3_partner).single()
        const sd = typeof partner?.survey_data === "string" ? JSON.parse(partner.survey_data || "{}") : (partner?.survey_data || {})
        const getF = (p, k) => { try { const s = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); return s?.answers?.[k] ?? s?.[k] ?? p?.[k] ?? "" } catch { return "" } }
        const partnerMbti = (getF(partner, "mbti_type") || partner?.mbti_personality_type || "").toUpperCase()
        const partnerAttachment = getF(partner, "attachment_style") || ""
        const partnerCommunication = getF(partner, "communication_style") || ""
        const partnerAge = parseInt(getF(partner, "age") || partner?.age) || null
        // Fetch compatibility breakdown from cache
        let breakdown = null
        const [a, b] = [myNumber, matchRow.phase3_partner].sort((x, y) => x - y)
        const { data: cacheRow } = await supabase.from("compatibility_cache").select("*").eq("participant_a_number", a).eq("participant_b_number", b).order("last_used", { ascending: false }).limit(1).single()
        if (cacheRow) {
          const coreScaled5 = Math.round((parseFloat(cacheRow.core_values_score) / 20) * 5)
          const humorOpen = Math.max(0, Math.round(parseFloat(cacheRow.total_compatibility_score) - parseFloat(cacheRow.interaction_synergy_score) - parseFloat(cacheRow.ai_vibe_score) - parseFloat(cacheRow.lifestyle_score) - parseFloat(cacheRow.communication_score) - coreScaled5))
          breakdown = {
            synergy: Math.round(parseFloat(cacheRow.interaction_synergy_score)),
            vibe: Math.round(parseFloat(cacheRow.ai_vibe_score)),
            lifestyle: Math.round(parseFloat(cacheRow.lifestyle_score)),
            humorOpen,
            communication: Math.round(parseFloat(cacheRow.communication_score)),
            coreValues: coreScaled5,
            intent: Math.round(parseFloat(cacheRow.intent_goal_score) || 0),
            total: Math.round(parseFloat(cacheRow.total_compatibility_score)),
          }
        }
        // Fetch table number from round 30 session_assignments
        const { data: tableRow } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("round", 30).eq("participant_id", myNumber).single()
        return res.status(200).json({ partner_number: matchRow.phase3_partner, partner_first_name: firstName(partner?.name || sd?.answers?.name || sd?.name), compatibility_score: breakdown?.total ?? matchRow.phase3_score ?? 0, same_as_phase2: matchRow.phase2_partner === matchRow.phase3_partner, word_submitted: !!matchRow.phase3_word, partner_mbti: partnerMbti, partner_attachment: partnerAttachment, partner_communication: partnerCommunication, partner_age: partnerAge, breakdown, table_number: tableRow?.table_number ?? null })
      }

      // e3-submit-phase3-word
      if (action === "e3-submit-phase3-word") {
        const word = (req.body.word || "").trim().split(/\s+/)[0]
        if (!word) return res.status(400).json({ error: "Word is required" })
        const { error } = await supabase.from("event3_matches").update({ phase3_word: word }).eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Word saved" })
      }

      // e3-submit-phase2-feedback
      if (action === "e3-submit-phase2-feedback") {
        const fb = req.body.feedback || {}
        const { error } = await supabase.from("event3_matches").update({ phase2_feedback: fb }).eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Feedback saved" })
      }
      // e3-submit-phase3-feedback
      if (action === "e3-submit-phase3-feedback") {
        const fb = req.body.feedback || {}
        const { error } = await supabase.from("event3_matches").update({ phase3_feedback: fb }).eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Feedback saved" })
      }

      // e3-submit-match-preference (user prefers choice or algorithm match)
      if (action === "e3-submit-match-preference") {
        const preference = req.body.preference // "choice" | "algorithm" | "both" | "neither"
        if (!preference || !["choice", "algorithm", "both", "neither"].includes(preference)) {
          return res.status(400).json({ error: "Invalid preference" })
        }
        const { error } = await supabase.from("event3_matches").update({ match_preference: preference }).eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber)
        if (error) {
          // Column might not exist yet — try with metadata fallback
          const { error: err2 } = await supabase.from("event3_matches").update({ phase3_feedback: { match_preference: preference } }).eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber)
          if (err2) return res.status(500).json({ error: err2.message })
        }
        return res.status(200).json({ message: "Preference saved", preference })
      }

      // e3-get-final-reveal
      if (action === "e3-get-final-reveal") {
        const { data: matchRow } = await supabase.from("event3_matches").select("phase2_partner,phase3_partner,phase2_word,phase3_word,phase2_score,phase3_score,match_preference").eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber).single()
        if (!matchRow) return res.status(404).json({ error: "No match data found" })
        const partnerNums = [matchRow.phase2_partner, matchRow.phase3_partner].filter(Boolean)
        const { data: partners } = await supabase.from("participants").select("assigned_number,name,survey_data").eq("match_id", MAIN_MATCH).in("assigned_number", partnerNums)
        const pMap = {}
        for (const p of partners || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); pMap[p.assigned_number] = firstName(p.name || sd?.answers?.name || sd?.name) }
        // Helper to fetch breakdown from cache for a pair
        const getBreakdown = async (partnerNum) => {
          if (!partnerNum) return null
          const [pa, pb] = [myNumber, partnerNum].sort((x, y) => x - y)
          const { data: cacheRow } = await supabase.from("compatibility_cache").select("*").eq("participant_a_number", pa).eq("participant_b_number", pb).order("last_used", { ascending: false }).limit(1).single()
          if (!cacheRow) return null
          const coreScaled5 = Math.round((parseFloat(cacheRow.core_values_score) / 20) * 5)
          const humorOpen = Math.max(0, Math.round(parseFloat(cacheRow.total_compatibility_score) - parseFloat(cacheRow.interaction_synergy_score) - parseFloat(cacheRow.ai_vibe_score) - parseFloat(cacheRow.lifestyle_score) - parseFloat(cacheRow.communication_score) - coreScaled5))
          return {
            synergy: Math.round(parseFloat(cacheRow.interaction_synergy_score)),
            vibe: Math.round(parseFloat(cacheRow.ai_vibe_score)),
            lifestyle: Math.round(parseFloat(cacheRow.lifestyle_score)),
            humorOpen,
            communication: Math.round(parseFloat(cacheRow.communication_score)),
            coreValues: coreScaled5,
            intent: Math.round(parseFloat(cacheRow.intent_goal_score) || 0),
            total: Math.round(parseFloat(cacheRow.total_compatibility_score)),
          }
        }
        // Fetch breakdowns and current_event_id in parallel
        const [phase2Breakdown, phase3Breakdown, eventStateRow] = await Promise.all([
          getBreakdown(matchRow.phase2_partner),
          getBreakdown(matchRow.phase3_partner),
          supabase.from("event_state").select("current_event_id").eq("match_id", MAIN_MATCH).single().then(r => r.data),
        ])
        return res.status(200).json({
          phase2: { partner_number: matchRow.phase2_partner, partner_first_name: pMap[matchRow.phase2_partner] || "—", word: matchRow.phase2_word || null, compatibility_score: phase2Breakdown?.total ?? matchRow.phase2_score ?? 0, breakdown: phase2Breakdown },
          phase3: { partner_number: matchRow.phase3_partner, partner_first_name: pMap[matchRow.phase3_partner] || "—", compatibility_score: phase3Breakdown?.total ?? matchRow.phase3_score ?? 0, word: matchRow.phase3_word || null, breakdown: phase3Breakdown },
          same_match: matchRow.phase2_partner && matchRow.phase2_partner === matchRow.phase3_partner,
          match_preference: matchRow.match_preference || null,
          current_event_id: eventStateRow?.current_event_id || 1
        })
      }

      // e3-get-notes
      if (action === "e3-get-notes") {
        const { data } = await supabase
          .from("event3_participant_notes")
          .select("about_number,note")
          .eq("match_id", E3_MATCH_ID)
          .eq("participant_number", myNumber)
          .is("phase", null)
        const noteMap = {}
        for (const r of data || []) noteMap[r.about_number] = r.note
        return res.status(200).json({ notes: noteMap })
      }

      // e3-save-note
      if (action === "e3-save-note") {
        const { about_number, note } = req.body
        if (!about_number) return res.status(400).json({ error: "about_number required" })
        const trimmed = (note || "").trim()
        await supabase.from("event3_participant_notes")
          .delete()
          .eq("match_id", E3_MATCH_ID)
          .eq("participant_number", myNumber)
          .eq("about_number", about_number)
          .is("phase", null)
        if (trimmed) {
          const { error } = await supabase.from("event3_participant_notes")
            .insert({ match_id: E3_MATCH_ID, participant_number: myNumber, about_number, note: trimmed })
          if (error) return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ ok: true })
      }

      // e3-get-my-group: returns the participant's current-round group for groups.tsx
      if (action === "e3-get-my-group") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        // Check enrolled in event3
        const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", E3_MATCH_ID).eq("participant_number", myNumber).maybeSingle()
        if (!ep) return res.status(200).json({ group: null })
        // Determine current round from event phase
        const { data: stateRow } = await supabase.from("event_state").select("phase").eq("match_id", E3_MATCH_ID).maybeSingle()
        const phase = stateRow?.phase || "round1"
        const roundMatch = phase.match(/^round(\d)$/)
        const currentRound = roundMatch ? parseInt(roundMatch[1]) : 1
        // Get their table assignment for this round
        const { data: assignment } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("round", currentRound).eq("participant_id", myNumber).maybeSingle()
        if (!assignment) return res.status(200).json({ group: null })
        // Get all tablemates
        const { data: tablemates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", E3_MATCH_ID).eq("round", currentRound).eq("table_number", assignment.table_number)
        const nums = (tablemates || []).map(r => r.participant_id)
        const { data: pdata } = await supabase.from("participants").select("assigned_number,name,gender,survey_data").eq("match_id", MAIN_MATCH).in("assigned_number", nums)
        const nameMap = {}
        for (const p of pdata || []) {
          const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
          nameMap[p.assigned_number] = { name: p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`, gender: p.gender || sd?.answers?.gender || sd?.gender || null }
        }
        const members = nums.map(n => ({ number: n, ...(nameMap[n] || { name: `#${n}`, gender: null }) }))
        return res.status(200).json({ group: { table_number: assignment.table_number, members } })
      }

      // e3-sos — participant requests organizer to come to their table or sends a chat message
      if (action === "e3-sos") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { message, request_type } = req.body
        const sd = typeof participant.survey_data === "string" ? JSON.parse(participant.survey_data || "{}") : (participant.survey_data || {})
        const fullName = participant.name || sd?.answers?.name || sd?.name || ""
        const pName = firstName(fullName)
        const { data: stateRow } = await supabase.from("event_state").select("phase").eq("match_id", E3_MATCH_ID).maybeSingle()
        const phase = stateRow?.phase || "setup"
        let tableInfo = phase
        const roundMatch = phase.match(/^round(\d)$/)
        if (roundMatch) {
          const { data: sa } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("round", parseInt(roundMatch[1])).eq("participant_id", myNumber).maybeSingle()
          if (sa) tableInfo = `الجولة ${roundMatch[1]} · طاولة ${sa.table_number}`
        } else if (phase === "phase2_reveal") { tableInfo = "كشف المرحلة 2" }
        else if (phase === "phase3_reveal") { tableInfo = "كشف المرحلة 3" }

        const reqType = request_type || 'chat'
        const now = new Date().toISOString()
        const chatEntry = { from: 'user', text: message || '', timestamp: now }

        // Check for existing active (non-resolved) request from this participant
        const { data: existing } = await supabase.from("organizer_requests")
          .select("id,chat_history")
          .eq("participant_token", token)
          .neq("status", "resolved")
          .order("created_at", { ascending: false })
          .limit(1)

        if (existing && existing.length > 0) {
          // Append to existing conversation
          const existingChat = Array.isArray(existing[0].chat_history) ? existing[0].chat_history : []
          const updatedChat = [...existingChat, chatEntry]
          const { error: updErr } = await supabase.from("organizer_requests").update({
            message: message || null,
            status: "pending",
            table_info: tableInfo,
            chat_history: updatedChat,
            updated_at: now
          }).eq("id", existing[0].id)
          if (updErr) return res.status(500).json({ error: updErr.message })
          return res.status(200).json({ id: existing[0].id, status: "pending" })
        }

        // Create new request
        const { data: inserted, error: insErr } = await supabase.from("organizer_requests").insert({
          participant_token: token, participant_number: myNumber, participant_name: pName,
          table_info: tableInfo, message: message || null, status: "pending",
          request_type: reqType, chat_history: [chatEntry]
        }).select("id").single()
        if (insErr) return res.status(500).json({ error: insErr.message })
        return res.status(200).json({ id: inserted.id, status: "pending" })
      }

      // e3-sos-check — poll all SOS requests for this user (chat history)
      if (action === "e3-sos-check") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { data: requests } = await supabase.from("organizer_requests").select("id,status,message,organizer_reply,created_at,chat_history,request_type,table_info").eq("participant_token", token).order("created_at", { ascending: true })
        return res.status(200).json({ requests: requests || [] })
      }

      // e3-get-mood-check — poll for pending mood check
      if (action === "e3-get-mood-check") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { data: pending } = await supabase.from("event3_mood_checks")
          .select("check_id,triggered_at")
          .eq("match_id", E3_MATCH_ID)
          .eq("participant_number", myNumber)
          .is("mood", null)
          .order("triggered_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!pending) return res.status(200).json({ pending: false })
        return res.status(200).json({ pending: true, check_id: pending.check_id, triggered_at: pending.triggered_at })
      }

      // e3-submit-mood-check
      if (action === "e3-submit-mood-check") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { check_id, mood } = req.body
        if (!check_id) return res.status(400).json({ error: "check_id required" })
        if (!["happy", "neutral", "not_great", "expired"].includes(mood)) return res.status(400).json({ error: "Invalid mood" })
        const { error } = await supabase.from("event3_mood_checks")
          .update({ mood, answered_at: new Date().toISOString() })
          .eq("match_id", E3_MATCH_ID)
          .eq("check_id", check_id)
          .eq("participant_number", myNumber)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Mood submitted" })
      }

      // e3-get-notification — poll for unseen notification
      if (action === "e3-get-notification") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { data: pending } = await supabase.from("event3_notifications")
          .select("notif_id,title,body,icon,created_at")
          .eq("match_id", E3_MATCH_ID)
          .eq("participant_number", myNumber)
          .is("seen_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!pending) return res.status(200).json({ pending: false })
        return res.status(200).json({ pending: true, notif_id: pending.notif_id, title: pending.title, body: pending.body, icon: pending.icon, created_at: pending.created_at })
      }

      // e3-dismiss-notification — mark as seen
      if (action === "e3-dismiss-notification") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { notif_id } = req.body
        if (!notif_id) return res.status(400).json({ error: "notif_id required" })
        const { error } = await supabase.from("event3_notifications")
          .update({ seen_at: new Date().toISOString() })
          .eq("match_id", E3_MATCH_ID)
          .eq("notif_id", notif_id)
          .eq("participant_number", myNumber)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ message: "Notification seen" })
      }

      return res.status(400).json({ error: `Unknown e3 action: ${action}` })
    } catch (e3err) {
      console.error("e3 participant error:", e3err)
      return res.status(500).json({ error: e3err.message || "Internal server error" })
    }
  }

  return res.status(400).json({ error: 'Invalid action' })
}
