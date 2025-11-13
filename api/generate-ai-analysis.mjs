import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    console.log('API Request received:', { 
      method: req.method,
      headers: req.headers,
      bodyType: typeof req.body,
      bodyLength: req.body ? (typeof req.body === 'string' ? req.body.length : 'object') : 'undefined'
    });
    
    // Parse the request body for Vercel serverless functions
    let body;
    try {
      body = req.body ? 
        (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : 
        {};
      console.log('Request body parsed successfully');
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body',
        details: parseError.message,
        receivedBody: typeof req.body === 'string' ? req.body.substring(0, 100) + '...' : 'Not a string'
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { matches, questions, weights } = body;
    console.log('Extracted from body:', { 
      matchesType: matches ? (Array.isArray(matches) ? 'array' : typeof matches) : 'undefined',
      matchesLength: matches && Array.isArray(matches) ? matches.length : 0,
      hasQuestions: !!questions,
      hasWeights: !!weights
    });
    
    // Validate input
    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid or empty matches data' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔍 Analyzing ${matches.length} matches with feedback data`);
    
    // Extract high and low feedback matches
    const highFeedbackMatches = matches.filter(m => {
      const avgFeedback = getAverageFeedbackScore(m);
      return avgFeedback >= 80;
    });
    
    const lowFeedbackMatches = matches.filter(m => {
      const avgFeedback = getAverageFeedbackScore(m);
      return avgFeedback < 50;
    });
    
    console.log(`📊 Found ${highFeedbackMatches.length} high feedback matches and ${lowFeedbackMatches.length} low feedback matches`);
    
    // Track participants across matches
    const participantStats = {};
    
    // Log participant identification information
    console.log(`Checking participant identification in ${matches.length} matches...`);
    const sampleMatch = matches[0];
    console.log('Sample match participant data:', {
      has_participant_a_number: !!sampleMatch?.participant_a_number,
      has_participant_b_number: !!sampleMatch?.participant_b_number,
      participant_a_number: sampleMatch?.participant_a_number,
      participant_b_number: sampleMatch?.participant_b_number,
    });
    
    // Process all matches to gather participant statistics
    let matchesWithParticipantNumbers = 0;
    matches.forEach(match => {
      // Extract participant numbers from the participant objects
      // First, let's log the participant structure to understand what's available
      if (matchesWithParticipantNumbers === 0) {
        console.log('Participant A structure:', {
          keys: match.participant_a ? Object.keys(match.participant_a) : 'undefined',
          number: match.participant_a?.number,
          id: match.participant_a?.id
        });
      }
      
      // Check if feedback contains participant numbers
      if (matchesWithParticipantNumbers === 0 && match.feedback) {
        console.log('Feedback structure:', {
          has_feedback: !!match.feedback,
          participant_a_feedback: match.feedback?.participant_a ? Object.keys(match.feedback.participant_a) : 'null',
          participant_b_feedback: match.feedback?.participant_b ? Object.keys(match.feedback.participant_b) : 'null',
          feedback_keys: match.feedback ? Object.keys(match.feedback) : 'null'
        });
      }
      
      // Try all possible locations for participant numbers
      let participantANumber = match.participant_a_number || 
                           match.participant_a?.assigned_number || 
                           match.participant_a?.number || 
                           (typeof match.participant_a === 'object' ? match.participant_a.id : null);
                           
      let participantBNumber = match.participant_b_number || 
                           match.participant_b?.assigned_number || 
                           match.participant_b?.number || 
                           (typeof match.participant_b === 'object' ? match.participant_b.id : null);
      
      // Try to extract from feedback if available
      if (!participantANumber && match.feedback?.participant_a?.participant_number) {
        participantANumber = match.feedback.participant_a.participant_number;
      }
      
      if (!participantBNumber && match.feedback?.participant_b?.participant_number) {
        participantBNumber = match.feedback.participant_b.participant_number;
      }
      
      // Last resort: try to find assigned_number in the participant object directly
      if (!participantANumber && match.participant_a) {
        // Log the full participant_a object to see its structure
        if (matchesWithParticipantNumbers === 0) {
          console.log('Full participant_a object:', JSON.stringify(match.participant_a).substring(0, 200) + '...');
        }
        
        // Try all possible field names for the assigned number
        if (match.participant_a.assigned_number) {
          participantANumber = match.participant_a.assigned_number;
        } else if (match.participant_a.survey_data && match.participant_a.survey_data.assigned_number) {
          participantANumber = match.participant_a.survey_data.assigned_number;
        } else if (match.participant_a.assigned_number_field) {
          participantANumber = match.participant_a.assigned_number_field;
        }
      }
      
      if (!participantBNumber && match.participant_b) {
        // Try all possible field names for the assigned number
        if (match.participant_b.assigned_number) {
          participantBNumber = match.participant_b.assigned_number;
        } else if (match.participant_b.survey_data && match.participant_b.survey_data.assigned_number) {
          participantBNumber = match.participant_b.survey_data.assigned_number;
        } else if (match.participant_b.assigned_number_field) {
          participantBNumber = match.participant_b.assigned_number_field;
        }
      }
      
      // Skip matches without participant numbers
      if (!participantANumber || !participantBNumber) {
        console.log('Skipping match without participant numbers:', {
          has_participant_a: !!match.participant_a,
          has_participant_b: !!match.participant_b,
          round: match.round,
          table: match.table_number
        });
        return;
      }
      
      // Store the extracted participant numbers in the match object for consistent access
      match.participant_a_number = participantANumber;
      match.participant_b_number = participantBNumber;
      matchesWithParticipantNumbers++;
      
      // Process participant A
      if (!participantStats[match.participant_a_number]) {
        participantStats[match.participant_a_number] = {
          matches: 0,
          avgFeedbackGiven: 0,
          avgFeedbackReceived: 0,
          totalFeedbackGiven: 0,
          totalFeedbackReceived: 0,
          wouldMeetAgainRate: 0
        };
      }
      
      // Process participant B
      if (!participantStats[match.participant_b_number]) {
        participantStats[match.participant_b_number] = {
          matches: 0,
          avgFeedbackGiven: 0,
          avgFeedbackReceived: 0,
          totalFeedbackGiven: 0,
          totalFeedbackReceived: 0,
          wouldMeetAgainRate: 0
        };
      }
      
      // Update participant A stats
      participantStats[match.participant_a_number].matches++;
      if (match.feedback?.participant_a?.compatibility_rate) {
        participantStats[match.participant_a_number].totalFeedbackGiven += match.feedback.participant_a.compatibility_rate;
        participantStats[match.participant_b_number].totalFeedbackReceived += match.feedback.participant_a.compatibility_rate;
      }
      
      // Update participant B stats
      participantStats[match.participant_b_number].matches++;
      if (match.feedback?.participant_b?.compatibility_rate) {
        participantStats[match.participant_b_number].totalFeedbackGiven += match.feedback.participant_b.compatibility_rate;
        participantStats[match.participant_a_number].totalFeedbackReceived += match.feedback.participant_b.compatibility_rate;
      }
      
      // Track would meet again preferences
      if (match.feedback?.participant_a?.would_meet_again) {
        participantStats[match.participant_a_number].wouldMeetAgainRate++;
      }
      if (match.feedback?.participant_b?.would_meet_again) {
        participantStats[match.participant_b_number].wouldMeetAgainRate++;
      }
    });
    
    // Calculate averages
    Object.keys(participantStats).forEach(participantNumber => {
      const stats = participantStats[participantNumber];
      if (stats.matches > 0) {
        stats.avgFeedbackGiven = stats.totalFeedbackGiven / stats.matches;
        stats.avgFeedbackReceived = stats.totalFeedbackReceived / stats.matches;
        stats.wouldMeetAgainRate = (stats.wouldMeetAgainRate / stats.matches) * 100;
      }
    });
    
    // Log participant tracking results
    console.log(`Participant tracking results: ${Object.keys(participantStats).length} unique participants found in ${matchesWithParticipantNumbers} matches with participant numbers.`);
    if (Object.keys(participantStats).length > 0) {
      const topParticipant = Object.entries(participantStats)
        .sort((a, b) => b[1].avgFeedbackReceived - a[1].avgFeedbackReceived)[0];
      console.log(`Top rated participant: #${topParticipant[0]} with ${topParticipant[1].avgFeedbackReceived.toFixed(1)}% average rating from ${topParticipant[1].matches} matches.`);
    }
    
    // Find top rated participants
    const topRatedParticipants = Object.entries(participantStats)
      .filter(([_, stats]) => stats.matches >= 2) // At least 2 matches
      .sort((a, b) => b[1].avgFeedbackReceived - a[1].avgFeedbackReceived)
      .slice(0, 5)
      .map(([number, stats]) => ({ 
        number: parseInt(number), 
        avgRating: stats.avgFeedbackReceived,
        matches: stats.matches,
        wouldMeetAgainRate: stats.wouldMeetAgainRate
      }));
    
    // Prepare data for analysis
    const analysisData = {
      totalMatches: matches.length,
      highFeedbackCount: highFeedbackMatches.length,
      lowFeedbackCount: lowFeedbackMatches.length,
      avgSystemScore: calculateAverage(matches, m => m.compatibility_score),
      avgUserRating: calculateAverage(matches, getAverageFeedbackScore),
      weights,
      questions,
      // Sample data from high and low matches
      highSamples: highFeedbackMatches.slice(0, 3).map(simplifyMatch),
      lowSamples: lowFeedbackMatches.slice(0, 3).map(simplifyMatch),
      // Participant statistics
      participantCount: Object.keys(participantStats).length,
      topRatedParticipants: topRatedParticipants,
      participantStats: Object.entries(participantStats)
        .filter(([_, stats]) => stats.matches >= 2)
        .slice(0, 10)
        .reduce((obj, [key, value]) => {
          obj[key] = value;
          return obj;
        }, {})
    };
    
    // Generate analysis using OpenAI
    console.log(`🤖 Calling OpenAI API (model: gpt-4o-mini)...`);
    const apiStartTime = Date.now();
    
    const systemMessage = `You are an expert dating algorithm analyst. Analyze the provided matching algorithm data and provide insights.
    Focus on:
    1. What patterns exist in successful vs unsuccessful matches?
    2. How well does the algorithm's compatibility score predict user satisfaction?
    3. Which compatibility factors are most predictive of success?
    4. What concrete changes would improve the algorithm?
    5. Are there any patterns related to specific participants across multiple matches?
    6. How do survey answers correlate with match success?
    
    Format your response as a markdown document with sections:
    - Summary of Findings
    - What Works Well
    - Areas for Improvement
    - Top Participants Analysis (if data available)
    - Survey Answer Patterns (if data available)
    - Specific Recommendations
    
    When analyzing participant data:
    - Look for participants who consistently receive high or low ratings
    - Identify if certain participants have unusually high 'would meet again' rates
    - Consider if the algorithm works better for specific types of participants
    - Suggest if studying top-rated participants could improve the matching algorithm
    
    When analyzing survey data:
    - Look for patterns in weekend activities, hobbies, and conversation preferences
    - Identify if certain MBTI types, attachment styles, or communication styles correlate with higher satisfaction
    - Check if similar or complementary traits lead to better matches
    - Consider how vibe-related answers (weekend activities, hobbies, music, etc.) correlate with match success
    
    Be specific, data-driven, and actionable. Use bullet points and clear headings.`;
    
    const userMessage = `Here is the matching algorithm data to analyze:
    
    ${JSON.stringify(analysisData, null, 2)}
    
    Please provide a comprehensive analysis of the algorithm's performance and specific recommendations for improvement.`;
    
    let analysis;
    
    try {
      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️ OpenAI API key not found. Using fallback analysis.');
        throw new Error('OpenAI API key not configured');
      }
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        max_tokens: 1500,
        temperature: 0.7
      });
      
      const apiDuration = Date.now() - apiStartTime;
      console.log(`✅ OpenAI API responded in ${apiDuration}ms`);
      
      analysis = completion.choices[0].message.content.trim();
    } catch (aiError) {
      console.error('Error calling OpenAI API:', aiError);
      console.log('Using fallback analysis instead');
      
      // Generate a fallback analysis based on the data we have
      analysis = generateFallbackAnalysis(analysisData);
    }
    
    // Log the first 500 characters of the analysis to see what's being returned
    console.log(`Analysis content (first 500 chars): ${analysis.substring(0, 500)}...`);
    console.log(`Analysis length: ${analysis.length} characters`);
    
    return new Response(analysis, {
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    console.error('Error in AI analysis:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Detailed error information
    let errorDetails = {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
    };
    
    if (error.response) {
      console.error('API response status:', error.response.status);
      console.error('API response data:', error.response.data);
      errorDetails.responseStatus = error.response.status;
      errorDetails.responseData = error.response.data;
    }
    
    // Return a more detailed error response
    return new Response(JSON.stringify({
      error: 'Error generating analysis',
      message: error.message,
      details: errorDetails
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper function to get average feedback score from a match
function getAverageFeedbackScore(match) {
  if (!match.feedback) return 0;
  
  const scores = [];
  if (match.feedback.participant_a?.compatibility_rate) {
    scores.push(match.feedback.participant_a.compatibility_rate);
  }
  if (match.feedback.participant_b?.compatibility_rate) {
    scores.push(match.feedback.participant_b.compatibility_rate);
  }
  
  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

// Helper function to calculate average for an array based on accessor function
function calculateAverage(array, accessor) {
  if (!array || array.length === 0) return 0;
  const sum = array.reduce((acc, item) => acc + accessor(item), 0);
  return sum / array.length;
}

// Helper function to simplify match data for analysis
function simplifyMatch(match) {
  // Extract key survey data points that might be relevant for analysis
  const extractSurveyHighlights = (participant) => {
    if (!participant || !participant.survey_data || !participant.survey_data.answers) {
      return null;
    }
    
    const answers = participant.survey_data.answers;
    return {
      // Extract key survey data points that might be relevant
      mbti: participant.mbti || 'Unknown',
      age: participant.age || 0,
      attachment_style: participant.attachment_style || 'Unknown',
      communication_style: participant.communication_style || 'Unknown',
      // Vibe-related answers (if available)
      weekend_activity: answers.vibe_1 || null,
      hobbies: answers.vibe_2 || null,
      music_preference: answers.vibe_3 || null,
      conversation_depth: answers.vibe_4 || null,
      self_description: answers.vibe_5 || null,
      friend_description: answers.vibe_6 || null,
    };
  };
  
  return {
    // Include participant identification information
    participant_a_number: match.participant_a_number,
    participant_b_number: match.participant_b_number,
    round: match.round,
    compatibility_score: match.compatibility_score,
    detailed_scores: match.detailed_scores || {},
    
    // Include survey highlights
    survey_data: {
      participant_a: extractSurveyHighlights(match.participant_a),
      participant_b: extractSurveyHighlights(match.participant_b)
    },
    
    // Include feedback data
    user_feedback: {
      participant_a: match.feedback?.participant_a ? {
        compatibility_rate: match.feedback.participant_a.compatibility_rate,
        conversation_quality: match.feedback.participant_a.conversation_quality,
        personal_connection: match.feedback.participant_a.personal_connection,
        would_meet_again: match.feedback.participant_a.would_meet_again
      } : null,
      participant_b: match.feedback?.participant_b ? {
        compatibility_rate: match.feedback.participant_b.compatibility_rate,
        conversation_quality: match.feedback.participant_b.conversation_quality,
        personal_connection: match.feedback.participant_b.personal_connection,
        would_meet_again: match.feedback.participant_b.would_meet_again
      } : null
    }
  };
}

// Fallback analysis function when OpenAI API is not available
function generateFallbackAnalysis(data) {
  // Calculate some basic statistics
  const systemVsUserDiff = data.avgSystemScore - data.avgUserRating;
  const systemAccuracy = 100 - Math.abs(systemVsUserDiff);
  
  // Find the best and worst performing factors
  let bestFactor = 'unknown';
  let worstFactor = 'unknown';
  
  if (data.radarData && data.radarData.length > 0) {
    // Find the factor with the biggest difference between high and low feedback
    const factorDiffs = data.radarData.map(item => ({
      factor: item.subject,
      diff: (item['High Feedback'] || 0) - (item['Low Feedback'] || 0)
    }));
    
    factorDiffs.sort((a, b) => b.diff - a.diff);
    bestFactor = factorDiffs[0]?.factor || 'unknown';
    worstFactor = factorDiffs[factorDiffs.length - 1]?.factor || 'unknown';
  }
  
  // Format top participants section
  let topParticipantsSection = '';
  if (data.topRatedParticipants && data.topRatedParticipants.length > 0) {
    topParticipantsSection = `
## Top Rated Participants

${data.topRatedParticipants.map((p, i) => 
  `${i+1}. **Participant #${p.number}**: ${p.avgRating.toFixed(1)}% average rating (${p.matches} matches, ${p.wouldMeetAgainRate.toFixed(0)}% would meet again)`
).join('\n')}

These participants consistently received high ratings from their matches, suggesting they may have qualities that make them particularly compatible with a wide range of partners.
`;
  }
  
  // Analyze survey data patterns
  let surveyPatternsSection = '';
  if (data.highSamples && data.highSamples.length > 0) {
    // Extract MBTI types from high-rated matches
    const mbtiPatterns = {};
    const attachmentPatterns = {};
    const communicationPatterns = {};
    
    // Process high-rated matches
    data.highSamples.forEach(match => {
      // MBTI patterns
      const mbtiA = match.survey_data?.participant_a?.mbti || 'Unknown';
      const mbtiB = match.survey_data?.participant_b?.mbti || 'Unknown';
      if (mbtiA !== 'Unknown' && mbtiB !== 'Unknown') {
        const mbtiPair = [mbtiA, mbtiB].sort().join('-');
        mbtiPatterns[mbtiPair] = (mbtiPatterns[mbtiPair] || 0) + 1;
      }
      
      // Attachment patterns
      const attachmentA = match.survey_data?.participant_a?.attachment_style || 'Unknown';
      const attachmentB = match.survey_data?.participant_b?.attachment_style || 'Unknown';
      if (attachmentA !== 'Unknown' && attachmentB !== 'Unknown') {
        const attachmentPair = [attachmentA, attachmentB].sort().join('-');
        attachmentPatterns[attachmentPair] = (attachmentPatterns[attachmentPair] || 0) + 1;
      }
      
      // Communication patterns
      const commA = match.survey_data?.participant_a?.communication_style || 'Unknown';
      const commB = match.survey_data?.participant_b?.communication_style || 'Unknown';
      if (commA !== 'Unknown' && commB !== 'Unknown') {
        const commPair = [commA, commB].sort().join('-');
        communicationPatterns[commPair] = (communicationPatterns[commPair] || 0) + 1;
      }
    });
    
    // Format the survey patterns section
    const formatTopPatterns = (patterns, title) => {
      const topPatterns = Object.entries(patterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      if (topPatterns.length === 0) return '';
      
      return `
### Top ${title} Combinations

${topPatterns.map(([pair, count]) => 
  `- **${pair}**: Found in ${count} high-rated ${count === 1 ? 'match' : 'matches'}`
).join('\n')}`;
    };
    
    surveyPatternsSection = `
## Survey Answer Patterns

${formatTopPatterns(mbtiPatterns, 'MBTI')}

${formatTopPatterns(attachmentPatterns, 'Attachment Style')}

${formatTopPatterns(communicationPatterns, 'Communication Style')}

These patterns suggest certain personality and communication style combinations may lead to higher compatibility ratings.
`;
  }
  
  // Generate a simple analysis
  return `
# Analysis of Matching Algorithm Performance

## Summary of Findings

This analysis is based on ${data.totalFeedback} matches with feedback data, including ${data.highFeedbackCount} high-rated matches (≥80%) and ${data.lowFeedbackCount} low-rated matches (<50%). A total of ${data.participantCount || 'unknown'} unique participants were analyzed.

- The algorithm's average predicted compatibility score is ${data.avgSystemScore.toFixed(1)}%
- Users' average satisfaction rating is ${data.avgUserRating.toFixed(1)}%
- Algorithm accuracy: ${systemAccuracy.toFixed(1)}%
- Meet again rate: ${data.meetAgainRate?.toFixed(1) || 'Unknown'}%

## What Works Well

- **${bestFactor}** appears to be the strongest predictor of match success
- The algorithm ${systemVsUserDiff > 0 ? 'tends to be optimistic' : 'is generally conservative'} in its predictions
- High-rated matches show consistent patterns in compatibility factors
${data.topRatedParticipants && data.topRatedParticipants.length > 0 ? '- Some participants consistently receive high ratings across multiple matches' : ''}

## Areas for Improvement

- **${worstFactor}** is not a strong predictor of match success and may need recalibration
- The algorithm ${Math.abs(systemVsUserDiff) > 10 ? 'significantly' : 'slightly'} ${systemVsUserDiff > 0 ? 'overestimates' : 'underestimates'} compatibility by ${Math.abs(systemVsUserDiff).toFixed(1)}%
- There's room to improve prediction accuracy based on user feedback

${topParticipantsSection}

${surveyPatternsSection}

## Specific Recommendations

1. **Adjust Weights**: ${systemVsUserDiff > 10 ? 'Decrease' : 'Increase'} the weight of ${bestFactor} by 5-10%
2. **Reduce Emphasis**: Consider reducing the weight of ${worstFactor} as it's less predictive
3. **Feedback Loop**: Implement an automatic feedback mechanism to continuously calibrate the algorithm
4. **Detailed Analysis**: Conduct a more detailed analysis with a larger dataset when available
${data.topRatedParticipants && data.topRatedParticipants.length > 0 ? '5. **Study Top Performers**: Analyze the profiles of top-rated participants to identify common traits that could improve matching' : ''}
${surveyPatternsSection ? '6. **Optimize for Compatible Types**: Consider adjusting the algorithm to favor the personality type combinations that show higher success rates' : ''}

*Note: This is a fallback analysis generated without the OpenAI API. For more detailed insights, please ensure the OpenAI API key is properly configured.*
`;
}
