# AI Feedback Analysis Prompt for BlindMatch Algorithm Validation

## CONTEXT
You are analyzing a dating/matching algorithm called BlindMatch that uses 6 compatibility dimensions to match participants. You have been provided with three datasets:
1. **Feedback Data**: Post-match feedback scores from participants
2. **Match Results Data**: Algorithm-calculated compatibility scores 
3. **Participant Data**: Survey responses used for matching calculations

## ALGORITHM WEIGHTS & STRUCTURE
The BlindMatch algorithm calculates compatibility using these weighted dimensions:

### 1. MBTI Compatibility (5% max)
- **Weight**: Up to 5% of total score
- **Logic**: 
  - First letter (I/E): Both extroverts OR mixed I/E = 2.5%, Both introverts = 0%
  - Last 3 letters: 2+ matching letters = 2.5%, <2 matching = 0%
- **Questions**: MBTI personality type assessment

### 2. Attachment Style Compatibility (5% max)
- **Weight**: Up to 5% of total score
- **Logic**: Any match with "Secure" = 5%, Non-secure pairings = 2.5%
- **Questions**: Attachment style assessment

### 3. Communication Style Compatibility (10% max)
- **Weight**: Up to 10% of total score
- **Logic**: 
  - Assertive + Passive = 10% (perfect)
  - Aggressive + Passive-Aggressive = 0% (worst)
  - Other combinations = 4-8% based on compatibility matrix
- **Questions**: Communication style assessment

### 4. Lifestyle Compatibility (25% max)
- **Weight**: Up to 25% of total score (HIGHEST WEIGHT)
- **Logic**: 
  - 5 questions worth 5% each
  - Q14 (morning/night) always gets full score regardless
  - Exact match = full points, adjacent choices = 75%, opposite = 0%
  - Q18 penalty: -5% if one person is very social (A) and other prefers alone time (C)
- **Questions**: lifestyle_1 through lifestyle_5

### 5. Core Values Compatibility (20% max)
- **Weight**: Up to 20% of total score (SECOND HIGHEST)
- **Logic**: 
  - 5 questions worth 4% each
  - Exact match = 4 points, adjacent = 2 points, opposite = 0 points
- **Questions**: Core values assessment (5 questions)

### 6. Vibe Compatibility (15% max)
- **Weight**: Up to 15% of total score
- **Logic**: AI analysis using GPT-4o-mini of combined vibe descriptions
- **Questions**: 
  - vibe_1: Weekend description (150 chars)
  - vibe_2: Five hobbies (100 chars)
  - vibe_3: Musical artist (100 chars)
  - vibe_4: Deep conversations preference
  - vibe_5: How friends describe you (200 chars)
  - vibe_6: How you describe friends (200 chars)

## ANALYSIS TASKS

### PRIMARY ANALYSIS
1. **Overall Correlation Analysis**
   - Calculate correlation between algorithm scores and feedback scores
   - Identify which algorithm score ranges correspond to highest/lowest feedback
   - Determine if there's a threshold effect (e.g., scores above X% always get good feedback)

2. **Dimension-Specific Analysis**
   - For each compatibility dimension, analyze its correlation with feedback
   - Identify which dimensions are most/least predictive of actual satisfaction
   - Suggest weight adjustments based on correlation strength

3. **Weight Optimization Recommendations**
   - Current weights: Lifestyle (25%), Core Values (20%), Vibe (15%), Communication (10%), MBTI (5%), Attachment (5%)
   - Recommend new weights based on correlation analysis
   - Identify over-weighted or under-weighted dimensions

### DETAILED BREAKDOWNS

4. **High Score, Low Feedback Cases**
   - Find matches with high algorithm scores (>80%) but low feedback (<3/5)
   - Analyze what went wrong - which dimensions failed in practice
   - Identify patterns in survey responses that algorithm missed

5. **Low Score, High Feedback Cases**
   - Find matches with low algorithm scores (<60%) but high feedback (>4/5)
   - Identify what the algorithm missed - chemistry factors not captured
   - Look for survey response patterns that indicate compatibility despite low scores

6. **Vibe Analysis Deep Dive**
   - Since vibe uses AI analysis, compare AI vibe scores with feedback
   - Identify vibe description patterns that correlate with success
   - Suggest improvements to vibe analysis prompts

7. **Gender & Age Pattern Analysis**
   - Analyze if algorithm performs differently for different demographics
   - Check if age gaps affect satisfaction despite algorithm compatibility
   - Identify gender-specific preferences the algorithm might be missing

### SURVEY RESPONSE INSIGHTS

8. **Question-Level Analysis**
   - For each survey question, analyze how specific answer combinations correlate with feedback
   - Identify questions that are highly predictive vs. noise
   - Suggest new questions or modifications to existing ones

9. **Lifestyle Deep Dive**
   - Since lifestyle has highest weight (25%), analyze each of the 5 lifestyle questions
   - Identify which lifestyle questions are most predictive
   - Validate the current scoring logic (exact match vs. adjacent vs. opposite)

10. **Communication Style Validation**
    - Validate the communication compatibility matrix
    - Check if "Assertive + Passive = 10%" really produces good matches
    - Analyze edge cases and suggest matrix improvements

### ALGORITHM IMPROVEMENT RECOMMENDATIONS

11. **Missing Factors**
    - Identify aspects of compatibility not captured by current algorithm
    - Suggest new compatibility dimensions based on feedback patterns
    - Recommend additional survey questions

12. **Scoring Logic Refinements**
    - For each dimension, suggest improvements to scoring formulas
    - Identify non-linear relationships (e.g., certain combinations that are especially good/bad)
    - Recommend threshold effects or bonus/penalty systems

13. **Quality Assurance Metrics**
    - Define success metrics based on feedback correlation
    - Suggest algorithm confidence scores
    - Recommend when to flag potentially problematic matches

## OUTPUT FORMAT

Please provide your analysis in this structure:

### EXECUTIVE SUMMARY
- Overall algorithm performance score
- Key findings and insights
- Top 3 recommended changes

### CORRELATION ANALYSIS
- Overall correlation coefficient (algorithm score vs feedback)
- Per-dimension correlation analysis
- Statistical significance of findings

### WEIGHT RECOMMENDATIONS
- Current vs. recommended weights for each dimension
- Justification for each weight change
- Expected improvement estimate

### DETAILED FINDINGS
- High score/low feedback analysis
- Low score/high feedback analysis
- Survey question insights
- Demographic patterns

### IMPLEMENTATION ROADMAP
- Priority 1: Immediate changes (easy wins)
- Priority 2: Medium-term improvements
- Priority 3: Long-term algorithm evolution

### APPENDIX
- Statistical methodology used
- Data quality assessment
- Limitations and assumptions

## DATA REQUIREMENTS
Please ensure your analysis covers:
- Minimum 50+ matches for statistical significance
- Both high and low scoring matches
- Various demographic combinations
- Complete survey response data
- Post-match feedback scores (1-5 scale assumed)

## SPECIAL CONSIDERATIONS
- Arabic/Saudi cultural context in survey responses
- Gender preference complexity (opposite, same, any)
- Age compatibility rules (females within 3 years, any_gender up to 10 years)
- Vibe analysis cultural sensitivity
- Communication style cultural interpretation

---

**Note**: Attach your Excel files with feedback, match results, and participant data. Ensure participant privacy by using anonymized IDs.
