// Simple mock analysis API for testing
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    // Wait a moment to simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return a mock analysis
    const mockAnalysis = `
# Analysis of Matching Algorithm Performance

## What Went Right?

The algorithm shows strong performance in several areas:

- **Core Values Alignment**: Successful matches typically show high compatibility in core values (80%+ normalized score)
- **Lifestyle Preferences**: The lifestyle component is a strong predictor of success
- **Vibe Assessment**: The AI vibe assessment is accurately identifying compatible personalities

## What Went Wrong?

Several patterns emerged in unsuccessful matches:

- **MBTI Over-emphasis**: MBTI compatibility doesn't strongly correlate with user satisfaction
- **Attachment Style Mismatches**: Certain attachment style combinations consistently perform poorly
- **Algorithm Overconfidence**: System consistently overestimates compatibility by 15-20% in failed matches

## Actionable Recommendations

1. **Reduce MBTI Weight**: Decrease MBTI weight from 5% to 2%
2. **Increase Core Values Weight**: Increase from 20% to 25%
3. **Add Penalty for Extreme Lifestyle Differences**: Implement a 10% penalty when lifestyle_4 shows Planner vs. Spontaneous
4. **Refine Vibe Assessment**: Improve the AI prompt to better capture communication style compatibility
5. **Implement Feedback Loop**: Automatically adjust weights based on user feedback patterns
`;

    return new Response(mockAnalysis, {
      headers: { 'Content-Type': 'text/plain' }
    });

  } catch (error) {
    console.error('Error in analysis:', error);
    return new Response('Error generating analysis. Please try again.', { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
