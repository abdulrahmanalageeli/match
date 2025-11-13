import { OpenAI } from 'openai';

// IMPORTANT: Set your OpenAI API key in your environment variables.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  runtime: 'edge',
};

// Helper to create a summary of a match for the prompt
const createMatchSummary = (match) => {
  const userRatingA = match.feedback?.participant_a?.compatibility_rate;
  const userRatingB = match.feedback?.participant_b?.compatibility_rate;
  const avgUserRating = (userRatingA + userRatingB) / 2;

  return `
- Match (Round ${match.round}):
  - Participant A Answers: ${JSON.stringify(match.participant_a.survey_data?.answers)}
  - Participant B Answers: ${JSON.stringify(match.participant_b.survey_data?.answers)}
  - System Score: ${match.compatibility_score.toFixed(1)}%
  - Detailed System Scores: ${JSON.stringify(match.detailed_scores)}
  - User Feedback (A): ${userRatingA}/100
  - User Feedback (B): ${userRatingB}/100
  - Average User Rating: ${avgUserRating.toFixed(1)}%
  - Would Meet Again: ${match.feedback?.participant_a?.would_meet_again && match.feedback?.participant_b?.would_meet_again ? 'Yes (Mutual)' : 'No'}
  `;
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { matches, questions, weights } = await req.json();

    const highFeedbackMatches = matches.filter(m => {
        const avgRating = (m.feedback?.participant_a?.compatibility_rate + m.feedback?.participant_b?.compatibility_rate) / 2;
        return avgRating >= 80;
    });

    const lowFeedbackMatches = matches.filter(m => {
        const avgRating = (m.feedback?.participant_a?.compatibility_rate + m.feedback?.participant_b?.compatibility_rate) / 2;
        return avgRating < 50;
    });

    const prompt = `
      You are a world-class data analyst for a matchmaking service. Your task is to analyze a dataset of matches from events 4 to 7 and provide actionable insights to improve our algorithm.

      Here is the context for the data:
      
      1. SCORING WEIGHTS: These are the weights used to calculate the system's compatibility score.
      ${JSON.stringify(weights, null, 2)}

      2. SURVEY QUESTIONS: These are the questions asked to participants.
      ${JSON.stringify(questions, null, 2)}

      3. MATCH DATA:
      Here is a summary of successful matches (average user rating >= 80%):
      ${highFeedbackMatches.map(createMatchSummary).join('')}

      Here is a summary of failed matches (average user rating < 50%):
      ${lowFeedbackMatches.map(createMatchSummary).join('')}

      YOUR ANALYSIS TASK:
      Based on all the data provided, perform a deep analysis and answer the following in clear, well-structured markdown:

      1.  **What Went Right?** Analyze the successful matches. What are the strongest patterns in survey answers (both agreements and successful pairings) that correlate with high user ratings? Which compatibility factors are performing well?

      2.  **What Went Wrong?** Analyze the failed matches. Where is the algorithm overconfident (high system score, low user rating)? What answer patterns are red flags? Which compatibility factors are underperforming?

      3.  **Actionable Recommendations:** Provide a numbered list of specific, concrete suggestions to improve the matching algorithm. For example, 'Increase the weight for Core Values by 5%,' or 'Add a penalty for when one person is 'Spontaneous' and the other is a 'Planner' for the lifestyle_4 question.'
    `;

    const stream = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    return new Response(stream.toReadableStream(), {
      headers: { 'Content-Type': 'text/event-stream' }
    });

  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return new Response(JSON.stringify({ error: 'Failed to get AI analysis.' }), { status: 500 });
  }
}
