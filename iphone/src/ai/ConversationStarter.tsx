import { useEffect, useRef, useState } from 'react';
import { Sparkles } from "../BrandIcons";
import type { CommunitySource, PublicPerson } from '../community/data';

export function ConversationStarter({ source, person, disabled, choose }: {
  source: CommunitySource; person: PublicPerson; disabled: boolean; choose: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, [person.id, source]);
  if (!source.suggestOpener) return null;
  async function suggest() {
    if (busy || disabled) return;
    const ticket = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await source.suggestOpener!(person);
      if (ticket === generation.current) setText(result);
    } catch (cause) {
      if (ticket === generation.current) setError(cause instanceof Error ? cause.message : 'تعذّر إعداد الاقتراح.');
    } finally { if (ticket === generation.current) setBusy(false); }
  }
  return <div className="cm-ai-opener">
    <button type="button" onClick={() => void suggest()} disabled={busy || disabled}><Sparkles size={14}/>{busy ? 'نجهّز بداية مناسبة…' : 'اقترح بداية للحديث'}</button>
    <small>اقتراح عام تراجعه قبل الإرسال. لا نرسل بيانات الملف أو الرسائل إلى مزوّد الذكاء الاصطناعي.</small>
    {error && <small role="alert">{error}</small>}
    {text && <div className="cm-ai-result"><p dir="auto">{text}</p><button type="button" disabled={disabled} onClick={() => { if (!disabled) choose(text); }}>استخدام كمسودة</button></div>}
  </div>;
}
