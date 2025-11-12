import { useMemo } from 'react';
import { X, Star, Heart, BrainCircuit, Users, Smile, Handshake, TrendingUp, BarChart } from 'lucide-react';

// Assuming ParticipantMatch and FeedbackData interfaces are defined elsewhere and imported
// For standalone component, defining them here:
interface FeedbackData {
  compatibility_rate: number;
  conversation_quality: number;
  personal_connection: number;
  would_meet_again: boolean;
}

interface ParticipantMatch {
  participant_a: { mbti: string; age: number; survey_data?: { answers?: Record<string, any> } };
  participant_b: { mbti: string; age: number; survey_data?: { answers?: Record<string, any> } };
  compatibility_score: number;
  detailed_scores: {
    mbti: number;
    attachment: number;
    communication: number;
    lifestyle: number;
    core_values: number;
    vibe: number;
  };
  bonus_type: string;
  feedback?: {
    participant_a: FeedbackData | null;
    participant_b: FeedbackData | null;
    has_feedback: boolean;
  };
}

interface Props {
  matches: ParticipantMatch[];
  onClose: () => void;
}

const HIGH_FEEDBACK_THRESHOLD = 80; // 80% and above is considered high feedback

export default function FeedbackStatsModal({ matches, onClose }: Props) {
  const stats = useMemo(() => {
    const highFeedbackMatches = matches.filter(m => {
      if (!m.feedback?.has_feedback) return false;
      const feedbackA = m.feedback.participant_a?.compatibility_rate;
      const feedbackB = m.feedback.participant_b?.compatibility_rate;
      if (feedbackA && feedbackB) return (feedbackA + feedbackB) / 2 >= HIGH_FEEDBACK_THRESHOLD;
      if (feedbackA) return feedbackA >= HIGH_FEEDBACK_THRESHOLD;
      if (feedbackB) return feedbackB >= HIGH_FEEDBACK_THRESHOLD;
      return false;
    });

    if (highFeedbackMatches.length === 0) {
      return null;
    }

    const totalSystemScore = highFeedbackMatches.reduce((acc, m) => acc + m.compatibility_score, 0);
    const avgSystemScore = totalSystemScore / highFeedbackMatches.length;

    const detailedScores = highFeedbackMatches.reduce((acc, m) => {
      acc.mbti += m.detailed_scores.mbti;
      acc.attachment += m.detailed_scores.attachment;
      acc.communication += m.detailed_scores.communication;
      acc.lifestyle += m.detailed_scores.lifestyle;
      acc.core_values += m.detailed_scores.core_values;
      acc.vibe += m.detailed_scores.vibe;
      return acc;
    }, { mbti: 0, attachment: 0, communication: 0, lifestyle: 0, core_values: 0, vibe: 0 });

    const avgDetailedScores = {
      mbti: detailedScores.mbti / highFeedbackMatches.length,
      attachment: detailedScores.attachment / highFeedbackMatches.length,
      communication: detailedScores.communication / highFeedbackMatches.length,
      lifestyle: detailedScores.lifestyle / highFeedbackMatches.length,
      core_values: detailedScores.core_values / highFeedbackMatches.length,
      vibe: detailedScores.vibe / highFeedbackMatches.length,
    };

    const topDetailedScore = Object.entries(avgDetailedScores).sort((a, b) => b[1] - a[1])[0];

    const mbtiPairs = highFeedbackMatches.reduce((acc, m) => {
      const type1 = m.participant_a.mbti;
      const type2 = m.participant_b.mbti;
      if (!type1 || !type2) return acc;
      const pair = [type1, type2].sort().join(' - ');
      acc[pair] = (acc[pair] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topMbtiPairs = Object.entries(mbtiPairs).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const ageDiffs = highFeedbackMatches.map(m => Math.abs(m.participant_a.age - m.participant_b.age));
    const avgAgeDiff = ageDiffs.reduce((acc, diff) => acc + diff, 0) / ageDiffs.length;

    const bonusMatches = highFeedbackMatches.filter(m => m.bonus_type !== 'none').length;
    const bonusPercentage = (bonusMatches / highFeedbackMatches.length) * 100;

    // Advanced survey analysis
    const questionAgreement = {
      lifestyle: {} as Record<string, number>,
      core_values: {} as Record<string, number>,
    };

    highFeedbackMatches.forEach(m => {
      const answersA = m.participant_a.survey_data?.answers;
      const answersB = m.participant_b.survey_data?.answers;
      if (!answersA || !answersB) return;

      for (let i = 1; i <= 5; i++) {
        const lifestyleQ = `lifestyle_${i}`;
        const coreValuesQ = `core_values_${i}`;

        if (answersA[lifestyleQ] && answersA[lifestyleQ] === answersB[lifestyleQ]) {
          questionAgreement.lifestyle[lifestyleQ] = (questionAgreement.lifestyle[lifestyleQ] || 0) + 1;
        }
        if (answersA[coreValuesQ] && answersA[coreValuesQ] === answersB[coreValuesQ]) {
          questionAgreement.core_values[coreValuesQ] = (questionAgreement.core_values[coreValuesQ] || 0) + 1;
        }
      }
    });

    const topLifestyleAgreement = Object.entries(questionAgreement.lifestyle).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topCoreValuesAgreement = Object.entries(questionAgreement.core_values).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
      count: highFeedbackMatches.length,
      avgSystemScore,
      topDetailedScore: { name: topDetailedScore[0], value: topDetailedScore[1] },
      topMbtiPairs,
      avgAgeDiff,
      bonusPercentage,
      topLifestyleAgreement,
      topCoreValuesAgreement,
    };
  }, [matches]);

  const StatCard = ({ icon, title, value, unit, subtitle }: { icon: React.ReactNode, title: string, value: string | number, unit?: string, subtitle: string }) => (
    <div className="bg-slate-800/50 p-4 rounded-lg flex items-start gap-4">
      <div className="bg-slate-900 p-3 rounded-full">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-cyan-300">{value}{unit && <span className="text-lg ml-1">{unit}</span>}</p>
        <p className="text-sm text-slate-400 font-semibold">{title}</p>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-slate-900 border-2 border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 left-4 text-slate-400 hover:text-white transition">
          <X size={24} />
        </button>
        
        <div className="flex items-center gap-3 mb-6">
          <BarChart className="w-8 h-8 text-cyan-300" />
          <h2 className="text-3xl font-bold text-cyan-300">تحليل التقييمات العالية</h2>
        </div>

        {stats ? (
          <div className="space-y-4">
            <p className="text-slate-300 text-center mb-6">تحليل قائم على {stats.count} مطابقة حصلت على تقييم {HIGH_FEEDBACK_THRESHOLD}% أو أعلى من المشاركين.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard 
                icon={<TrendingUp className="text-green-400" />} 
                title="متوسط توافق النظام"
                value={stats.avgSystemScore.toFixed(1)}
                unit="%"
                subtitle="المطابقات العالية التقييم لديها توافق نظام مرتفع أيضاً."
              />
              <StatCard 
                icon={<Star className="text-yellow-400" />} 
                title="أهم عامل توافق"
                value={stats.topDetailedScore.name.replace('_', ' ').toUpperCase()}
                subtitle={`متوسط ${stats.topDetailedScore.value.toFixed(1)} نقطة في المطابقات الناجحة.`}
              />
              <StatCard 
                icon={<Users className="text-blue-400" />} 
                title="متوسط فارق العمر"
                value={stats.avgAgeDiff.toFixed(1)}
                unit="سنوات"
                subtitle="متوسط فارق العمر في أنجح المطابقات."
              />
              <StatCard 
                icon={<Smile className="text-orange-400" />} 
                title="نسبة مكافأة الدعابة والانفتاح"
                value={stats.bonusPercentage.toFixed(0)}
                unit="%"
                subtitle="من المطابقات الناجحة حصلت على هذه المكافأة."
              />
            </div>
            
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <BrainCircuit className="text-purple-400" />
                <h3 className="text-lg font-bold text-purple-300">أنجح ثنائيات MBTI</h3>
              </div>
              <ul className="space-y-2">
                {stats.topMbtiPairs.map(([pair, count]) => (
                  <li key={pair} className="flex justify-between items-center bg-slate-900/70 p-2 rounded">
                    <span className="font-mono text-sm text-cyan-200">{pair}</span>
                    <span className="text-xs text-slate-300 bg-purple-500/20 px-2 py-1 rounded-full">تكررت {count} مرات</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-800/50 p-4 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <Handshake className="text-green-400" />
                <h3 className="text-lg font-bold text-green-300">أهم القيم ونمط الحياة المتفق عليه</h3>
              </div>
              <p className="text-xs text-slate-400 mb-3">الأسئلة التي يتفق عليها المشاركون في أنجح المطابقات.</p>
              <h4 className="text-sm font-semibold text-cyan-200 mb-2">نمط الحياة</h4>
              <ul className="space-y-1 mb-3">
                {stats.topLifestyleAgreement.map(([q, count]) => (
                  <li key={q} className="text-xs text-slate-300">- سؤال {q.replace('lifestyle_', '')}: <span className="font-bold text-white">{((count / stats.count) * 100).toFixed(0)}%</span> اتفاق</li>
                ))}
              </ul>
              <h4 className="text-sm font-semibold text-cyan-200 mb-2">القيم الأساسية</h4>
              <ul className="space-y-1">
                 {stats.topCoreValuesAgreement.map(([q, count]) => (
                  <li key={q} className="text-xs text-slate-300">- سؤال {q.replace('core_values_', '')}: <span className="font-bold text-white">{((count / stats.count) * 100).toFixed(0)}%</span> اتفاق</li>
                ))}
              </ul>
            </div>

          </div>
        ) : (
          <p className="text-center text-yellow-400 py-12">لا توجد بيانات تقييم عالية كافية للتحليل.</p>
        )}
      </div>
    </div>
  );
}
