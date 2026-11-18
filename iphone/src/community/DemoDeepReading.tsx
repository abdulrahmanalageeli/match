import { useState, type ReactNode } from 'react';
import { useMembershipAccess } from '../membership/access';
import { DeepReport } from './DeepReport';
import { generateDemoReading } from './deepCompatibilityClient';
import { deepSnapshot, type DeepFinding } from './deepCompatibilityModel';
import type { PublicPerson } from './data';
import example from './deepExample.json';

const sample = deepSnapshot({status:'shared', requestedByMe:true, findings:example.findings});

export function DemoDeepReading({ person, open, sheet }: {
  person: PublicPerson; open: boolean; sheet(content:ReactNode):ReactNode;
}) {
  const { tier, demo, upgrade } = useMembershipAccess();
  const [findings,setFindings] = useState<DeepFinding[]>();
  const [exampleOpen,setExampleOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function generate() {
    setBusy(true); setError('');
    try { setFindings(await generateDemoReading(person.id)); }
    catch (cause) { setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : 'تعذّر إكمال القراءة. حاول مجددًا.'); }
    finally { setBusy(false); }
  }
  if (!open) return null;
  if (!demo && tier !== 'seriousness') return sheet(<div className="wd-deep">
    <p>التحليل المعمّق من مزايا وسام الجدية.</p>
    <button type="button" className="btn-primary" onClick={upgrade}>اكتشف وسام الجدية</button>
  </div>);
  if (demo || exampleOpen) return sheet(<div className="wd-deep wd-deep-shared">
    {!demo && <button type="button" className="btn-text" onClick={()=>setExampleOpen(false)}>العودة إلى قراءتي</button>}
    <DeepReport sample exampleName="سارة" peerName="فهد" snapshot={sample}/>
  </div>);
  if (findings) return sheet(<div className="wd-deep wd-deep-shared">
    <DeepReport sample peerName={person.alias} snapshot={{requestedByMe:true,findings}}/>
  </div>);
  return sheet(<div className="wd-deep">
    <h3>كيف تبدو الحياة اليومية مع {person.alias}؟</h3>
    <p>بموافقتك، يقرأ Sol 6.2 إجابات التوافق المحفوظة وبيانات {person.alias} الخيالية ليكتب قراءة خاصة بك. تبقى محادثاتك وصورك خارج التحليل.</p>
    <p className="wd-deep-note">تتاح لك ثلاث محاولات تجريبية يوميًا. يمكنك العودة للقراءة ما دمت في هذه المحادثة.</p>
    {error && <p role="alert" className="wd-deep-error">{error}</p>}
    {busy && <p role="status">يقرأ Sol إجاباتك ويكتب تحليلك…</p>}
    <button type="button" className="btn-primary" disabled={busy} onClick={()=>void generate()}>أوافق على استخدام إجاباتي وبدء القراءة</button>
    <button type="button" className="btn-text" onClick={()=>setExampleOpen(true)}>اقرأ مثال سارة وفهد</button>
  </div>);
}
