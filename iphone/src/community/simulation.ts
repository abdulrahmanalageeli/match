import type { Message, PublicPerson } from './data';
import personas from './demoPersonas.json' with { type: 'json' };
import { demoVisitWindows, nextDemoVisit, rhythmHash, riyadhDay } from './simulationRhythm.ts';

const chatBriefs = new Map(personas.map(person => [person.id, person]));

export type DemoSimulationEvent = { id: string; at: string; kind: string; personId?: string; detail: string; connectionId?: string };
type SocialKind = 'profile_visit' | 'interest' | 'request';
export type PlannedDemoActivity = { id: string; personId: string; dueAt: number } & (
  {kind:SocialKind} | {kind:'reply'|'match';connectionId:string}
);
type PreparedReply = { planId:string; turn:string; body:string; kind:string; sessionOnly?:boolean };
export type DemoSimulationHistory = { eventCount?: number; log?: DemoSimulationEvent[]; plannedActivity?: PlannedDemoActivity; preparedReply?:PreparedReply; socialHistory?: {personId:string; stage:number; at:number}[] };
export type DemoSimulationSnapshot = DemoSimulationHistory & { running: boolean; busy: boolean; participants: string[]; eventCount: number; log: DemoSimulationEvent[] };
export type DemoSimulationOptions = {
  membershipTier?: () => 'free' | 'premium' | 'seriousness';
  storageKey?: string;
  externalAccepted?: () => number;
  canAct?: () => boolean;
  interactiveJourney?: boolean;
  useAvailableTesterBasics?: boolean;
  generateReading?: (id: string) => Promise<Pick<import('./deepCompatibilityModel').DeepSnapshot,'findings'|'review'>>;
  random?: () => number;
  aiReply?: (input: { person: PublicPerson; messages: { senderIsMe: boolean; body: string }[] }) => Promise<string>;
};
export type DemoSimulationController = {
  snapshot(): DemoSimulationSnapshot;
  nextActivity(): PlannedDemoActivity | undefined;
  reconcileActivity(eventId:string): void;
  start(): void;
  pause(): void;
  step(): Promise<void>;
  wake(): void;
  reset(): void;
  dispose(): void;
};
export type SimulationRecord = {
  id: string; peer: string; direction: 'incoming' | 'outgoing'; status: 'pending' | 'accepted' | 'closed';
  createdAt: string; updatedAt: string; allowRematch?: boolean; celebrationKey?: string;
  closureContext?: import('./data').IntroductionClosure['context'];
};
type World = {
  people(): PublicPerson[];
  records: SimulationRecord[];
  messages: Map<string, Message[]>;
  available(personId: string): boolean;
  exclusive(): boolean;
  online: Set<string>;
  typing?: Set<string>;
  chatReady?(id: string): boolean;
  conversationAllowed?(id: string): boolean;
  advanceRelationship?(record: SimulationRecord): string | undefined;
  activity(kind: 'profile_visit' | 'interest', personId: string, event?: PlannedDemoActivity): void;
  activityEligible?(kind: 'profile_visit' | 'interest', personId: string): boolean;
  canRequestAt?(id:string,at:number): boolean;
  changed(): void;
  reset(): void;
};

function hash(value: string) { return [...value].reduce((n, c) => n * 31 + c.charCodeAt(0) >>> 0, 7); }

/** Keep early introductions as anchors and recent turns, without uploading media. */
export function simulationHistory(rows: readonly Message[]): { senderIsMe: boolean; body: string }[] {
  const usable = rows.filter(row => !row.deletedAt).map(row => ({ senderIsMe: row.senderIsMe,
    body: row.attachment ? (row.attachment.kind === 'photo' ? '[صورة مرفقة؛ محتواها غير متاح للمحاكاة]' : '[رسالة صوتية؛ محتواها غير متاح للمحاكاة]') : row.body.slice(0, 1000) }));
  const selected = usable.length <= 32 ? usable : [...usable.slice(0, 4), ...usable.slice(-28)];
  while (selected.reduce((total, row) => total + row.body.length, 0) > 8000 && selected.length > 1) selected.splice(selected.length > 5 ? 4 : 0, 1);
  return selected;
}

/** A local test participant, never an autonomous action against a live member. */
export function fictionalReply(person: PublicPerson, history: { senderIsMe: boolean; body: string }[]): string {
  const recent = history.filter(message => message.senderIsMe).at(-1)?.body ?? '';
  const round = history.filter(message => !message.senderIsMe).length;
  if (/ذكاء اصطناعي|بوت|حقيقي[ةه]?|انسان|إنسان/.test(recent)) return 'أنا شخصية ضمن محاكاة وُدَين للتجربة، مو حساب شخص حقيقي.';
  if (/محتواها غير متاح/.test(recent)) return 'وصل المرفق، بس ما أقدر أشوف الصور أو أسمع الصوت في المحاكاة. اكتب لي اللي ودك تقوله وبرد عليك.';
  if (/رقم|واتساب|عنوان|موقعك|سناب/.test(recent)) return 'خلّنا نبقى هنا بالبداية لين نتعرف أكثر ونرتاح للخطوة الجاية.';
  const brief = chatBriefs.get(person.id);
  if (!brief) return 'هلا فيك، وش تحب نتكلم عنه؟';
  const said = new Set(history.filter(message => !message.senderIsMe).map(message => message.body));
  if (!recent) return brief.opener;
  if (/زواج|خطبة|رسمي|الأهل|الاهل|لقاء/.test(recent)) {
    if (brief.meeting === 'family_before_formal') return 'أرتاح أكثر إذا اللقاء الأول كان بحضور الأهل، بعد ما نتفق على الأساسيات.';
    if (brief.meeting === 'after_formal') return 'بالنسبة لي اللقاء يكون بعد الخطوة الرسمية. هنا نقدر نسولف عن اللي يهمنا قبلها.';
    if (brief.meeting === 'public_before_formal') return 'أفضل مكان عام قبل الخطوة الرسمية، وقت ما نكون مرتاحين للفكرة.';
    return 'ما عندي طريقة وحدة في بالي، ودي نتفق على اللي يناسبنا الاثنين.';
  }
  if (/عمل|دوام|مهن|شغل|يومك|يومج/.test(recent)) return brief.daily;
  if (/خلاف|زعل|نقاش|عص[بّ]/.test(recent)) {
    const responses: Record<string, string> = {
      A:'أفضل نتكلم في وقته. إذا فهمت وش ضايقك يسهل علي أوضح اللي عندي.',
      B:'أحتاج أهدأ شوي، بس أحب نتفق متى نرجع نكمل الكلام.',
      C:'أستعجل أحيان وأبي نحسمها وقتها. أحاول أعطي اللي قدامي فرصة يتكلم.',
      D:'إذا تضايقت أسكت فترة. الرجوع لنفس السالفة مو سهل علي.',
    };
    return responses[brief.practical.conflict_response];
  }
  if (/بيت|سكن|منزل/.test(recent)) return brief.home;
  if (/شريك|شريكة|تدور|تبحث|توقعات/.test(recent)) return brief.lookingFor;
  if (/أوقات فراغ|فراغك|هواي|ويكند|إجاز|اجاز|اهتمام/.test(recent)) return brief.pastime;
  if (/سلام عليكم/.test(recent) && !round) return brief.opener.replace(/^[^،.!]+[،.!]/u, 'وعليكم السلام،');
  if (/كيفك|كيف حال|أخبار|اخبار|مرحبا|أهلين|اهلين|هلا/.test(recent) && !said.has(brief.opener)) return brief.opener;
  const replies = [brief.followUp, brief.values, brief.lookingFor, brief.daily];
  return replies.find(reply => !said.has(reply)) ?? replies[round % replies.length];
}

export function createDemoSimulation(world: World, options: DemoSimulationOptions = {}, initial?: DemoSimulationHistory): DemoSimulationController {
  let running = false, busy = false, disposed = false, generation = 0;
  let eventCount = Math.max(0, initial?.eventCount ?? 0);
  let log = (initial?.log ?? []).slice(-30);
  const random = options.random ?? Math.random;
  const lastVisits = new Map<string, number>();
  const social = new Map<string, number>();
  const refusedTurns = new Map<string, string | undefined>();
  let planned = initial?.plannedActivity;
  let prepared = initial?.preparedReply;
  let wasAuthorized = false;
  for (const item of initial?.socialHistory ?? []) {
    social.set(item.personId,item.stage);
    lastVisits.set(item.personId,item.at);
  }
  for (const event of log) if (event.personId && ['profile_visit', 'interest', 'request'].includes(event.kind)) {
    social.set(event.personId, Math.max(social.get(event.personId)??0,event.kind === 'profile_visit' ? 1 : event.kind === 'interest' ? 2 : 3));
    lastVisits.set(event.personId,Math.max(lastVisits.get(event.personId) ?? 0,Date.parse(event.at)));
  }
  const typing = world.typing ?? new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wakeAfterStep = false;
  const participants = (people = world.people()) => {
    const salt = (options.storageKey ?? 'standalone') + '/' + riyadhDay(Date.now());
    return [...new Set([...people.slice().sort((a,b)=>rhythmHash(a.id+salt)-rhythmHash(b.id+salt)).slice(0, 5).map(person => person.id),
      ...world.records.filter(record => record.status !== 'closed').map(record => record.peer)])];
  };
  function add(kind: string, personId: string | undefined, detail: string, plan?: PlannedDemoActivity) {
    eventCount++;
    log = [...log, { id: plan?.id ?? crypto.randomUUID(), at: new Date(plan?.dueAt ?? Date.now()).toISOString(), kind, personId, detail,
      ...(plan && 'connectionId' in plan && {connectionId:plan.connectionId}) }].slice(-30);
  }
  const acceptedCount = () => world.records.filter(record => record.status === 'accepted').length + Math.max(0, options.externalAccepted?.() ?? 0);
  const willAccept = (id:string) => options.interactiveJourney || hash(id) % 4 !== 0;
  function activityAllowed(kind: SocialKind, id: string) {
    if (world.exclusive() || !world.available(id) || world.records.some(r => r.peer === id && r.status !== 'closed')) return false;
    if (kind !== 'request') return world.activityEligible?.(kind,id) !== false;
    return world.records.filter(r => r.status === 'pending').length < 2 && acceptedCount() < 2;
  }
  function waitingTurn(record:SimulationRecord) {
    if (record.status !== 'accepted' || !world.available(record.peer) || world.chatReady?.(record.id) === false ||
      world.conversationAllowed?.(record.id) === false || (world.exclusive() && !world.conversationAllowed)) return;
    const transcript = world.messages.get(record.id) ?? [];
    const rows = transcript.filter(row=>!row.deletedAt);
    const last = rows.at(-1);
    if (!last && transcript.length) return;
    if (last && !last.senderIsMe || refusedTurns.has(record.id) && refusedTurns.get(record.id) === last?.id) return;
    const history = simulationHistory(rows);
    const durableHistory = rows.some(row=>row.attachment) ? simulationHistory(rows.filter(row=>!row.attachment)) : history;
    return {last,history,key:(last?.id ?? 'opener')+'/'+rhythmHash(JSON.stringify(durableHistory))};
  }
  function planValid(plan:PlannedDemoActivity) {
    if (!('connectionId' in plan)) return activityAllowed(plan.kind,plan.personId) &&
      (plan.kind !== 'request' || world.canRequestAt?.(plan.personId,plan.dueAt) !== false);
    const record=world.records.find(row=>row.id===plan.connectionId && row.peer===plan.personId);
    if (!record || !world.available(record.peer)) return false;
    if (plan.kind==='match') return !world.exclusive() && record.status==='pending' && record.direction==='outgoing' && acceptedCount()<2 && willAccept(record.peer);
    return prepared?.planId===plan.id && waitingTurn(record)?.key===prepared.turn;
  }
  function cancelPlan() { planned=undefined; prepared=undefined; }
  function visiblePlan() {
    if (options.canAct?.()===false) {
      if (wasAuthorized) cancelPlan();
      wasAuthorized=false;
      return;
    }
    wasAuthorized=true;
    if (planned && !planValid(planned)) cancelPlan();
    return planned;
  }
  function chooseAmbientPlan(people: PublicPerson[]) {
    if (visiblePlan() || options.canAct?.() === false || world.exclusive()) return;
    const now = Date.now();
    const slots = people.flatMap(person => {
      const id = person.id, stage = social.get(id) ?? 0;
      const disposition = rhythmHash(id + 'interest') % 10;
      const kind = stage === 0 ? 'profile_visit' : stage === 1 && disposition >= 3 ? 'interest' :
        stage === 2 && disposition >= 7 && person.membershipTier !== 'free' ? 'request' : 'profile_visit';
      if (!activityAllowed(kind,id)) return [];
      const seed = rhythmHash(id + '/' + riyadhDay(now) + '/' + eventCount);
      const gap = kind === 'profile_visit' ? (24 + seed % 49) * 3600_000 : (3 + seed % 15) * 3600_000;
      const earliest = Math.max(now + (35 + seed % 96) * 60_000, (lastVisits.get(id) ?? 0) + gap);
      const dueAt = nextDemoVisit(id,earliest);
      if (kind === 'request' && world.canRequestAt?.(id,dueAt) === false) return [];
      return [{personId:id, kind, dueAt} as const];
    });
    const next = slots.sort((a,b)=>a.dueAt-b.dueAt)[0];
    if (next) planned = {...next,id:crypto.randomUUID()};
  }
  async function writeReply(person:PublicPerson, history:ReturnType<typeof simulationHistory>, last?:Message) {
    const fallback = fictionalReply(person,history);
    if (!options.aiReply || last?.attachment) return {body:fallback,kind:'reply'};
    try {
      const text = await options.aiReply({person,messages:history});
      return typeof text==='string' && text.trim() && text.length<=1000 ? {body:text.trim(),kind:'ai_reply'} : {body:fallback,kind:'reply_fallback'};
    } catch (error) {
      if (error instanceof Error && 'lunaSecurity' in error) {
        if (typeof window!=='undefined') window.dispatchEvent(new CustomEvent('wudayn:luna-notice',{detail:error.message}));
        return;
      }
      return {body:fallback,kind:'reply_fallback'};
    }
  }
  async function choosePlan(people:PublicPerson[], ticket:number) {
    const current=visiblePlan(), now=Date.now();
    const candidates: {kind:'reply'|'match';connectionId:string;person:PublicPerson;dueAt:number}[]=[];
    for (const record of world.records) {
      const person=people.find(p=>p.id===record.peer);
      if (!person) continue;
      const matching=record.status==='pending' && record.direction==='outgoing' && !world.exclusive() && acceptedCount()<2 && willAccept(record.peer);
      const turn=matching ? undefined : waitingTurn(record);
      if (!matching && !turn) continue;
      let dueAt=current && 'connectionId' in current && current.connectionId===record.id ? current.dueAt : undefined;
      if (turn?.last) {
        // An incoming message wakes the fictional peer, including between personal check-ins.
        const sentAt=Date.parse(turn.last.createdAt) || now;
        const delay=(8 + rhythmHash(record.peer+turn.key)%13)*1000;
        dueAt=Math.min(dueAt ?? Infinity, Math.max(now+1000,sentAt+delay));
      } else if (dueAt===undefined) {
        const at=Date.parse(record.updatedAt) || now;
        const delay=(matching ? 5+rhythmHash(record.id)%26 : 1+rhythmHash(record.peer+(turn?.key ?? ''))%9)*60_000;
        dueAt=nextDemoVisit(person.id,Math.max(now+1000,at+delay));
      }
      candidates.push({kind:matching?'match':'reply',connectionId:record.id,person,dueAt});
    }
    const next=candidates.sort((a,b)=>a.dueAt-b.dueAt)[0];
    if (!next) { chooseAmbientPlan(people); return; }
    if (current && 'connectionId' in current && current.connectionId===next.connectionId) {
      if (next.dueAt<current.dueAt) planned={...current,dueAt:next.dueAt};
      return;
    }
    const record=world.records.find(row=>row.id===next.connectionId)!;
    const plan:PlannedDemoActivity={id:crypto.randomUUID(),kind:next.kind,connectionId:record.id,personId:record.peer,dueAt:next.dueAt};
    if (next.kind==='reply') {
      const turn=waitingTurn(record);
      if (!turn) return;
      const reply=await writeReply(next.person,turn.history,turn.last);
      if (ticket!==generation || !running || disposed || options.canAct?.()===false || waitingTurn(record)?.key!==turn.key) return;
      if (!reply) { refusedTurns.set(record.id,turn.last?.id); return; }
      prepared={planId:plan.id,turn:turn.key,...reply,sessionOnly:!!turn.last?.attachment};
    } else prepared=undefined;
    planned=plan;
  }
  function commitPlan(plan: PlannedDemoActivity, person: PublicPerson) {
    const {kind,personId:id} = plan;
    const at=new Date(plan.dueAt).toISOString();
    if ('connectionId' in plan) {
      const record=world.records.find(row=>row.id===plan.connectionId)!;
      if (kind==='match') {
        record.status='accepted';record.allowRematch=true;record.updatedAt=at;record.celebrationKey=plan.id;
        add(kind,id,`${person.alias}: قبل طلب التعارف`,plan);
      } else if (prepared) {
        const rows=world.messages.get(record.id) ?? [];
        for (const row of rows) if (row.senderIsMe && !row.deletedAt) { row.deliveredAt ??= at; row.readAt ??= at; }
        rows.push({id:plan.id,createdAt:at,body:prepared.body,senderIsMe:false});
        world.messages.set(record.id,rows);record.updatedAt=at;typing.delete(record.id);
        add('reply',id,`${person.alias}: أرسل رسالة`,plan);
      }
      return;
    }
    if (plan.kind === 'request') {
      world.records.unshift({id:plan.id, peer:id,direction:'incoming',status:'pending',createdAt:at,updatedAt:at});
    } else world.activity(plan.kind,id,plan);
    social.set(id, Math.max(social.get(id) ?? 0, kind === 'request' ? 3 : kind === 'interest' ? 2 : 1));
    lastVisits.set(id,plan.dueAt);
    add(kind,id,`${person.alias}: ${kind === 'request' ? 'أرسل طلب تعارف' : kind === 'interest' ? 'اهتمام بملفك' : 'زيارة لملفك'}`,plan);
  }
  function reconcileActivity(eventId:string, roster=world.people()) {
    if (!running || disposed || (typeof document!=='undefined' && document.hidden)) return false;
    const plan=visiblePlan();
    if (!plan || plan.id!==eventId || plan.dueAt>Date.now()) return false;
    const person=roster.find(p=>p.id===plan.personId);
    if (person) commitPlan(plan,person);
    cancelPlan();changed();
    return Boolean(person);
  }
  function changed() { world.changed(); }
  function clearPresence() { generation++; world.online.clear(); typing.clear(); }
  function stopTimer() { if (timer) clearTimeout(timer); timer = undefined; }
  function pause() { running = false; clearPresence(); stopTimer();cancelPlan(); changed(); }
  function schedule(soon = false) {
    stopTimer();
    if (!running || disposed || typeof document!=='undefined' && document.hidden) return;
    soon ||= wakeAfterStep; wakeAfterStep=false;
    timer = setTimeout(async () => {
      timer = undefined;
      if (typeof document === 'undefined' || !document.hidden) await step(true);
      schedule();
    }, soon ? 100 : Math.min(Math.max(100, (visiblePlan()?.dueAt ?? Infinity) - Date.now()),
      typing.size ? 1800 + random() * 4000 : world.online.size ? 5000 + random() * 22_000 : 65_000 + random() * 45_000));
  }
  const visible = () => { if (document.hidden) { stopTimer();clearPresence(); changed(); } else if (running) schedule(true); };
  let observing = false;
  async function step(automatic = false) {
    if (busy || disposed || (typeof document !== 'undefined' && document.hidden) || options.canAct?.() === false) return;
    busy = true; const ticket = generation;
    changed();
    try {
      const roster = world.people();
      const pool = new Set(participants(roster));
      const cohort = roster.filter(person => pool.has(person.id) && world.available(person.id));
      let people = cohort;
      if (automatic) {
        const now = Date.now(), plan = visiblePlan();
        if (plan && !roster.some(p => p.id === plan.personId)) planned = undefined;
        const due = planned && reconcileActivity(planned.id,roster);
        await choosePlan(cohort,ticket);
        if (ticket!==generation || !running || disposed) return;
        people = cohort.filter(person => demoVisitWindows(person.id,now).some(w => w.start <= now && now < w.end));
        world.online.clear();
        for (const person of people) world.online.add(person.id);
        if (due) return;
      }
      for (const id of typing) if (!world.records.some(record => record.id === id && record.status === 'accepted' && people.some(person => person.id === record.peer))) typing.delete(id);
      if (!people.length) return;
      const allowed = (id: string) => ticket === generation && !disposed && (!world.exclusive() || Boolean(world.conversationAllowed)) && options.canAct?.() !== false && world.available(id);
      const pending = world.records.find(record => record.status === 'pending' && record.direction === 'outgoing' && people.some(person => person.id === record.peer));
      if (pending && (!automatic || !willAccept(pending.peer)) && acceptedCount() < 2 && !world.exclusive()) {
        const person = people.find(person => person.id === pending.peer)!;
        const decline = !options.interactiveJourney && hash(person.id) % 4 === 0;
        pending.status = decline ? 'closed' : 'accepted'; pending.updatedAt = new Date().toISOString();
        pending.allowRematch = !decline;
        if (!decline) pending.celebrationKey = crypto.randomUUID();
        add(decline ? 'decline' : 'match', person.id, `${person.alias}: ${decline ? 'اعتذر عن طلب التعارف' : 'قبل طلب التعارف'}`);
        return;
      }
      for (const record of world.records.filter(row => row.status === 'accepted' && people.some(person => person.id === row.peer) && world.conversationAllowed?.(row.id) !== false)) {
        const event = world.advanceRelationship?.(record);
        if (event) { add('journey', record.peer, event); return; }
      }
      const chat = world.records.find(record => {
        if (record.status !== 'accepted' || !people.some(person => person.id === record.peer)) return false;
        if (world.chatReady?.(record.id) === false || world.conversationAllowed?.(record.id) === false || world.exclusive() && !world.conversationAllowed) return false;
        const rows = (world.messages.get(record.id) ?? []).filter(row => !row.deletedAt);
        if (automatic && (planned?.kind!=='reply' || planned.connectionId!==record.id || planned.dueAt-Date.now()>90_000)) return false;
        if (refusedTurns.has(record.id) && refusedTurns.get(record.id) === rows.at(-1)?.id) return false;
        return !rows.length || rows.at(-1)?.senderIsMe;
      });
      if (chat) {
        const person = people.find(person => person.id === chat.peer)!;
        const rows = world.messages.get(chat.id) ?? [];
        const last = rows.filter(row => !row.deletedAt).at(-1);
        if (last?.senderIsMe && !last.deliveredAt) {
          const time = new Date().toISOString();
          rows.filter(row => row.senderIsMe && !row.deletedAt).forEach(row => { row.deliveredAt ??= time; });
          add('delivered', person.id, `${person.alias}: وصلت الرسالة`); return;
        }
        if (last?.senderIsMe && !last.readAt) {
          const time = new Date().toISOString();
          rows.filter(row => row.senderIsMe && !row.deletedAt).forEach(row => { row.deliveredAt ??= time; row.readAt ??= time; });
          world.online.add(person.id); add('read', person.id, `${person.alias}: قرأ الرسالة`); return;
        }
        if (last?.senderIsMe && !last.attachment && rows.filter(row=>row.senderIsMe&&!row.deletedAt).length % 4 === 0 && !last.reactions?.some(reaction=>reaction.count>Number(reaction.mine))) {
          const emoji = /هه|😂|ضحك/.test(last.body) ? '😂' : /شكرا|شكرًا|الله يسعد/.test(last.body) ? '🙏' : '👍';
          const existing=last.reactions?.find(reaction=>reaction.emoji===emoji);
          last.reactions=[...(last.reactions??[]).filter(reaction=>reaction.emoji!==emoji),{emoji,count:(existing?.count??0)+1,mine:existing?.mine??false}];
          add('reaction',person.id,`${person.alias}: تفاعل مع الرسالة`);return;
        }
        if (!typing.has(chat.id)) { typing.add(chat.id); world.online.add(person.id); add('typing', person.id, `${person.alias}: يكتب الآن`); return; }
        if (automatic) return;
        const history = simulationHistory(rows);
        const reply = planned?.kind==='reply' && planned.connectionId===chat.id && planValid(planned) && prepared ? prepared : await writeReply(person,history,last);
        typing.delete(chat.id);
        if (!allowed(person.id) || chat.status !== 'accepted' || world.chatReady?.(chat.id) === false || world.conversationAllowed?.(chat.id) === false || rows.filter(row => !row.deletedAt).at(-1)?.id !== last?.id || JSON.stringify(simulationHistory(rows)) !== JSON.stringify(history)) return;
        if (!reply) { refusedTurns.set(chat.id,last?.id); return; }
        const {body,kind}=reply;
        const createdAt = new Date().toISOString();
        rows.push({ id: crypto.randomUUID(), senderIsMe: false, body, createdAt });
        world.messages.set(chat.id, rows); chat.updatedAt = createdAt; world.online.add(person.id);
        add(kind, person.id, `${person.alias}: ${kind === 'reply_fallback' ? 'رد محلي مؤقت؛ المساعد غير متاح' : 'أرسل رسالة'}`);
        return;
      }
      if (world.exclusive() || automatic) return;
      const person = people[Math.min(people.length-1, Math.floor(random() * people.length))];
      const phase = social.get(person.id) ?? 0;
      if (phase === 2 && person.membershipTier !== 'free' && activityAllowed('request', person.id) &&
        world.canRequestAt?.(person.id, Date.now()) !== false) {
        const time = new Date().toISOString();
        world.records.unshift({ id: crypto.randomUUID(), peer: person.id, direction: 'incoming', status: 'pending', createdAt: time, updatedAt: time });
        add('request', person.id, `${person.alias}: أرسل طلب تعارف`);
        social.set(person.id, 3);
      } else if (phase >= 2) {
        if(Date.now()-(lastVisits.get(person.id)??0)>90_000&&random()<.3) {
          world.activity('profile_visit',person.id);lastVisits.set(person.id,Date.now());add('profile_visit',person.id,`${person.alias}: زيارة لملفك`);return;
        }
        const online = !world.online.has(person.id);
        if (online) world.online.add(person.id); else world.online.delete(person.id);
        add('presence', person.id, `${person.alias}: ${online ? 'متصل الآن' : 'غادر التطبيق'}`);
      } else {
        const kind = phase === 1 ? 'interest' : 'profile_visit';
        world.activity(kind, person.id);
        if(kind==='profile_visit')lastVisits.set(person.id,Date.now());
        social.set(person.id, phase + 1);
        add(kind, person.id, `${person.alias}: ${kind === 'interest' ? 'اهتمام بملفك' : 'زيارة لملفك'}`);
      }
    } finally {
      busy = false;
      changed();
    }
  }
  return {
    nextActivity: () => running && !disposed && !prepared?.sessionOnly ? visiblePlan() : undefined,
    reconcileActivity:eventId=>{ if (reconcileActivity(eventId)) schedule(true); },
    snapshot: () => {
      const plan=visiblePlan() ?? planned;
      // Local demo attachments disappear on restart. Their replies stay in the open session.
      return { running, busy, participants: participants(), eventCount, log: [...log],
        plannedActivity:prepared?.sessionOnly ? undefined : plan, preparedReply:prepared?.sessionOnly ? undefined : prepared,
        socialHistory:[...social].map(([personId,stage])=>({personId,stage,at:lastVisits.get(personId) ?? 0})) };
    },
    start() { if (running) return; disposed = false; running = true; if (!observing && typeof document !== 'undefined') { document.addEventListener('visibilitychange', visible); observing = true; } changed(); schedule(true); },
    pause, step:()=>step(),
    wake() {
      if (!running) return;
      if (busy) { wakeAfterStep=true;return; }
      stopTimer();void step(true).finally(()=>schedule());
    },
    reset() { pause(); world.reset(); eventCount = 0; log = []; planned = undefined; social.clear(); lastVisits.clear(); refusedTurns.clear(); changed(); },
    dispose() { pause(); disposed = true; if (observing) { document.removeEventListener('visibilitychange', visible); observing = false; } },
  };
}
