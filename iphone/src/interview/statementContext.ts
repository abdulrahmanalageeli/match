import type { InterviewStatement } from './types';

type CardContext = { quote: string; prompt?: string; caption: string };

/** A member's private words can narrow the question. Only the existing
 * grounded assessment path may choose an option or remove the card. */
export function statementContext(
  fieldId: string,
  statements: readonly InterviewStatement[],
  sharedTiming = false,
): CardContext | undefined {
  const [, field, side] = fieldId.split(':');
  const recent = [...statements].reverse();
  if (field === 'marriage_timeline' && side === 'self') {
    const timing = recent.find(s => s.topic === 'timeline' && s.subject !== 'partner');
    if (timing) return { quote: timing.quote, caption: 'من كلامك عن الزواج',
      prompt: sharedTiming ? 'وإذا صار فيه قبول، متى يناسبك تاخذون أول خطوة رسمية مع بعض؟' : 'وإذا صار فيه قبول، متى يناسبك تبدأ الخطوة الرسمية؟' };
  }
  if (field === 'social_rhythm' && (side === 'self' || side === 'partner')) {
    const social = recent.find(s => s.topic === 'social' && s.subject === side);
    if (social) return { quote: social.quote, caption: side === 'self' ? 'وصفت نفسك' : 'عن شريك حياتك',
      prompt: side === 'self' ? 'بعد أسبوع مزدحم، كيف تحب توازن بين الزيارات ووقتك الخاص؟' : 'وعلى مدار الأسبوع، كيف تفضّل يكون التوازن عند الشريك بين الزيارات والهدوء؟' };
  }
  if (field === 'group_energy' && side === 'self') {
    const social = recent.find(s => s.topic === 'social' && s.subject === 'self');
    if (social) return { quote: social.quote, caption: 'وصفت نفسك' };
  }
}
