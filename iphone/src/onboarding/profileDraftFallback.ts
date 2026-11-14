import { categories, interests } from '../compatibility/model';
import type { Answers } from './draft';

export type PublicProfileDraft = Pick<Answers, 'bio' | 'lookingFor' | 'lifeTogether' | 'valuesStatement' | 'marriageIntent'>;

const compact = (parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
const list = (values: string[]) => values.length < 2 ? values[0] ?? '' : `${values.slice(0, -1).join('، ')} و${values.at(-1)}`;

/** A deterministic, no-hallucination safety net for the public writing step.
 * Every personal detail comes from the confirmed draft; the remaining wording
 * describes only the app's explicit marriage purpose and stays editable. */
export function generatedPublicProfileDraft(answers: Answers, variant = 0): PublicProfileDraft {
  const chosenInterests = interests.filter(item => answers.interestIds?.includes(item.id)).slice(0, 3).map(item => item.label);
  const chosenPriorities = categories.filter(item => answers.priorityCategories?.includes(item.id)).slice(0, 3).map(item => item.label);
  const work = answers.profession.trim();
  const city = answers.city.trim();
  const interestText = list(chosenInterests);
  const priorityText = list(chosenPriorities);
  const versions = [
    {
      bio: compact([city && `أعيش في ${city}.`, work && `مجالي ${work}.`, interestText && `ومن الأشياء القريبة لي ${interestText}.`]),
      lookingFor: compact(['أبحث عن شريك حياة جاد وواضح في نيته،', priorityText ? `ويقدّر ${priorityText}.` : 'ونبني التفاهم بيننا باحترام ووضوح.']),
      lifeTogether: compact([interestText ? `أتخيل حياة نتشارك فيها ${interestText}،` : 'أتخيل حياة نتشارك فيها تفاصيل يومنا،', 'ونتخذ قراراتنا بتفاهم وتعاون.']),
      valuesStatement: priorityText ? `أعطي أهمية لـ${priorityText}، وأفضّل أن تظهر في التعامل اليومي.` : 'أقدّر الصراحة والاحترام، وأفضّل أن يكون الحوار واضحًا من البداية.',
    },
    {
      bio: compact([work && `أعمل في ${work}،`, city && `وحياتي اليوم في ${city}.`, interestText && `أستمتع بـ${interestText}.`]),
      lookingFor: compact(['أتمنى شريكًا جادًا في الزواج،', priorityText ? `نتفق على ${priorityText} ونختلف باحترام.` : 'نتفاهم بهدوء ونكون واضحين مع بعض.']),
      lifeTogether: compact(['أطمح لبيت فيه مودة وهدوء،', interestText ? `ونصنع وقتًا لـ${interestText} ولتفاصيلنا اليومية.` : 'ونشارك المسؤوليات والقرارات اليومية.']),
      valuesStatement: priorityText ? `أهم ما أقدّره ${priorityText}، مع مساحة صادقة للحوار.` : 'أهم ما أقدّره الثقة والوضوح، مع مساحة صادقة للحوار.',
    },
    {
      bio: compact([city && `أسكن في ${city}.`, work && `أعمل في مجال ${work}.`, interestText && `اهتماماتي تشمل ${interestText}.`]),
      lookingFor: compact(['هدفي زواج جاد بخطوات واضحة،', priorityText ? `مع شريك يشارك معي قيمة ${priorityText}.` : 'مع شريك مستعد للتفاهم وبناء حياة مستقرة.']),
      lifeTogether: compact(['أرى الحياة المشتركة تعاونًا في المسؤوليات والقرارات،', interestText && `ووقتًا نشاركه في ${interestText}.`]),
      valuesStatement: priorityText ? `أحرص على ${priorityText}، وأرى أن الوضوح أساس التفاهم.` : 'أرى أن الوضوح والاحترام أساس التفاهم واستمرار العلاقة.',
    },
  ];
  const selected = versions[Math.abs(variant) % versions.length];
  return {
    ...selected,
    bio: selected.bio || 'أبحث عن زواج جاد، وأفضّل أن نتعرّف بخطوات واضحة ومحترمة.',
    marriageIntent: answers.marriageIntent?.trim() || 'تعارف جاد يهدف إلى الزواج',
  };
}

export function missingPublicProfileDraft(answers: Answers, variant = 0): Partial<PublicProfileDraft> {
  const generated = generatedPublicProfileDraft(answers, variant);
  return Object.fromEntries(Object.entries(generated).filter(([key]) => !String(answers[key as keyof PublicProfileDraft] ?? '').trim()));
}
