import { supabaseAdmin } from "../../server/security/supabase-admin.mjs"
import { enforceRateLimit, requireAdmin } from "../../server/security/request-security.mjs"

const supabase = supabaseAdmin

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

const normalizeChoice = (value, allowed, field) => {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!allowed.includes(normalized)) {
    throw new Error(`${field} must be one of ${allowed.join(', ')}`)
  }
  return normalized
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }
  if (!enforceRateLimit(req, res, { key: "admin-participant-update", limit: 60, windowMs: 60_000 })) return
  if (!await requireAdmin(req, res, { action: "admin-update-participant" })) return

  try {
    const { participantNumber, field, value } = req.body

    if (!participantNumber || !field) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    console.log(`🔄 Updating field "${field}" for participant #${participantNumber} to:`, value)

    // Basic server-side validations/sanitization
    let normalizedValue = value

    const choiceFields = {
      match_disagreement_style: ['A', 'B', 'C', 'D'],
      match_similarity_preference: ['A', 'B', 'C', 'D'],
      conversation_initiative_preference: ['A', 'B', 'C', 'D'],
      conversational_role: ['A', 'B', 'C'],
      conversation_depth_pref: ['A', 'B'],
      social_battery: ['A', 'B'],
      humor_subtype: ['A', 'B', 'C'],
      curiosity_style: ['A', 'B', 'C'],
      silence_comfort: ['A', 'B']
    }

    if (choiceFields[field]) {
      try {
        normalizedValue = normalizeChoice(value, choiceFields[field], field)
      } catch (error) {
        return res.status(400).json({ error: error.message })
      }
    }

    if (field === 'match_current_curiosity') {
      normalizedValue = String(value ?? '').trim()
      if (normalizedValue.length < 20 || normalizedValue.length > 150) {
        return res.status(400).json({ error: 'match_current_curiosity must be between 20 and 150 characters' })
      }
    }

    if (field === 'match_current_focus') {
      const allowedFocus = ['study', 'career', 'business', 'family_social', 'health_fitness', 'creative', 'travel_experiences', 'self_growth', 'other']
      const focus = Array.isArray(value) ? [...new Set(value.map(item => String(item)))] : []
      if (focus.length !== 2 || focus.some(item => !allowedFocus.includes(item))) {
        return res.status(400).json({ error: 'match_current_focus must contain exactly two valid selections' })
      }
      normalizedValue = focus
    }

    if (field === 'age_flex_one_year') {
      normalizedValue = String(value ?? '').trim().toLowerCase()
      if (!['accept', 'decline', 'not_applicable'].includes(normalizedValue)) {
        return res.status(400).json({ error: 'age_flex_one_year must be accept, decline, or not_applicable' })
      }
    }

    if (field === 'nationality_preference') {
      normalizedValue = String(value ?? '').trim().toLowerCase()
      if (!['same', 'any'].includes(normalizedValue)) {
        return res.status(400).json({ error: 'nationality_preference must be same or any' })
      }
    }

    if (field === 'gender_preference') {
      normalizedValue = String(value ?? '').trim().toLowerCase()
      if (!['male', 'female', 'any'].includes(normalizedValue)) {
        return res.status(400).json({ error: 'gender_preference must be male, female, or any' })
      }
    }
    // Age validation (keep as-is)
    if (field === 'age') {
      const ageInt = parseInt(value, 10)
      if (!Number.isFinite(ageInt)) {
        return res.status(400).json({ error: 'Age must be a number' })
      }
      if (ageInt < 18 || ageInt > 65) {
        return res.status(400).json({ error: 'Age must be between 18 and 65' })
      }
      normalizedValue = ageInt
    }

    // Preferred age min/max normalization (numbers 18..65)
    if (field === 'preferred_age_min' || field === 'preferred_age_max') {
      const intVal = parseInt(value, 10)
      if (!Number.isFinite(intVal)) {
        return res.status(400).json({ error: `${field} must be a number` })
      }
      if (intVal < 18 || intVal > 65) {
        return res.status(400).json({ error: `${field} must be between 18 and 65` })
      }
      normalizedValue = intVal
    }

    // Boolean coercion for open flags
    if (field === 'open_age_preference' || field === 'open_intent_goal_mismatch') {
      const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1'
      normalizedValue = truthy(value)
    }

    // Humor/banter style normalization (A|B|C|D)
    if (field === 'humor_banter_style') {
      let s = ''
      try { s = String(value ?? '').trim().toUpperCase() } catch (_) { s = '' }
      if (s && !['A', 'B', 'C', 'D'].includes(s)) {
        return res.status(400).json({ error: 'humor_banter_style must be one of A, B, C, or D' })
      }
      normalizedValue = s
    }

    // Early openness comfort normalization (0-3)
    if (field === 'early_openness_comfort') {
      const intVal = parseInt(value, 10)
      if (!Number.isFinite(intVal) || intVal < 0 || intVal > 3) {
        return res.status(400).json({ error: 'early_openness_comfort must be between 0 and 3' })
      }
      normalizedValue = intVal
    }

    // Intent goal normalization + validation (A|B|C)
    if (field === 'intent_goal') {
      let s = ''
      try { s = String(value ?? '').trim().toUpperCase() } catch (_) { s = '' }
      if (s && !['A', 'B', 'C'].includes(s)) {
        return res.status(400).json({ error: 'intent_goal must be one of A, B, or C' })
      }
      normalizedValue = s
    }

    // Get current participant data
    const { data: currentData, error: fetchError } = await supabase
      .from("participants")
      .select("survey_data, name, phone_number, age, gender, nationality, prefer_same_nationality, same_gender_preference, any_gender_preference, preferred_age_min, preferred_age_max, open_age_preference, open_intent_goal_mismatch, intent_goal, humor_banter_style, early_openness_comfort, age_flex_one_year, conversational_role, conversation_depth_pref, social_battery, humor_subtype, curiosity_style, silence_comfort")
      .eq("match_id", STATIC_MATCH_ID)
      .eq("assigned_number", participantNumber)
      .single()

    if (fetchError || !currentData) {
      console.error("Error fetching participant:", fetchError)
      return res.status(404).json({ error: "Participant not found" })
    }

    // Cross-field validation for preferred age range (min <= max when both set)
    if (field === 'preferred_age_min' || field === 'preferred_age_max') {
      const currentMin = field === 'preferred_age_min' ? normalizedValue : currentData.preferred_age_min
      const currentMax = field === 'preferred_age_max' ? normalizedValue : currentData.preferred_age_max
      if (typeof currentMin === 'number' && typeof currentMax === 'number') {
        if (currentMin > currentMax) {
          return res.status(400).json({ error: 'preferred_age_min must be less than or equal to preferred_age_max' })
        }
      }
    }

    // Determine which fields need updating
    let updateData = {}
    
    // Direct database fields (also mirrored in survey_data.answers)
    const directFields = [
      'name',
      'phone_number',
      'age',
      'gender',
      'nationality',
      'preferred_age_min',
      'preferred_age_max',
      'open_age_preference',
      'open_intent_goal_mismatch',
      'intent_goal',
      'humor_banter_style',
      'early_openness_comfort',
      'conversational_role',
      'conversation_depth_pref',
      'social_battery',
      'humor_subtype',
      'curiosity_style',
      'silence_comfort'
    ]
    
    if (directFields.includes(field)) {
      updateData[field] = normalizedValue
    }

    // Survey data fields - update in the JSON
    const surveyData = { ...currentData.survey_data }
    if (!surveyData.answers) {
      surveyData.answers = {}
    }
    
    // Update the field in survey_data.answers
    surveyData.answers[field] = normalizedValue
    updateData.survey_data = surveyData

    if (field === 'nationality_preference') {
      updateData.prefer_same_nationality = normalizedValue === 'same'
    }

    if (field === 'age_flex_one_year') {
      updateData.age_flex_one_year = normalizedValue === 'accept'
        ? true
        : normalizedValue === 'decline' ? false : null
    }

    if (field === 'gender_preference') {
      const participantGender = currentData.gender || currentData.survey_data?.answers?.gender || currentData.survey_data?.gender
      updateData.same_gender_preference = normalizedValue !== 'any' && normalizedValue === participantGender
      updateData.any_gender_preference = normalizedValue === 'any'
    }

    // Special handling for gender - update both places
    if (field === 'gender') {
      surveyData.gender = normalizedValue
      surveyData.answers.gender = normalizedValue
      updateData.survey_data = surveyData
      updateData.gender = normalizedValue
    }

    // Special handling for age
    if (field === 'age') {
      updateData.age = normalizedValue
    }

    // Update the participant
    const { error: updateError } = await supabase
      .from("participants")
      .update(updateData)
      .eq("match_id", STATIC_MATCH_ID)
      .eq("assigned_number", participantNumber)

    if (updateError) {
      console.error("Error updating participant:", updateError)
      return res.status(500).json({ error: "Failed to update participant" })
    }

    console.log(`✅ Successfully updated field "${field}" for participant #${participantNumber}`)

    // Log to survey_change_history if any answer actually changed
    try {
      const oldAnswers = currentData.survey_data?.answers || {}
      const newAnswers = surveyData.answers || {}
      const allKeys = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])
      const changedFields = [...allKeys].filter(k => JSON.stringify(oldAnswers[k]) !== JSON.stringify(newAnswers[k]))
      if (changedFields.length > 0) {
        const changePercentage = Math.round((changedFields.length / allKeys.size) * 100)
        const suspiciousFlags = []
        const genderLabels = { male: 'ذكر', female: 'أنثى' }
        if (changedFields.includes('gender') && oldAnswers.gender && newAnswers.gender && oldAnswers.gender !== newAnswers.gender)
          suspiciousFlags.push({ level: 'high', code: 'gender_change', message: `تغيير الجنس: ${genderLabels[oldAnswers.gender] || oldAnswers.gender} ← ${genderLabels[newAnswers.gender] || newAnswers.gender}` })
        const oldAge = oldAnswers.age ?? oldAnswers.ageGroup
        const newAge = newAnswers.age ?? newAnswers.ageGroup
        if (oldAge != null && newAge != null) {
          const diff = Math.abs(parseInt(newAge) - parseInt(oldAge))
          if (!isNaN(diff) && diff > 2) suspiciousFlags.push({ level: 'medium', code: 'age_change', message: `تغيير العمر بمقدار ${diff}: ${oldAge} ← ${newAge}` })
        }
        if (changedFields.includes('mbtiType') && oldAnswers.mbtiType && newAnswers.mbtiType)
          suspiciousFlags.push({ level: 'medium', code: 'mbti_change', message: `تغيير نوع MBTI: ${oldAnswers.mbtiType} ← ${newAnswers.mbtiType}` })
        const prevFiltered = {}, newFiltered = {}
        changedFields.forEach(k => { prevFiltered[k] = oldAnswers[k]; newFiltered[k] = newAnswers[k] })
        await supabase.from('survey_change_history').insert({
          participant_number: participantNumber, match_id: STATIC_MATCH_ID,
          previous_answers: prevFiltered, new_answers: newFiltered,
          changed_fields: changedFields, change_percentage: changePercentage, suspicious_flags: suspiciousFlags
        })
      }
    } catch (histErr) { console.error('Failed to log survey change history:', histErr) }

    return res.status(200).json({
      success: true,
      message: `Updated ${field} successfully`,
      participantNumber,
      field,
      value: normalizedValue
    })

  } catch (error) {
    console.error("Error in update-participant-field:", error)
    return res.status(500).json({ error: "Failed to process request" })
  }
}
