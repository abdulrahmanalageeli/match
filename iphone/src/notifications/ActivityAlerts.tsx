import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, MessageCircle, Route, X } from 'lucide-react';
import type { ActivityNotification, CommunitySource, StepProgress } from '../community/data';
import { playActivitySound } from '../community/matchSound';
import { useVoiceCalls } from '../voice/VoiceCalls';
import './activity.css';
import { confirmedMilestone, type MilestoneKind } from '../community/milestones';
import { MatchCelebration } from '../community/MatchCelebration';
import { compatibilitySnapshot, compareCompatibility, type CompatibilityChange, type CompatibilitySnapshot } from '../compatibility/changes';
import type { MatchFit } from '../compatibility/model';
import { CompatibilityNotice, CompatibilityChangeSheet } from './CompatibilityNotice';

type Activity = { key: string; id: string; title: string; detail: string; kind: 'message' | 'journey' | 'visit'; stamp: string };
type FitChange = { id: string; name: string; fit: MatchFit; before: CompatibilitySnapshot; change: CompatibilityChange };
export const journeyStages = ['التعارف الأول', 'نقاش جاد حول الزواج', 'الخطوة الرسمية أو العائلية'];

export function ActivityAlerts({ source, onOpen, onNotifications, celebrationsBlocked = false }: { source: CommunitySource; onOpen: (id: string) => void; onNotifications: () => void; celebrationsBlocked?: boolean }) {
  const [toast, setToast] = useState<Activity | null>(null);
  const [milestone,setMilestone]=useState<{id:string;name:string;kind:MilestoneKind}|null>(null);
  const [celebrationReady,setCelebrationReady]=useState(false);
  const [fitChanges, setFitChanges] = useState<FitChange[]>([]);
  const [fitDetailId, setFitDetailId] = useState<string | null>(null);
  const [quietSurface, setQuietSurface] = useState(false);
  const open = useRef(onOpen); open.current = onOpen;
  const inbox = useRef(onNotifications); inbox.current = onNotifications;
  const voice = useVoiceCalls();
  const occupied = useRef(false); occupied.current = Boolean(voice?.occupied);
  useEffect(() => {
    if (!source.heartbeat) return;
    let pending = false;
    const beat = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try { await source.heartbeat?.(); } catch { /* Presence expires naturally if connectivity is lost. */ }
      finally { pending = false; }
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 30_000);
    document.addEventListener('visibilitychange', beat);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', beat); };
  }, [source]);
  useEffect(() => {
    let active = true, fetching = false, dirty = false;
    const seen = new Map<string, string>(), stages = new Map<string, StepProgress>();
    const fits = new Map<string, CompatibilitySnapshot>();
    const completed = new Map<string, Activity>();
    const progress = new Map<string, StepProgress>();
    let progressAt = 0;
    let notifications: ActivityNotification[] = [];
    setToast(null);
    setFitChanges([]);setFitDetailId(null);
    setMilestone(null);setCelebrationReady(false);
    async function refresh() {
      if (!active || document.hidden) return;
      if (fetching) { dirty = true; return; }
      fetching = true;
      try {
        const connections = (await source.inbox()).filter(c => c.status === 'accepted');
        if (!active) return;
        if (source.progress && Date.now() - progressAt > 2500) {
          progressAt = Date.now();
          try { notifications = await source.notifications?.() || []; } catch { /* Retry on the next refresh. */ }
          await Promise.all(connections.map(async c => {
            try { const value = await source.progress!(c.id); if (active) progress.set(c.id, value); }
            catch { /* Keep message alerts available if a journey cannot load. */ }
          }));
        }
        if (!active) return;
        const observations = connections.map(c => ({ connection: c, previous: fits.get(c.id), snapshot: compatibilitySnapshot(c.person.fit) }));
        for (const { connection, snapshot } of observations) if (snapshot) fits.set(connection.id, snapshot);
        for (const id of fits.keys()) if (!connections.some(c => c.id === id)) fits.delete(id);
        setFitChanges(current => {
          const next: FitChange[] = [];
          for (const { connection: c, previous, snapshot } of observations) {
            if (!snapshot || !c.person.fit) continue;
            const queued = current.find(item => item.id === c.id);
            const before = queued?.before ?? previous;
            if (!before) continue; // The first authorized reading is a baseline, not a change.
            const change = compareCompatibility(before, snapshot);
            if (change) next.push({ id: c.id, name: c.person.alias, fit: c.person.fit, before, change });
          }
          // Consecutive saves become one net change per connection, rather than a stack of alerts.
          return next.length || current.length ? next : current;
        });
        const next: Activity[] = notifications.filter(n => !n.readAt).map(n => ({ key: n.id, id: n.requestId || '', kind: n.kind !== 'exclusive' ? 'visit' : 'journey', title: n.kind === 'interest' ? `اهتمام جديد من ${n.person.alias}` : n.kind === 'profile_visit' ? `${n.person.alias} زار ملفك` : 'بدأ التزامكما الحصري', detail: n.kind === 'interest' ? 'اطّلع على الملف في الإشعارات' : n.kind === 'profile_visit' ? 'اضغط لعرض الإشعارات وملف الزائر' : 'أُغلقت علاقات التعارف الأخرى', stamp: n.createdAt }));
        const openChat = document.querySelector('[data-conversation-id]')?.getAttribute('data-conversation-id');
        for (const c of connections) {
          if (c.unreadCount) next.push({ key: c.id + ':message', id: c.id, kind: 'message', title: `رسائل من ${c.person.alias}`, detail: `${c.unreadCount} رسالة غير مقروءة · فتح المحادثة`, stamp: c.lastMessage?.createdAt || String(c.unreadCount) });
          const p = progress.get(c.id), previous = stages.get(c.id);
          if (p) {
            if(p.rewindPeer) next.push({key:c.id+':rewind',id:c.id,kind:'journey',title:`${c.person.alias} يقترح خطوة إلى الوراء`,detail:'راجعا المرحلة معًا · بانتظار موافقتك',stamp:p.updatedAt||String(p.stage)});
            const achievement=confirmedMilestone(previous,p);
            if(achievement)setMilestone(current=>current??{id:c.id,name:c.person.alias,kind:achievement});
            if (previous !== undefined && p.stage > previous.stage) completed.set(c.id, { key: c.id + ':stage', id: c.id, kind: 'journey', title: 'اتفقتما على الخطوة التالية', detail: journeyStages[p.stage], stamp: String(p.stage) });
            if (previous !== undefined && (p.stage < previous.stage || previous.exclusive && !p.exclusive)) {completed.delete(c.id);setMilestone(current=>current?.id===c.id?null:current);}
            stages.set(c.id, p);
            if ((!p.exclusive && p.consentPeer && !p.consentMine) || (p.exclusive && p.peer && !p.mine && p.stage < 2)) next.push({ key: c.id + ':journey', id: c.id, kind: 'journey', title: `${c.person.alias} يقترح خطوة جديدة`, detail: (!p.exclusive ? 'التزام حصري للنقاش الجاد' : journeyStages[p.stage + 1]) + ' · بانتظار موافقتك', stamp: String(p.stage) });
          }
          const done = completed.get(c.id);
          if (done) next.push(done);
        }
        setMilestone(current=>current && !connections.some(c=>c.id===current.id)?null:current);
        // A withdrawn request can be proposed again and should alert again.
        for (const key of seen.keys()) if (!next.some(item => item.key === key)) seen.delete(key);
        let newest: Activity | undefined;
        for (const item of next) {
          if (seen.get(item.key) !== item.stamp && !(item.kind === 'message' && item.id === openChat)) newest = item;
          seen.set(item.key, item.stamp);
        }
        // Replace retained alerts with current metadata after deletions/read receipts.
        setToast(current => newest || next.find(item => item.key === current?.key) || null);
        if (newest && !occupied.current) playActivitySound();
      } catch { /* Existing inbox error handling owns connection failures. */ }
      finally { fetching = false; if (dirty && active) { dirty = false; void refresh(); } }
    }
    void refresh();
    const stop = source.watch(() => void refresh());
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; stop(); document.removeEventListener('visibilitychange', refresh); };
  }, [source]);
  const fitDetail = fitChanges.find(item => item.id === fitDetailId);
  useEffect(() => { if (fitDetailId && !fitDetail) setFitDetailId(null); }, [fitDetailId, fitDetail]);
  useEffect(() => { if (voice?.occupied || celebrationsBlocked) setFitDetailId(null); }, [voice?.occupied, celebrationsBlocked]);
  // A small notice can coexist with typing, but never compete with a call, modal or celebration.
  useEffect(() => {
    if (!fitChanges.length || toast || celebrationsBlocked || celebrationReady || voice?.occupied || fitDetailId) {
      setQuietSurface(false); return;
    }
    const check = () => setQuietSurface(!document.hidden && !document.querySelector('dialog[open]'));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    document.addEventListener('visibilitychange', check);check();
    return () => { observer.disconnect();document.removeEventListener('visibilitychange', check); };
  }, [fitChanges.length, toast, celebrationsBlocked, celebrationReady, voice?.occupied, fitDetailId]);
  const dismissFit = (id: string) => { setFitChanges(items => items.filter(item => item.id !== id));setFitDetailId(null); };
  // Let the member finish a dialog, typing or a call before presenting a milestone.
  useEffect(()=>{
    if(!milestone){setCelebrationReady(false);return;}
    if(celebrationReady||celebrationsBlocked||voice?.occupied)return;
    let timer:number|undefined;
    const check=()=>{clearTimeout(timer);timer=window.setTimeout(()=>{
      if(!document.hidden&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName??''))setCelebrationReady(true);
    },120);};
    const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
    document.addEventListener('focusout',check);document.addEventListener('visibilitychange',check);check();
    return()=>{clearTimeout(timer);observer.disconnect();document.removeEventListener('focusout',check);document.removeEventListener('visibilitychange',check);};
  },[milestone,celebrationReady,celebrationsBlocked,voice?.occupied]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const visit = (item: Activity) => { setToast(null); if (item.kind === 'visit' || !item.id) inbox.current(); else open.current(item.id); };
  return <aside className="nf-activity" aria-label="تنبيهات المحادثات">
    {toast && !celebrationReady && <div className="nf-activity-toast" role="status">
      <button className="nf-activity-item" onClick={() => visit(toast)}>{toast.kind === 'message' ? <MessageCircle size={20}/> : <Route size={20}/>}<span><strong>{toast.title}</strong><small>{toast.detail}</small></span><ChevronLeft size={16}/></button>
      <button className="nf-activity-dismiss" aria-label="إخفاء التنبيه" onClick={() => setToast(null)}><X size={17}/></button>
    </div>}
    {quietSurface && !toast && !celebrationReady && !celebrationsBlocked && !voice?.occupied && !fitDetailId && fitChanges[0] &&
      <CompatibilityNotice key={fitChanges[0].id + fitChanges[0].change.key} name={fitChanges[0].name} change={fitChanges[0].change}
        onOpen={() => setFitDetailId(fitChanges[0].id)} onDismiss={() => dismissFit(fitChanges[0].id)}/>}
    {fitDetail && !voice?.occupied && !celebrationsBlocked && <CompatibilityChangeSheet name={fitDetail.name} change={fitDetail.change} fit={fitDetail.fit} onClose={() => dismissFit(fitDetail.id)}/>}
    {milestone&&celebrationReady&&!celebrationsBlocked&&!voice?.occupied&&<MatchCelebration key={milestone.id+milestone.kind} name={milestone.name} milestone={milestone.kind} continueLabel="متابعة المحادثة" onClose={()=>setMilestone(null)} onContinue={()=>{const id=milestone.id;setMilestone(null);setToast(null);open.current(id);}}/>}

  </aside>;
}
