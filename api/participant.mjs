import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

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
        .select("id")
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

      // Format the match results and fetch partner information
      const history = await Promise.all((matches || []).map(async (match) => {
        // Determine which participant is the partner
        const isParticipantA = match.participant_a_number === participant.assigned_number
        const partnerNumber = isParticipantA ? match.participant_b_number : match.participant_a_number
        const wantsMatch = isParticipantA ? match.participant_a_wants_match : match.participant_b_wants_match
        const partnerWantsMatch = isParticipantA ? match.participant_b_wants_match : match.participant_a_wants_match
        
        // Fetch partner information from the same match_id
        let partnerInfo = null
        let partnerMessage = null
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
            const { data: feedbackData, error: feedbackError } = await supabase
              .from("match_feedback")
              .select("participant_message")
              .eq("match_id", match.match_id)
              .eq("participant_number", partnerNumber)
              .eq("round", match.round || 1)
              .eq("event_id", match.event_id || 1)
              .single()
            
            if (!feedbackError && feedbackData && feedbackData.participant_message) {
              partnerMessage = feedbackData.participant_message
            }
          } catch (err) {
            console.log(`[API] Could not fetch partner message for #${partnerNumber}:`, err)
          }
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
          round: match.round || 1,
          table_number: match.table_number,
          score: match.compatibility_score || 0,
          is_repeat_match: match.is_repeat_match || false,
          mutual_match: isMutualMatch,
          wants_match: wantsMatch,
          partner_wants_match: partnerWantsMatch,
          created_at: match.created_at,
          ai_personality_analysis: match.ai_personality_analysis || null,
          event_id: match.event_id,
          partner_message: partnerMessage,
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

  // CHECK IF PARTICIPANT HAS A VALID MATCH (not organizer #9999) FOR ROUND 1
  if (action === "has-valid-match") {
    try {
      const { secure_token, event_id: inputEventId } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

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

      // Look for any round 1 match with a real partner (not 9999)
      const { data: matches, error: matchesError } = await supabase
        .from("match_results")
        .select("participant_a_number, participant_b_number")
        .eq("match_id", match_id)
        .eq("event_id", eventId)
        .eq("round", 1)
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
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
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
        model: "gpt-4o-mini",
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
        max_tokens: 1500
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

  return res.status(400).json({ error: 'Invalid action' })
}
