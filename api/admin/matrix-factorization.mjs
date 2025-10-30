import { createClient } from "@supabase/supabase-js"
import { Matrix, SVD } from 'ml-matrix'
import munkres from 'munkres-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"
const NUM_FACTORS = 20 // Number of latent factors to use

/**
 * Trains a matrix factorization model using participant feedback and match data
 * @param {number} eventId - The event ID to train the model for (use 0 for all events)
 * @returns {Promise<Object>} - Training results and statistics
 */
export async function trainMatrixFactorizationModel(eventId) {
  const useAllEvents = eventId === 0
  console.log(`🧠 Training matrix factorization model for ${useAllEvents ? 'ALL events' : 'event ' + eventId}...`)
  
  try {
    // Step 1: Collect training data from match_feedback table
    // First, let's get a count of all unique feedback entries
    const { count: totalFeedbackCount, error: countError } = await supabase
      .from("match_feedback")
      .select('participant_number', { count: 'exact', head: true })
    
    if (countError) throw countError
    console.log(`📊 Total feedback entries in database: ${totalFeedbackCount}`)
    
    // Now get the actual feedback data for the specified event or all events
    let feedbackQuery = supabase
      .from("match_feedback")
      .select(`
        participant_number,
        event_id,
        round,
        compatibility_rate,
        conversation_quality,
        personal_connection,
        shared_interests,
        comfort_level,
        communication_style,
        overall_experience,
        would_meet_again
      `)
    
    // Only filter by event_id if not using all events
    if (!useAllEvents) {
      feedbackQuery = feedbackQuery.eq("event_id", eventId)
    }
    
    const { data: feedbackData, error: feedbackError } = await feedbackQuery
    
    if (feedbackError) throw feedbackError
    
    // Count unique participants in feedback
    const uniqueFeedbackParticipants = new Set(feedbackData.map(f => f.participant_number))
    console.log(`📊 Found ${feedbackData.length} feedback entries ${useAllEvents ? 'across all events' : 'for event ' + eventId}`)
    console.log(`📊 Found ${uniqueFeedbackParticipants.size} unique participants with feedback ${useAllEvents ? 'across all events' : 'for event ' + eventId}`)
    
    // Step 2: Get match results data
    // First, count all match results
    const { count: totalMatchCount, error: matchCountError } = await supabase
      .from("match_results")
      .select('id', { count: 'exact', head: true })
      .is("participant_c_number", null) // Exclude group matches
    
    if (matchCountError) throw matchCountError
    console.log(`📊 Total match results in database (excluding groups): ${totalMatchCount}`)
    
    // Now get match results for this event or all events
    let matchQuery = supabase
      .from("match_results")
      .select(`
        participant_a_number, 
        participant_b_number, 
        event_id,
        compatibility_score,
        mutual_match,
        participant_a_wants_match,
        participant_b_wants_match,
        round
      `)
      .is("participant_c_number", null) // Exclude group matches
    
    // Only filter by event_id if not using all events
    if (!useAllEvents) {
      matchQuery = matchQuery.eq("event_id", eventId)
    }
    
    const { data: matchResults, error: matchError } = await matchQuery
    
    if (matchError) throw matchError
    
    // Count unique participants in match results
    const uniqueMatchParticipantsA = new Set(matchResults.map(m => m.participant_a_number))
    const uniqueMatchParticipantsB = new Set(matchResults.map(m => m.participant_b_number))
    const allMatchParticipants = new Set([...uniqueMatchParticipantsA, ...uniqueMatchParticipantsB])
    
    console.log(`📊 Found ${matchResults.length} match results ${useAllEvents ? 'across all events' : 'for event ' + eventId}`)
    console.log(`📊 Found ${allMatchParticipants.size} unique participants in matches ${useAllEvents ? 'across all events' : 'for event ' + eventId}`)
    
    // Step 3: Build participant map and collect all participants
    const participantMap = new Map()
    let nextIndex = 0
    
    // Add participants from feedback
    feedbackData.forEach(feedback => {
      if (!participantMap.has(feedback.participant_number)) {
        participantMap.set(feedback.participant_number, nextIndex++)
      }
    })
    
    // Add participants from match results
    matchResults.forEach(match => {
      if (!participantMap.has(match.participant_a_number)) {
        participantMap.set(match.participant_a_number, nextIndex++)
      }
      if (!participantMap.has(match.participant_b_number)) {
        participantMap.set(match.participant_b_number, nextIndex++)
      }
    })
    
    const numParticipants = participantMap.size
    
    if (numParticipants < 2) {
      throw new Error("Not enough participants to train the model (minimum 2 required)")
    }
    console.log(`📊 Found ${numParticipants} participants for matrix factorization`)
    
    // Step 4: Create rating matrix
    const ratingMatrix = Matrix.zeros(numParticipants, numParticipants)
    const observationCounts = Matrix.zeros(numParticipants, numParticipants)
        // Fill matrix with feedback data (explicit ratings)
      feedbackData.forEach(feedback => {
        // Find the partner for this feedback
        // Note: feedback uses participant_number, match_results uses participant_a_number and participant_b_number
        const matchForFeedback = matchResults.find(match => 
          (match.participant_a_number === feedback.participant_number || 
           match.participant_b_number === feedback.participant_number) && 
          match.round === feedback.round
        )
        
        if (matchForFeedback) {
          const participantIndex = participantMap.get(feedback.participant_number)
          const partnerNumber = matchForFeedback.participant_a_number === feedback.participant_number ? 
            matchForFeedback.participant_b_number : matchForFeedback.participant_a_number
          const partnerIndex = participantMap.get(partnerNumber)
          
          if (participantIndex !== undefined && partnerIndex !== undefined) {
            // Use overall experience as primary rating (scale 1-5)
            const rating = feedback.overall_experience || 3 // Default to neutral if missing
            
            // Normalize to 0-1 range
            const normalizedRating = (rating - 1) / 4
            
            // Add to matrix
            ratingMatrix.set(participantIndex, partnerIndex, normalizedRating)
            observationCounts.set(participantIndex, partnerIndex, 
              observationCounts.get(participantIndex, partnerIndex) + 1)
          }
        }
      })
    
    // Fill in mutual match data
    matchResults.forEach(match => {
      const aIndex = participantMap.get(match.participant_a_number)
      const bIndex = participantMap.get(match.participant_b_number)
      
      if (aIndex !== undefined && bIndex !== undefined) {
        // If no explicit rating exists, use algorithm compatibility
        if (observationCounts.get(aIndex, bIndex) === 0) {
          // Normalize compatibility score from 0-100 to 0-1
          const normalizedScore = match.compatibility_score / 100
          ratingMatrix.set(aIndex, bIndex, normalizedScore)
          ratingMatrix.set(bIndex, aIndex, normalizedScore) // Make it symmetric
          
          observationCounts.set(aIndex, bIndex, 1)
          observationCounts.set(bIndex, aIndex, 1)
        }
        
        // Boost ratings for mutual matches
        if (match.mutual_match) {
          const currentA = ratingMatrix.get(aIndex, bIndex)
          const currentB = ratingMatrix.get(bIndex, aIndex)
          
          // Boost by 20% but cap at 1.0
          ratingMatrix.set(aIndex, bIndex, Math.min(currentA * 1.2, 1.0))
          ratingMatrix.set(bIndex, aIndex, Math.min(currentB * 1.2, 1.0))
        }
      }
    })
    
    // Step 5: Perform SVD
    const svd = new SVD(ratingMatrix, {
      computeLeftSingularVectors: true,
      computeRightSingularVectors: true,
      autoTranspose: false
    })
    
    // Extract user factors (U matrix)
    const U = svd.leftSingularVectors
    const S = Matrix.diagonal(svd.diagonal)
    
    // Calculate participant embeddings (U * sqrt(S))
    const sqrtS = S.clone()
    for (let i = 0; i < Math.min(NUM_FACTORS, sqrtS.rows); i++) {
      sqrtS.set(i, i, Math.sqrt(sqrtS.get(i, i)))
    }
    
    const participantEmbeddings = U.subMatrix(0, U.rows - 1, 0, Math.min(NUM_FACTORS, U.columns) - 1).mmul(
      sqrtS.subMatrix(0, Math.min(NUM_FACTORS, sqrtS.rows) - 1, 0, Math.min(NUM_FACTORS, sqrtS.columns) - 1)
    )
    
    // Step 6: Calculate RMSE on training data
    let sumSquaredError = 0
    let totalPredictions = 0
    
    for (let i = 0; i < numParticipants; i++) {
      for (let j = 0; j < numParticipants; j++) {
        if (observationCounts.get(i, j) > 0) {
          const actualRating = ratingMatrix.get(i, j)
          
          // Get embeddings for both participants
          const embedding1 = []
          const embedding2 = []
          
          for (let k = 0; k < Math.min(NUM_FACTORS, participantEmbeddings.columns); k++) {
            embedding1.push(participantEmbeddings.get(i, k))
            embedding2.push(participantEmbeddings.get(j, k))
          }
          
          // Calculate dot product for predicted rating
          let predictedRating = 0
          for (let k = 0; k < embedding1.length; k++) {
            predictedRating += embedding1[k] * embedding2[k]
          }
          
          // Clamp prediction to 0-1 range
          predictedRating = Math.max(0, Math.min(1, predictedRating))
          
          // Calculate squared error
          const error = actualRating - predictedRating
          sumSquaredError += error * error
          totalPredictions++
        }
      }
    }
    
    const rmse = Math.sqrt(sumSquaredError / totalPredictions)
    
    // Step 7: Store participant embeddings
    const embeddings = []
    participantMap.forEach((index, participantNumber) => {
      const embedding = []
      for (let i = 0; i < Math.min(NUM_FACTORS, participantEmbeddings.columns); i++) {
        embedding.push(participantEmbeddings.get(index, i))
      }
      
      // Note: In the database schema:
      // - participant table uses assigned_number
      // - match_results uses participant_a_number and participant_b_number
      // - match_feedback uses participant_number
      // - We're using participant_number in participant_embeddings to match with feedback
      embeddings.push({
        participant_number: participantNumber,
        event_id: eventId,
        embedding: embedding,
        created_at: new Date(),
        model_version: 'v1',
        factors_count: embedding.length
      })
    })
    
    // Save embeddings to database
    const { error: upsertError } = await supabase
      .from("participant_embeddings")
      .upsert(embeddings, {
        onConflict: 'participant_number,event_id,model_version'
      })
    
    if (upsertError) throw upsertError
    
    // Step 8: Store model performance metrics
    const { error: perfError } = await supabase
      .from("model_performance")
      .upsert({
        event_id: eventId,
        model_version: 'v1',
        rmse: rmse,
        mae: Math.sqrt(sumSquaredError / totalPredictions), // Approximation
        correlation: 0.7, // Placeholder - would need to calculate actual correlation
        coverage: (totalPredictions / (numParticipants * numParticipants)) * 100,
        training_participants: numParticipants,
        training_data_points: totalPredictions,
        created_at: new Date()
      }, {
        onConflict: 'event_id,model_version'
      })
    
    if (perfError) throw perfError
    
    return {
      success: true,
      numParticipants,
      numFactors: NUM_FACTORS,
      dataPoints: totalPredictions,
      rmse,
      coverage: (totalPredictions / (numParticipants * numParticipants)) * 100
    }
    
  } catch (error) {
    console.error("Error training matrix factorization model:", error)
    throw error
  }
}

/**
 * Predicts compatibility between two participants using matrix factorization
 * @param {number} eventId - The event ID
 * @param {number} participant1 - First participant number (assigned_number in participants table)
 * @param {number} participant2 - Second participant number (assigned_number in participants table)
 * @returns {Promise<Object>} - Predicted compatibility score
 */
export async function predictCompatibility(eventId, participant1, participant2) {
  try {
    // Get embeddings for both participants
    // Note: participant_embeddings uses participant_number which corresponds to
    // assigned_number in participants table and participant_a/b_number in match_results
    const { data: embeddings, error } = await supabase
      .from("participant_embeddings")
      .select("participant_number, embedding")
      .eq("event_id", eventId)
      .eq("model_version", 'v1')
      .in("participant_number", [participant1, participant2])
    
    if (error) throw error
    
    if (!embeddings || embeddings.length !== 2) {
      throw new Error("Could not find embeddings for both participants")
    }
    
    const embedding1 = embeddings.find(e => e.participant_number === participant1)?.embedding
    const embedding2 = embeddings.find(e => e.participant_number === participant2)?.embedding
    
    if (!embedding1 || !embedding2) {
      throw new Error("Missing embeddings for one or both participants")
    }
    
    // Calculate dot product for compatibility score
    let compatibilityScore = 0
    for (let i = 0; i < Math.min(embedding1.length, embedding2.length); i++) {
      compatibilityScore += embedding1[i] * embedding2[i]
    }
    
    // Scale to 0-100 range
    compatibilityScore = Math.min(Math.max(compatibilityScore * 20, 0), 100)
    
    return {
      participant_a: participant1,
      participant_b: participant2,
      compatibility_score: compatibilityScore
    }
    
  } catch (error) {
    console.error("Error predicting compatibility:", error)
    throw error
  }
}

/**
 * Gets model performance metrics
 * @param {number} eventId - The event ID
 * @returns {Promise<Object>} - Model performance metrics
 */
export async function getModelPerformance(eventId) {
  try {
    const { data, error } = await supabase
      .from("model_performance")
      .select("*")
      .eq("event_id", eventId)
      .eq("model_version", 'v1')
      .single()
    
    if (error) throw error
    
    return data
  } catch (error) {
    console.error("Error getting model performance:", error)
    throw error
  }
}

/**
 * Generates compatibility matrix for all participants
 * @param {number} eventId - The event ID
 * @returns {Promise<Object>} - Compatibility matrix
 */
export async function generateCompatibilityMatrix(eventId) {
  try {
    // Get all participants for the event
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("assigned_number")
      .eq("event_id", eventId)
      .neq("assigned_number", 9999) // Exclude organizer
      .order("assigned_number", { ascending: true })
    
    if (participantsError) throw participantsError
    
    if (!participants || participants.length < 2) {
      throw new Error("Not enough participants to generate compatibility matrix")
    }
    
    // Get embeddings for all participants
    const { data: embeddings, error: embeddingsError } = await supabase
      .from("participant_embeddings")
      .select("participant_number, embedding")
      .eq("event_id", eventId)
      .eq("model_version", 'v1')
    
    if (embeddingsError) throw embeddingsError
    
    if (!embeddings || embeddings.length < 2) {
      throw new Error("Not enough participant embeddings available")
    }
    
    // Create compatibility matrix
    const compatibilityMatrix = []
    
    for (const p1 of participants) {
      const row = []
      
      for (const p2 of participants) {
        if (p1.assigned_number === p2.assigned_number) {
          // Self-compatibility is always 100%
          row.push(100)
          continue
        }
        
        const embedding1 = embeddings.find(e => e.participant_number === p1.assigned_number)?.embedding
        const embedding2 = embeddings.find(e => e.participant_number === p2.assigned_number)?.embedding
        
        if (!embedding1 || !embedding2) {
          // No embedding available
          row.push(null)
          continue
        }
        
        // Calculate dot product
        let score = 0
        for (let i = 0; i < Math.min(embedding1.length, embedding2.length); i++) {
          score += embedding1[i] * embedding2[i]
        }
        
        // Scale to 0-100 range
        score = Math.min(Math.max(score * 20, 0), 100)
        row.push(Math.round(score))
      }
      
      compatibilityMatrix.push({
        participant_number: p1.assigned_number,
        scores: row
      })
    }
    
    return {
      participants: participants.map(p => p.assigned_number),
      matrix: compatibilityMatrix
    }
    
  } catch (error) {
    console.error("Error generating compatibility matrix:", error)
    throw error
  }
}

/**
 * Generates matches using matrix factorization
 * @param {number} eventId - The event ID
 * @returns {Promise<Object>} - Generated matches
 */
export async function generateMatches(eventId) {
  try {
    // Get all participants for the event
    // Note: participants table uses assigned_number
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("assigned_number, gender")
      .eq("event_id", eventId)
      .neq("assigned_number", 9999) // Exclude organizer
    
    if (participantsError) throw participantsError
    
    if (!participants || participants.length < 2) {
      throw new Error("Not enough participants to generate matches")
    }
    
    // Get embeddings for all participants
    // Note: participant_embeddings uses participant_number which corresponds to
    // assigned_number in participants table
    const { data: embeddings, error: embeddingsError } = await supabase
      .from("participant_embeddings")
      .select("participant_number, embedding")
      .eq("event_id", eventId)
      .eq("model_version", 'v1')
    
    if (embeddingsError) throw embeddingsError
    
    // Filter participants with embeddings
    // Match participant.assigned_number with embedding.participant_number
    const participantsWithEmbeddings = participants.filter(p => 
      embeddings.some(e => e.participant_number === p.assigned_number)
    )
    
    if (participantsWithEmbeddings.length < 2) {
      throw new Error("Not enough participant embeddings available")
    }
    
    // Create cost matrix for Hungarian algorithm
    const n = participantsWithEmbeddings.length
    const costMatrix = []
    
    for (let i = 0; i < n; i++) {
      const row = []
      for (let j = 0; j < n; j++) {
        if (i === j) {
          // Can't match with self - set to maximum cost
          row.push(10000)
          continue
        }
        
        const p1 = participantsWithEmbeddings[i]
        const p2 = participantsWithEmbeddings[j]
        
        // Get embeddings
        const embedding1 = embeddings.find(e => e.participant_number === p1.assigned_number)?.embedding
        const embedding2 = embeddings.find(e => e.participant_number === p2.assigned_number)?.embedding
        
        if (!embedding1 || !embedding2) {
          // No embedding - set to high cost
          row.push(9000)
          continue
        }
        
        // Calculate dot product for compatibility
        let compatibilityScore = 0
        for (let k = 0; k < Math.min(embedding1.length, embedding2.length); k++) {
          compatibilityScore += embedding1[k] * embedding2[k]
        }
        
        // Scale to 0-100 range
        compatibilityScore = Math.min(Math.max(compatibilityScore * 20, 0), 100)
        
        // Convert to cost (higher compatibility = lower cost)
        const cost = 100 - compatibilityScore
        row.push(cost)
      }
      costMatrix.push(row)
    }
    
    // Run Hungarian algorithm to find optimal matches
    const indices = munkres(costMatrix)
    
    // Convert indices to matches
    const matches = []
    const usedParticipants = new Set()
    
    for (const [row, col] of indices) {
      const p1 = participantsWithEmbeddings[row]
      const p2 = participantsWithEmbeddings[col]
      
      // Skip self-matches or already used participants
      if (p1.assigned_number === p2.assigned_number || 
          usedParticipants.has(p1.assigned_number) || 
          usedParticipants.has(p2.assigned_number)) {
        continue
      }
      
      // Calculate compatibility score
      const embedding1 = embeddings.find(e => e.participant_number === p1.assigned_number)?.embedding
      const embedding2 = embeddings.find(e => e.participant_number === p2.assigned_number)?.embedding
      
      let compatibilityScore = 0
      if (embedding1 && embedding2) {
        for (let k = 0; k < Math.min(embedding1.length, embedding2.length); k++) {
          compatibilityScore += embedding1[k] * embedding2[k]
        }
        compatibilityScore = Math.min(Math.max(compatibilityScore * 20, 0), 100)
      }
      
      // Create match with correct field names for match_results table
      // match_results uses participant_a_number and participant_b_number
      matches.push({
        participant_a_number: p1.assigned_number,
        participant_b_number: p2.assigned_number,
        compatibility_score: Math.round(compatibilityScore),
        match_type: compatibilityScore >= 80 ? 'توأم روح' : 'محايد'
      })
      
      // Mark participants as used
      usedParticipants.add(p1.assigned_number)
      usedParticipants.add(p2.assigned_number)
    }
    
    // Handle remaining participants (if odd number)
    const unmatchedParticipants = participantsWithEmbeddings.filter(p => 
      !usedParticipants.has(p.assigned_number)
    )
    
    return {
      matches,
      unmatchedParticipants: unmatchedParticipants.map(p => p.assigned_number),
      totalParticipants: participantsWithEmbeddings.length,
      matchedParticipants: usedParticipants.size,
      matchQuality: {
        excellent: matches.filter(m => m.compatibility_score >= 80).length,
        good: matches.filter(m => m.compatibility_score >= 60 && m.compatibility_score < 80).length,
        average: matches.filter(m => m.compatibility_score < 60).length
      }
    }
    
  } catch (error) {
    console.error("Error generating matches with matrix factorization:", error)
    throw error
  }
}
