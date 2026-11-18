import type { StepProgress } from './data';

const stages = ['التعارف الأول', 'نقاش جاد حول الزواج', 'الخطوة الرسمية أو العائلية'];
export function journeyNext(progress: StepProgress | null, name: string) {
  if (!progress) return { title: 'مسار واضح لكما', agreed: 'عرض اتفاقكما والخطوة القادمة', waiting: 'عرض المسار', yours: false };
  const agreed = `${stages[progress.stage] ?? stages[0]}${progress.exclusive ? ' · حصري' : ''}`;
  if (progress.rewindPeer || progress.rewindMine) return { title: 'مراجعة العودة خطوة', agreed,
    waiting: progress.rewindPeer && !progress.rewindMine ? 'بانتظار موافقتك' : `بانتظار ${name}`, yours: Boolean(progress.rewindPeer && !progress.rewindMine) };
  if (!progress.exclusive && progress.consentPeer) return { title: 'مراجعة طلب الحصرية', agreed, waiting: 'بانتظار قرارك', yours: true };
  if (!progress.exclusive && progress.consentMine) return { title: 'اقتراح الحصرية', agreed, waiting: `بانتظار ${name}`, yours: false };
  if (progress.stage >= 2) return { title: 'تنسيق الخطوة العائلية', agreed, waiting: 'باتفاقكما معًا', yours: false };
  return { title: stages[progress.stage + 1], agreed,
    waiting: progress.mine ? `بانتظار ${name}` : progress.peer ? 'بانتظار موافقتك' : 'عندما تكونان مستعدّين', yours: progress.peer && !progress.mine };
}
