import { useMemo, useState } from 'react';
import AIAnalysisModal from './AIAnalysisModal';
import { X, Lightbulb, BarChart3, Users, Star, HeartHandshake, TrendingUp, ThumbsUp, ThumbsDown, Target, Handshake, Sparkles, Loader } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

// --- TYPE DEFINITIONS ---
interface FeedbackData { compatibility_rate: number; conversation_quality: number; personal_connection: number; would_meet_again: boolean; }
interface ParticipantMatch {
  round: number;
  participant_a: { mbti: string; age: number; survey_data?: { answers?: Record<string, any> } };
  participant_b: { mbti: string; age: number; survey_data?: { answers?: Record<string, any> } };
  compatibility_score: number;
  detailed_scores: { mbti: number; attachment: number; communication: number; lifestyle: number; core_values: number; vibe: number; };
  feedback?: { participant_a: FeedbackData | null; participant_b: FeedbackData | null; has_feedback: boolean; };
}
interface Props { matches: ParticipantMatch[]; onClose: () => void; }

// --- CONSTANTS & HELPERS ---
const SCORE_WEIGHTS: Record<string, number> = {
  mbti: 5, attachment: 5, communication: 10, lifestyle: 25, core_values: 20, vibe: 35
};
const QUESTION_MAP: Record<string, string> = {
  lifestyle_4: "تخطيط أم عفوية؟",
  lifestyle_5: "نشاط نهاية الأسبوع",
  core_values_1: "الصدق أم الولاء؟",
  core_values_2: "الطموح أم الاستقرار؟",
  core_values_3: "التقبل أم التشابه؟",
};
const ANSWER_MAP: Record<string, Record<string, string>> = {
  lifestyle_4: { 'أ': 'Planner', 'ب': 'Balanced', 'ج': 'Spontaneous' },
  lifestyle_5: { 'أ': 'Social', 'ب': 'Balanced', 'ج': 'Private' },
  core_values_1: { 'أ': 'Honesty', 'ب': 'Balanced', 'ج': 'Loyalty' },
  core_values_2: { 'أ': 'Ambitious', 'ب': 'Balanced', 'ج': 'Stable' },
  core_values_3: { 'أ': 'Acceptance', 'ب': 'Balanced', 'ج': 'Similarity' },
};

const useFeedbackAnalysis = (matches: ParticipantMatch[]) => {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [showAIModal, setShowAIModal] = useState(false);

  const analysisData = useMemo(() => {
    const feedbackMatches = matches.filter(m => m.round >= 4 && m.feedback?.has_feedback);

    if (feedbackMatches.length === 0) {
      return { hasData: false };
    }

    const getAvgFeedbackScore = (m: ParticipantMatch) => {
      const { participant_a, participant_b } = m.feedback!;
      const rates = [participant_a?.compatibility_rate, participant_b?.compatibility_rate].filter(r => r != null) as number[];
      return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    };

    const highFeedbackMatches = feedbackMatches.filter(m => getAvgFeedbackScore(m) >= 80);
    const lowFeedbackMatches = feedbackMatches.filter(m => getAvgFeedbackScore(m) < 50);

    const totalFeedback = feedbackMatches.length;
    const avgSystemScore = feedbackMatches.reduce((acc, m) => acc + m.compatibility_score, 0) / totalFeedback;
    const avgUserRating = feedbackMatches.reduce((acc, m) => acc + getAvgFeedbackScore(m), 0) / totalFeedback;

    const mutualMeetAgain = feedbackMatches.filter(m => 
      m.feedback?.participant_a?.would_meet_again && m.feedback?.participant_b?.would_meet_again
    ).length;
    const meetAgainRate = (mutualMeetAgain / totalFeedback) * 100;

    const scoreComparisonData = [
      { name: 'Scores', 'System Score': avgSystemScore, 'User Rating': avgUserRating },
    ];

    const meetAgainData = [
      { name: 'Mutual Yes', value: mutualMeetAgain },
      { name: 'Others', value: totalFeedback - mutualMeetAgain },
    ];

    const calculateNormalizedScores = (group: ParticipantMatch[]) => {
      if (group.length === 0) return {};
      const avgScores = Object.keys(SCORE_WEIGHTS).reduce((acc, key) => {
        const total = group.reduce((sum, m) => sum + (m.detailed_scores[key as keyof typeof m.detailed_scores] || 0), 0);
        const avg = total / group.length;
        acc[key] = (avg / SCORE_WEIGHTS[key]) * 100;
        return acc;
      }, {} as Record<string, number>);
      return avgScores;
    };

    const highFeedbackNormalized = calculateNormalizedScores(highFeedbackMatches);
    const lowFeedbackNormalized = calculateNormalizedScores(lowFeedbackMatches);

    const radarData = Object.keys(SCORE_WEIGHTS).map(subject => ({
      subject: subject.replace('_', ' ').replace(/(?:^|\s)\S/g, a => a.toUpperCase()),
      'High Feedback': highFeedbackNormalized[subject] || 0,
      'Low Feedback': lowFeedbackNormalized[subject] || 0,
      fullMark: 100,
    }));

    const performanceGaps = Object.keys(SCORE_WEIGHTS).map(key => ({
      factor: key,
      gap: (highFeedbackNormalized[key] || 0) - (lowFeedbackNormalized[key] || 0),
    })).sort((a, b) => b.gap - a.gap);

    const topPredictor = performanceGaps[0];
    const worstPredictor = performanceGaps[performanceGaps.length - 1];

    const answerPatterns = Object.keys(QUESTION_MAP).map(q => {
      const agreements: Record<string, number> = {};
      const pairings: Record<string, number> = {};
      highFeedbackMatches.forEach(m => {
        const ansA = m.participant_a.survey_data?.answers?.[q];
        const ansB = m.participant_b.survey_data?.answers?.[q];
        if (!ansA || !ansB) return;
        if (ansA === ansB) {
          agreements[ansA] = (agreements[ansA] || 0) + 1;
        } else {
          const pair = [ansA, ansB].sort().join('-');
          pairings[pair] = (pairings[pair] || 0) + 1;
        }
      });

      const topAgreement = Object.entries(agreements).sort((a, b) => b[1] - a[1])[0];
      const topPairing = Object.entries(pairings).sort((a, b) => b[1] - a[1])[0];
      
      return {
        question: QUESTION_MAP[q],
        topAgreement: topAgreement ? { answer: ANSWER_MAP[q]?.[topAgreement[0]] || topAgreement[0], percent: (topAgreement[1] / highFeedbackMatches.length) * 100 } : null,
        topPairing: topPairing ? { pair: topPairing[0].split('-').map(a => ANSWER_MAP[q]?.[a] || a), percent: (topPairing[1] / highFeedbackMatches.length) * 100 } : null,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null && ((p.topAgreement !== null && p.topAgreement.percent > 40) || (p.topPairing !== null && p.topPairing.percent > 20)));

    const recommendations = {
      observations: [] as string[],
      suggestions: [] as string[],
    };

    if (avgUserRating < avgSystemScore - 10) {
      recommendations.observations.push(`Algorithm Overconfidence: System score is significantly higher than user ratings (${avgSystemScore.toFixed(1)}% vs ${avgUserRating.toFixed(1)}%).`);
      recommendations.suggestions.push(`Review scoring weights to better align with user-perceived compatibility.`);
    } else {
      recommendations.observations.push(`Algorithm Accuracy: System score is well-aligned with user ratings (${avgSystemScore.toFixed(1)}% vs ${avgUserRating.toFixed(1)}%).`);
    }

    if (topPredictor && topPredictor.gap > 15) {
      recommendations.observations.push(`Strongest Predictor: '${topPredictor.factor}' is the key driver of success, showing a +${topPredictor.gap.toFixed(1)}% performance gap between good and bad matches.`);
      recommendations.suggestions.push(`Consider slightly increasing the weight of the '${topPredictor.factor}' component to further leverage its predictive power.`);
    }

    if (worstPredictor && worstPredictor.gap < 5) {
      recommendations.observations.push(`Weakest Differentiator: '${worstPredictor.factor}' fails to distinguish between good and bad matches (gap of only ${worstPredictor.gap.toFixed(1)}%).`);
      recommendations.suggestions.push(`Re-evaluate the questions and scoring logic for '${worstPredictor.factor}' to improve its impact.`);
    }
    
    const topAgreementPattern = answerPatterns.sort((a, b) => (b.topAgreement?.percent || 0) - (a.topAgreement?.percent || 0))[0];
    if (topAgreementPattern && topAgreementPattern.topAgreement && topAgreementPattern.topAgreement.percent > 50) {
        recommendations.observations.push(`Key Agreement: Over ${topAgreementPattern.topAgreement.percent.toFixed(0)}% of successful pairs agree on '${topAgreementPattern.question}', specifically on being '${topAgreementPattern.topAgreement.answer}'.`);
        recommendations.suggestions.push(`Increase the compatibility bonus for agreeing on '${topAgreementPattern.topAgreement.answer}' for the question '${topAgreementPattern.question}'.`);
    }

    let failureAnalysis = null;
    if (lowFeedbackMatches.length > 0) {
      const avgSystemScoreInFailed = lowFeedbackMatches.reduce((acc, m) => acc + m.compatibility_score, 0) / lowFeedbackMatches.length;
      const avgUserRatingInFailed = lowFeedbackMatches.reduce((acc, m) => acc + getAvgFeedbackScore(m), 0) / lowFeedbackMatches.length;

      const overconfidenceGap = avgSystemScoreInFailed - avgUserRatingInFailed;

      const clashPatterns = Object.keys(QUESTION_MAP).map(q => {
        const counts: Record<string, number> = {};
        lowFeedbackMatches.forEach(m => {
          const ansA = m.participant_a.survey_data?.answers?.[q];
          const ansB = m.participant_b.survey_data?.answers?.[q];
          if (ansA) counts[ansA] = (counts[ansA] || 0) + 1;
          if (ansB) counts[ansB] = (counts[ansB] || 0) + 1;
        });
        if (Object.keys(counts).length === 0) return null;
        const topClash = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return { question: QUESTION_MAP[q], answer: ANSWER_MAP[q]?.[topClash[0]] || topClash[0], count: topClash[1] };
      }).filter((p): p is NonNullable<typeof p> => p !== null).sort((a, b) => b.count - a.count)[0];

      const weakestFactor = Object.entries(lowFeedbackNormalized).sort((a, b) => a[1] - b[1])[0];

      failureAnalysis = {
        overconfidenceGap,
        topClash: clashPatterns,
        weakestFactor: weakestFactor ? { name: weakestFactor[0], score: weakestFactor[1] } : null,
      };

      recommendations.observations.push(`In failed matches, the system predicted an average score of ${avgSystemScoreInFailed.toFixed(1)}%, but users only gave ${avgUserRatingInFailed.toFixed(1)}%.`);
      if(failureAnalysis.weakestFactor) {
        recommendations.suggestions.push(`Focus on reducing the '${failureAnalysis.weakestFactor.name}' score's contribution, as it performs worst in failed matches.`);
      }
    }

    return {
      hasData: true,
      totalFeedback, avgSystemScore, avgUserRating, meetAgainRate,
      scoreComparisonData, meetAgainData, radarData, recommendations,
      highFeedbackCount: highFeedbackMatches.length,
      lowFeedbackCount: lowFeedbackMatches.length,
      answerPatterns,
      failureAnalysis,
    };
  }, [matches]);

  const handleRunAIAnalysis = async () => {
    // Filter matches that have round >= 4 and both participants provided complete feedback
    const feedbackMatches = matches.filter(m => {
      return m.round >= 4 && 
             m.feedback?.has_feedback && 
             // Check participant A has provided complete feedback
             m.feedback.participant_a?.compatibility_rate && 
             m.feedback.participant_a?.conversation_quality && 
             m.feedback.participant_a?.personal_connection && 
             // Check participant B has provided complete feedback
             m.feedback.participant_b?.compatibility_rate && 
             m.feedback.participant_b?.conversation_quality && 
             m.feedback.participant_b?.personal_connection;
    });
    
    // Limit to 10 matches for testing
    const limitedMatches = feedbackMatches.slice(0, 10);
    
    console.log(`AI Analysis: Found ${feedbackMatches.length} matches with feedback, using ${limitedMatches.length} for analysis`);
    
    // Count total matches with any feedback
    const anyFeedbackCount = matches.filter(m => m.round >= 4 && m.feedback?.has_feedback).length;
    
    if (limitedMatches.length === 0) {
      setAiAnalysis(`Error: No matches with complete feedback data found.

` +
        `Debug Information:
` +
        `- Total matches: ${matches.length}
` +
        `- Matches with any feedback: ${anyFeedbackCount}
` +
        `- Matches with complete feedback from both participants: ${feedbackMatches.length}

` +
        `Possible issues:
` +
        `- No participants have completed the feedback form
` +
        `- Feedback data is incomplete (missing ratings)
` +
        `- No matches from round 4 or later

` +
        `Please ensure some participants have completed feedback forms with all required fields.`);
      return;
    }

    setIsLoadingAI(true);
    setAnalysisProgress(0);
    setAiAnalysis(`Starting AI analysis...

Analyzing ${limitedMatches.length} matches with complete feedback data (limited to 10 for testing).
Total matches with feedback found: ${feedbackMatches.length}`);

    // Progress simulation
    const totalMatches = limitedMatches.length;
    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + Math.floor(Math.random() * 5) + 1;
      });
    }, 800);

    // Update analysis text with progress
    const updateProgressText = () => {
      const currentPair = Math.min(Math.floor((analysisProgress / 100) * totalMatches), totalMatches);
      setAiAnalysis(`Analyzing feedback data...\n\n` +
        `🔍 Processing pair ${currentPair}/${totalMatches} (limited to 10 for testing)\n` +
        `📊 Extracting compatibility patterns\n` +
        `🧠 Generating insights\n\n` +
        `Progress: ${analysisProgress}% complete\n` +
        `\n` +
        `Note: Analysis is limited to 10 matches with complete feedback data for testing.`);
    };

    const progressTextInterval = setInterval(updateProgressText, 1000);

    try {
      // Add a timestamp to prevent caching
      const timestamp = new Date().getTime();
      updateProgressText(); // Initial progress update
      
      // Log the API request for debugging
      console.log('AI Analysis Request:', {
        endpoint: '/api/generate-ai-analysis',
        matchCount: limitedMatches.length,
        timestamp
      });
      
      // Log a sample match to help debug the API
      if (limitedMatches.length > 0) {
        console.log('Sample match data structure:', {
          round: limitedMatches[0].round,
          feedback_structure: limitedMatches[0].feedback ? Object.keys(limitedMatches[0].feedback) : 'No feedback',
          has_participant_a: !!limitedMatches[0].feedback?.participant_a,
          has_participant_b: !!limitedMatches[0].feedback?.participant_b
        });  
      }
      
      const response = await fetch(`/api/generate-ai-analysis?t=${timestamp}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ 
          matches: limitedMatches,
          questions: QUESTION_MAP,
          weights: SCORE_WEIGHTS
        }),
      });

      clearInterval(progressInterval);
      clearInterval(progressTextInterval);
      setAnalysisProgress(100);
      setAiAnalysis('Finalizing analysis results...');

      if (!response.ok) {
        let errorMessage = 'Please try again.';
        try {
          // Try to parse as JSON first
          const errorJson = await response.json();
          console.error('API response error:', response.status, errorJson);
          
          // Format the error details for display
          if (errorJson.error) {
            errorMessage = `${errorJson.error}\n`;
            if (errorJson.message) errorMessage += `\nMessage: ${errorJson.message}`;
            if (errorJson.details) {
              errorMessage += '\n\nDetails:';
              Object.entries(errorJson.details).forEach(([key, value]) => {
                errorMessage += `\n- ${key}: ${value}`;
              });
            }
          } else {
            errorMessage = JSON.stringify(errorJson, null, 2);
          }
        } catch (e) {
          // If not JSON, treat as text
          const errorText = await response.text();
          console.error('API response error (text):', response.status, errorText);
          errorMessage = errorText || 'Please try again.';
        }
        
        setAiAnalysis(`❌ Error: Failed to get AI analysis (${response.status})\n\n${errorMessage}`);
        // Set a special error state that the UI can use to show a more prominent error
        setAnalysisProgress(-1); // Using -1 to indicate error state
        return;
      }

      // Simple text response handling
      const text = await response.text();
      console.log('AI Analysis API Response:', text ? `Received ${text.length} characters` : 'Empty response');
      
      if (!text || text.trim() === '') {
        console.error('AI Analysis Error: Empty response received from API');
        setAiAnalysis('❌ Error: Received empty response from the analysis service.');
        setAnalysisProgress(-1); // Using -1 to indicate error state
      } else {
        // Log first 100 characters to help debug
        console.log('AI Analysis Success - First 100 chars:', text.substring(0, 100));
        console.log('AI Analysis Content Length:', text.length);
        
        // Store the analysis and show the modal
        setAiAnalysis(text);
        setShowAIModal(true);
      }
    } catch (error) {
      console.error('Error in AI analysis:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiAnalysis(`❌ Error: An unexpected error occurred.\n\n${errorMessage}\n\nPlease check your network connection and try again.`);
      setAnalysisProgress(-1); // Using -1 to indicate error state
    } finally {
      clearInterval(progressInterval);
      clearInterval(progressTextInterval);
      setIsLoadingAI(false);
    }
  };

  return { ...analysisData, aiAnalysis, isLoadingAI, analysisProgress, showAIModal, setShowAIModal, handleRunAIAnalysis };
};

// --- UI COMPONENTS ---
const StatCard = ({ icon, title, value, colorClass }: { icon: React.ReactNode, title: string, value: string, colorClass: string }) => (
  <div className={`bg-slate-800/50 border-l-4 ${colorClass} p-4 rounded-lg shadow-md flex items-center`}>
    <div className="mr-4">{icon}</div>
    <div>
      <p className="text-sm text-slate-400">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  </div>
);

const ChartContainer = ({ title, children, icon }: { title: string, children: React.ReactNode, icon?: React.ReactNode }) => (
  <div className="bg-slate-800/50 p-4 rounded-lg shadow-lg h-80 flex flex-col">
    <div className="flex items-center justify-center gap-2">
      {icon}
      <h3 className="text-lg font-bold text-cyan-200 mb-4 text-center">{title}</h3>
    </div>
    <div className="grow">{children}</div>
  </div>
);

const FailureCard = ({ icon, title, value, subtitle }: { icon: React.ReactNode, title: string, value: string, subtitle: string }) => (
  <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-lg text-center h-full flex flex-col justify-center">
    <div className="flex justify-center mb-2">{icon}</div>
    <p className="text-sm text-red-200">{title}</p>
    <p className="text-3xl font-bold text-white">{value}</p>
    <p className="text-xs text-slate-400">{subtitle}</p>
  </div>
);

const PatternCard = ({ title, pattern, type }: { title: string, pattern: any, type: 'agreement' | 'pairing' }) => (
  <div className="bg-slate-900/50 p-4 rounded-lg text-center flex flex-col justify-between h-full">
    <div>
      <p className="text-sm text-slate-400 mb-2">{title}</p>
      {type === 'agreement' ? (
        <div className="text-2xl font-bold text-cyan-300 bg-cyan-500/10 py-2 px-4 rounded-md">{pattern.answer}</div>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <div className="text-xl font-bold text-purple-300 bg-purple-500/10 py-2 px-3 rounded-md">{pattern.pair[0]}</div>
          <span className="text-slate-400">+</span>
          <div className="text-xl font-bold text-purple-300 bg-purple-500/10 py-2 px-3 rounded-md">{pattern.pair[1]}</div>
        </div>
      )}
    </div>
    <p className="text-3xl font-bold text-white mt-3">{pattern.percent.toFixed(0)}<span className="text-lg text-slate-400">%</span></p>
    <p className="text-xs text-slate-500 mt-1">of successful matches</p>
  </div>
);


// --- MAIN COMPONENT ---
export default function FeedbackStatsModal({ matches, onClose }: Props) {
  const analysis = useFeedbackAnalysis(matches);
  const { showAIModal, setShowAIModal, isLoadingAI, analysisProgress, aiAnalysis } = analysis;

  if (!analysis.hasData) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div dir="rtl" className="bg-slate-900 border-2 border-cyan-500/30 rounded-2xl p-6 w-full max-w-lg text-center">
          <h2 className="text-2xl font-bold text-yellow-300 mb-4">لا توجد بيانات كافية للتحليل</h2>
          <p className="text-slate-300">لم يتم العثور على تقييمات كافية لإنشاء تقرير إحصائي.</p>
        </div>
      </div>
    );
  }

  const { 
    handleRunAIAnalysis, 
    totalFeedback, 
    avgSystemScore, 
    avgUserRating, 
    meetAgainRate, 
    scoreComparisonData, 
    meetAgainData, 
    radarData, 
    recommendations, 
    highFeedbackCount, 
    lowFeedbackCount, 
    answerPatterns, 
    failureAnalysis 
  } = analysis as any; // Using 'as any' to bypass TS errors on the destructured object

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-50 p-4 font-sans" onClick={onClose}>
      <div dir="rtl" className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto p-6 scrollbar-hide" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 left-4 text-slate-400 hover:text-cyan-300 transition-colors z-10"><X size={28} /></button>
        <div className="flex justify-between items-center gap-4 mb-6 border-b border-slate-700 pb-4">
          <div className="flex items-center gap-4">
            <BarChart3 className="w-10 h-10 text-cyan-300" />
            <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-linear-to-r from-cyan-300 to-purple-400">تحليل أداء الخوارزمية</h2>
          </div>
          <button 
            onClick={handleRunAIAnalysis} 
            disabled={isLoadingAI}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingAI ? <Loader className="animate-spin" /> : <Sparkles />}
            {isLoadingAI ? `يتم التحليل... ${analysisProgress}%` : 'تحليل بواسطة الذكاء الاصطناعي'}
          </button>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<Users size={32} className="text-cyan-400" />} title="إجمالي التقييمات" value={totalFeedback.toString()} colorClass="border-cyan-400" />
          <StatCard icon={<Target size={32} className="text-purple-400" />} title="متوسط توافق النظام" value={`${avgSystemScore.toFixed(1)}%`} colorClass="border-purple-400" />
          <StatCard icon={<Star size={32} className="text-yellow-400" />} title="متوسط تقييم المستخدمين" value={`${avgUserRating.toFixed(1)}%`} colorClass="border-yellow-400" />
          <StatCard icon={<HeartHandshake size={32} className="text-green-400" />} title="توافق للقاء مجددًا" value={`${meetAgainRate.toFixed(1)}%`} colorClass="border-green-400" />
        </div>

        {failureAnalysis && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <ThumbsDown className="w-8 h-8 text-red-400" />
              <h3 className="text-2xl font-bold text-red-300">Failure Analysis (Matches &lt;50%)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FailureCard 
                icon={<TrendingUp size={32} className="text-red-400" />} 
                title="Algorithm Overconfidence" 
                value={`+${failureAnalysis.overconfidenceGap.toFixed(1)}%`}
                subtitle="Avg. System Score vs. User Rating"
              />
              {failureAnalysis.topClash && <FailureCard 
                icon={<Users size={32} className="text-red-400" />} 
                title="Top Clashing Answer"
                value={failureAnalysis.topClash.answer}
                subtitle={`Appeared most in failed matches for "${failureAnalysis.topClash.question}"`}
              />}
              {failureAnalysis.weakestFactor && <FailureCard 
                icon={<BarChart3 size={32} className="text-red-400" />} 
                title="Biggest Weakness"
                value={failureAnalysis.weakestFactor.name.toUpperCase()}
                subtitle={`Performed worst with ${failureAnalysis.weakestFactor.score.toFixed(1)}% score`}
              />}
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <ChartContainer title="مقارنة دقة الخوارزمية">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreComparisonData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af' }} />
                  <YAxis tick={{ fill: '#9ca3af' }} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', color: '#e5e7eb' }} cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }}/>
                  <Legend wrapperStyle={{ color: '#d1d5db' }} />
                  <Bar dataKey="System Score" fill="#8b5cf6" />
                  <Bar dataKey="User Rating" fill="#facc15" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
          <div>
            <ChartContainer title="نسبة الرغبة في اللقاء مجددًا">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={meetAgainData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                        // Add null check for midAngle with default value of 0
                        const angle = midAngle !== undefined ? midAngle : 0;
                        const x  = cx + radius * Math.cos(-angle * (Math.PI / 180));
                        const y = cy  + radius * Math.sin(-angle * (Math.PI / 180));
                        return (
                          <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
                            {`${(percent !== undefined ? (percent * 100).toFixed(0) : 0)}%`}
                          </text>
                        );
                    }}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#374151" />
                  </Pie>
                  <Legend wrapperStyle={{ color: '#d1d5db' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}/>
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartContainer title="أهم عوامل التوافق (في التقييمات العالية)">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="#374151" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#d1d5db', fontSize: 12 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                        <Radar name="High Feedback" dataKey="High Feedback" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.6} />
                        <Radar name="Low Feedback" dataKey="Low Feedback" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.4} />
                        <Legend wrapperStyle={{ color: '#d1d5db', paddingTop: '20px' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}/>
                    </RadarChart>
                </ResponsiveContainer>
            </ChartContainer>
            <div className="bg-slate-800/50 p-4 rounded-lg shadow-lg">
                <h3 className="text-lg font-bold text-cyan-200 mb-4 text-center">ملخص التقييمات</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between bg-green-900/30 p-3 rounded-md">
                        <div className="flex items-center gap-3">
                            <ThumbsUp className="text-green-400" />
                            <span className="font-semibold text-green-300">تقييمات عالية (&gt;=80%)</span>
                        </div>
                        <span className="text-2xl font-bold text-white">{highFeedbackCount}</span>
                    </div>
                    <div className="flex items-center justify-between bg-red-900/30 p-3 rounded-md">
                        <div className="flex items-center gap-3">
                            <ThumbsDown className="text-red-400" />
                            <span className="font-semibold text-red-300">تقييمات منخفضة (&lt;50%)</span>
                        </div>
                        <span className="text-2xl font-bold text-white">{lowFeedbackCount}</span>
                    </div>
                </div>
            </div>
        </div>

        {answerPatterns && answerPatterns.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
                <Handshake className="w-8 h-8 text-green-400" />
                <h3 className="text-2xl font-bold text-green-300">أنماط النجاح في إجابات الاستبيان</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {answerPatterns.map((p: any, i: number) => (
                <div key={i}>
                  <h4 className="font-bold text-center text-slate-300 mb-2">{p.question}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {p.topAgreement && <PatternCard title="Top Agreement" pattern={p.topAgreement} type="agreement" />}
                    {p.topPairing && <PatternCard title="Top Pairing" pattern={p.topPairing} type="pairing" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Analysis Section */}
        <div className="bg-purple-900/20 border border-purple-500/30 p-6 rounded-lg mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sparkles className="text-purple-300 w-8 h-8" />
              <h3 className="text-2xl font-bold text-purple-200">AI-Powered Analysis</h3>
            </div>
            
            {aiAnalysis && !isLoadingAI && (
              <button
                onClick={() => setShowAIModal(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all"
              >
                <span>View Analysis</span>
              </button>
            )}
          </div>
          
          <div className="prose prose-invert max-w-none prose-p:text-slate-300">
            {isLoadingAI ? (
              <div className="mb-4">
                <div className="w-full bg-slate-700 rounded-full h-2.5 mb-2">
                  <div className="bg-purple-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${analysisProgress}%` }}></div>
                </div>
                <p className="text-sm text-slate-400 text-center">{analysisProgress}% complete</p>
              </div>
            ) : aiAnalysis ? (
              <p className="text-slate-300">
                AI analysis of your matching algorithm is ready. Click the "View Analysis" button to see detailed insights and recommendations.
              </p>
            ) : (
              <p className="text-slate-300">
                Generate an AI-powered analysis of your matching algorithm to get insights into what's working well and what could be improved.
              </p>
            )}
            
            {!aiAnalysis && !isLoadingAI && (
              <button
                onClick={handleRunAIAnalysis}
                disabled={isLoadingAI}
                className="mt-4 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={20} />
                <span>Generate AI Analysis</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-cyan-400/20 p-4 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb className="text-cyan-300 w-7 h-7" />
            <h3 className="text-2xl font-bold text-cyan-200">Insights & Recommendations</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-bold text-lg text-slate-300 mb-2 border-b border-slate-700 pb-1">Key Observations</h4>
              <ul className="space-y-2 text-slate-300 list-disc pl-5">
                {recommendations.observations.map((obs: string, i: number) => <li key={`obs-${i}`}>{obs}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-lg text-green-300 mb-2 border-b border-slate-700 pb-1">Actionable Suggestions</h4>
              <ul className="space-y-2 text-green-200 list-disc pl-5">
                {recommendations.suggestions.map((sug: string, i: number) => <li key={`sug-${i}`}>{sug}</li>)}
              </ul>
            </div>
          </div>
        </div>

      </div>
    <AIAnalysisModal 
      analysis={aiAnalysis || ''} 
      isOpen={showAIModal} 
      onClose={() => setShowAIModal(false)} 
    />
    </div>
  );
}