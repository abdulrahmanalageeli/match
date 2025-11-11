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

    // Get current participant data
    const { data: currentData, error: fetchError } = await supabase
      .from("participants")
      .select("survey_data, name, phone_number, age, gender")
      .eq("match_id", STATIC_MATCH_ID)
      .eq("assigned_number", participantNumber)
      .single()

    if (fetchError || !currentData) {
      console.error("Error fetching participant:", fetchError)
      return res.status(404).json({ error: "Participant not found" })
    }

    // Determine which fields need updating
    let updateData = {}
    
    // Direct database fields
    const directFields = ['name', 'phone_number', 'age', 'gender']
    
    if (directFields.includes(field)) {
      updateData[field] = value
    }

    // Survey data fields - update in the JSON
    const surveyData = { ...currentData.survey_data }
    if (!surveyData.answers) {
      surveyData.answers = {}
    }
    
    // Update the field in survey_data.answers
    surveyData.answers[field] = value
    updateData.survey_data = surveyData

    // Special handling for gender - update both places
    if (field === 'gender') {
      surveyData.gender = value
      surveyData.answers.gender = value
      updateData.survey_data = surveyData
      updateData.gender = value
    }

    // Special handling for age
    if (field === 'age') {
      updateData.age = value
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
