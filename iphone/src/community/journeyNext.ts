import type { StepProgress } from './data';

const stages = ['التعارف الأول', 'نقاش جاد حول الزواج', 'الخطوة الرسمية أو العائلية'];
export function journeyNext(progress: StepProgress | null, name: string) {
  if (!progress) return { title: 'مسار واضح لكما', agreed: 'عرض اتفاقكما والخطوة القادمة', waiting: 'عرض المسار', yours: false };
  const agreed = `${stages[progress.stage] ?? stages[0]}${progress.exclusive ? ' · حصري' : ''}`;
  if (progress.rewindPeer || progress.rewindMine) return { title: 'مراجعة العودة خطوة', agreed,
    waiting: progress.rewindPeer && !progress.rewindMine ? 'بانتظار موافقتك' : `بانتظار ${name}`, yours: Boolean(progress.rewindPeer && !progress.rewindMine) };
  if (!progress.exclusive) return { title: 'الالتزام الحصري للنقاش الجاد', agreed,
    waiting: progress.consentMine ? `بانتظار ${name}` : progress.consentPeer ? 'بانتظار موافقتك' : 'عندما تكونان مستعدّين', yours: Boolean(progress.consentPeer && !progress.consentMine) };
  if (progress.stage >= 2) return { title: 'تنسيق الخطوة العائلية', agreed, waiting: 'باتفاقكما معًا', yours: false };
  return { title: stages[progress.stage + 1], agreed,
    waiting: progress.mine ? `بانتظار ${name}` : progress.peer ? 'بانتظار موافقتك' : 'اقترحا الخطوة التالية', yours: progress.peer && !progress.mine };
}
