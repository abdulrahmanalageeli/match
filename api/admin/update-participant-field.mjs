import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { participantNumber, field, value } = req.body

    if (!participantNumber || !field) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    console.log(`🔄 Updating field "${field}" for participant #${participantNumber} to:`, value)

    // Basic server-side validations/sanitization
    let normalizedValue = value
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
      .select("survey_data, name, phone_number, age, gender, preferred_age_min, preferred_age_max, open_age_preference, open_intent_goal_mismatch, intent_goal")
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
      'preferred_age_min',
      'preferred_age_max',
      'open_age_preference',
      'open_intent_goal_mismatch',
      'intent_goal'
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
      value
    })

  } catch (error) {
    console.error("Error in update-participant-field:", error)
    return res.status(500).json({ error: "Failed to process request" })
  }
}
