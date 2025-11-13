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
    
    Format your response as a markdown document with sections:
    - Summary of Findings
    - What Works Well
    - Areas for Improvement
    - Specific Recommendations
    
    Be specific, data-driven, and actionable. Use bullet points and clear headings.`;
    
    const userMessage = `Here is the matching algorithm data to analyze:
    
    ${JSON.stringify(analysisData, null, 2)}
    
    Please provide a comprehensive analysis of the algorithm's performance and specific recommendations for improvement.`;
    
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
    
    const analysis = completion.choices[0].message.content.trim();
    
    return new Response(analysis, {
      headers: { 'Content-Type': 'text/plain' }
    });

  } catch (error) {
    console.error('Error in AI analysis:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.response) {
      console.error('API response status:', error.response.status);
      console.error('API response data:', error.response.data);
    }
    
    return new Response(`Error generating analysis: ${error.message}\nPlease try again or check server logs.`, { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
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
  return {
    compatibility_score: match.compatibility_score,
    detailed_scores: match.detailed_scores || {},
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
