import type { Message, PublicPerson } from './data';

export type DemoSimulationEvent = { id: string; at: string; kind: string; personId?: string; detail: string };
export type DemoSimulationSnapshot = { running: boolean; busy: boolean; participants: string[]; eventCount: number; log: DemoSimulationEvent[] };
export type DemoSimulationOptions = {
  storageKey?: string;
  externalAccepted?: () => number;
  canAct?: () => boolean;
  interactiveJourney?: boolean;
  random?: () => number;
  aiReply?: (input: { person: PublicPerson; messages: { senderIsMe: boolean; body: string }[] }) => Promise<string>;
};
export type DemoSimulationController = {
  snapshot(): DemoSimulationSnapshot;
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
  activity(kind: 'profile_visit' | 'interest', personId: string): void;
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
  const style = (hash(person.id) >>> 1) % 3;
  if (/ذكاء اصطناعي|بوت|حقيقي[ةه]?|انسان|إنسان/.test(recent)) return 'أنا شخصية ضمن محاكاة نصفين للتجربة، مو حساب شخص حقيقي.';
  if (/محتواها غير متاح/.test(recent)) return 'وصل المرفق، بس ما أقدر أشوف الصور أو أسمع الصوت في المحاكاة. اكتب لي اللي ودك تقوله وبرد عليك.';
  if (/رقم|واتساب|عنوان|موقعك|سناب/.test(recent)) return 'خلّنا نبقى هنا بالبداية لين نتعرف أكثر ونرتاح للخطوة الجاية.';
  if (/زواج|شهر|رسمي|أهل|لقاء/.test(recent)) {
    if (person.marriageBasics?.meetingPreference === 'family_before_formal') return 'أفضّل أن يكون اللقاء الأول بحضور الأهل، بعد أن نتفق على الأمور الأساسية. ما الذي يناسبك؟';
    if (person.marriageBasics?.meetingPreference === 'after_formal') return 'أرتاح أكثر للقاء بعد الخطوة الرسمية. قبل ذلك يهمني أن نتحدث بوضوح عن توقعاتنا للحياة.';
    return 'أحب أن نفهم توقعات بعض أولًا، ثم نتفق على لقاء وطريقة واضحة تناسب الطرفين. ما أهم شيء تريد معرفته قبلها؟';
  }
  if (/عمل|دوام|مهنة|شغل/.test(recent)) return `أنا في مجال ${person.occupation}، الدوام ياخذ جزء من اليوم بس أحب يكون فيه وقت للبيت بعد. كيف يومك عادة؟`;
  if (/سفر|رحل|مكان/.test(recent)) return ['أستمتع بالرحلات الهادئة أكثر من البرنامج المزدحم. أحب أن أترك وقتًا للمشي واكتشاف المكان. وأنت؟', 'أحب السفر بين فترة وأخرى، لكن ما يهمني أكثر هو من أشارك معه الرحلة. هل تفضّل البحر أم الجبال؟'][style % 2];
  if (/خلاف|زعل|عصب|نقاش/.test(recent)) return 'إذا صار خلاف، أفضّل أن نفهم السبب بدون تجريح. أحيانًا أحتاج وقتًا قصيرًا للهدوء ثم نرجع للكلام. هل يناسبك ذلك؟';
  if (/كيفك|كيف حال|أخبار|السلام|مرحبا|أهل|هلا/.test(recent)) return ['هلا والله، الحمد لله بخير. كيف كان يومك؟', 'وعليكم السلام، أهلين. حلو نبدأ بهدوء ونتعرف شوي على بعض', 'هلا فيك، الحمد لله. وش أخبارك اليوم؟'][style];
  const interest = person.interests[round % Math.max(1, person.interests.length)] || 'المشي';
  return [
    `من الأشياء التي أستمتع بها ${interest}. أحب أن تكون لنا اهتمامات مشتركة مع مساحة خاصة لكل واحد. ما الذي تحب فعله في نهاية الأسبوع؟`,
    'أفهم وجهة نظرك. بالنسبة لي، التفاصيل اليومية والاهتمام الصغير تفرق كثيرًا. كيف تتخيل يومًا عاديًا جميلًا في البيت؟',
    'أحب الوضوح في الأمور المهمة، حتى لو اختلفنا في بعض التفاصيل. ما الشيء الذي تعتبره أساسيًا في شريك الحياة؟',
    'خلّني أفكر في كلامك قليلًا؛ ما أحب أعطي جوابًا مستعجلًا. أقدّر أننا نتكلم بصراحة ومن دون ضغط.',
  ][(round + style) % 4];
}

export function createDemoSimulation(world: World, options: DemoSimulationOptions = {}, initial?: { eventCount?: number; log?: DemoSimulationEvent[] }): DemoSimulationController {
  let running = false, busy = false, disposed = false, generation = 0;
  let eventCount = Math.max(0, initial?.eventCount ?? 0);
  let log = (initial?.log ?? []).slice(-30);
  const random = options.random ?? Math.random;
  const seed = Math.floor(random() * 0x7fffffff);
  const lastVisits = new Map<string, number>();
  const social = new Map<string, number>();
  for (const event of log) if (event.personId && ['profile_visit', 'interest', 'request'].includes(event.kind)) {
    social.set(event.personId, Math.max(social.get(event.personId)??0,event.kind === 'profile_visit' ? 1 : event.kind === 'interest' ? 2 : 3));
    if(event.kind==='profile_visit')lastVisits.set(event.personId,Date.parse(event.at));
  }
  const typing = world.typing ?? new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const participants = () => {
    const people = world.people();
    // Spread participants across the roster instead of animating every account.
    return [...new Set([...people.slice().sort((a,b)=>hash(a.id+seed)-hash(b.id+seed)).slice(0, 5).map(person => person.id),
      ...world.records.filter(record => record.status !== 'closed').map(record => record.peer)])];
  };
  function add(kind: string, personId: string | undefined, detail: string) {
    eventCount++;
    log = [...log, { id: crypto.randomUUID(), at: new Date().toISOString(), kind, personId, detail }].slice(-30);
  }
  function changed() { world.changed(); }
  function clearPresence() { generation++; world.online.clear(); typing.clear(); }
  function pause() { running = false; clearPresence(); if (timer) clearTimeout(timer); timer = undefined; changed(); }
  function schedule(soon = false) {
    if (!running || disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = undefined;
      if (typeof document === 'undefined' || !document.hidden) await step();
      schedule();
    }, (soon || typing.size ? 2400 : world.records.some(record => record.status === 'accepted' && world.messages.get(record.id)?.at(-1)?.senderIsMe) ? 4200 : 12_000) + Math.floor(random() * (soon || typing.size ? 1800 : 12_000)));
  }
  const visible = () => { if (document.hidden) { clearPresence(); changed(); } else if (running) schedule(true); };
  let observing = false;
  async function step() {
    if (busy || disposed || (typeof document !== 'undefined' && document.hidden) || options.canAct?.() === false) return;
    busy = true; const ticket = generation;
    changed();
    try {
      const pool = new Set(participants());
      const people = world.people().filter(person => pool.has(person.id) && world.available(person.id));
      for (const id of typing) if (!world.records.some(record => record.id === id && record.status === 'accepted' && people.some(person => person.id === record.peer))) typing.delete(id);
      if (!people.length) return;
      const allowed = (id: string) => ticket === generation && !disposed && (!world.exclusive() || Boolean(world.conversationAllowed)) && options.canAct?.() !== false && world.available(id);
      const acceptedCount = () => world.records.filter(record => record.status === 'accepted').length + Math.max(0, options.externalAccepted?.() ?? 0);
      const pending = world.records.find(record => record.status === 'pending' && record.direction === 'outgoing' && people.some(person => person.id === record.peer));
      if (pending && acceptedCount() < 2 && !world.exclusive()) {
        const person = people.find(person => person.id === pending.peer)!;
        const decline = hash(person.id) % 4 === 0;
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
        const history = simulationHistory(rows);
        let body = fictionalReply(person, history), kind = 'reply';
        if (options.aiReply && !last?.attachment) {
          try {
            const reply = await options.aiReply({ person, messages: history });
            if (typeof reply === 'string' && reply.trim() && reply.length <= 1000) { body = reply.trim(); kind = 'ai_reply'; }
          } catch { kind = 'reply_fallback'; }
        }
        typing.delete(chat.id);
        if (!allowed(person.id) || chat.status !== 'accepted' || world.chatReady?.(chat.id) === false || world.conversationAllowed?.(chat.id) === false || rows.filter(row => !row.deletedAt).at(-1)?.id !== last?.id || JSON.stringify(simulationHistory(rows)) !== JSON.stringify(history)) return;
        const createdAt = new Date().toISOString();
        rows.push({ id: crypto.randomUUID(), senderIsMe: false, body, createdAt });
        world.messages.set(chat.id, rows); chat.updatedAt = createdAt; world.online.add(person.id);
        add(kind, person.id, `${person.alias}: ${kind === 'reply_fallback' ? 'رد محلي مؤقت؛ المساعد غير متاح' : 'أرسل رسالة'}`);
        return;
      }
      if (world.exclusive()) return;
      const person = people[Math.min(people.length-1, Math.floor(random() * people.length))];
      const phase = social.get(person.id) ?? 0;
      if (phase === 2 && world.records.filter(record => record.status === 'pending').length < 2 && !world.records.some(record => record.peer === person.id && (record.status !== 'closed' || !record.allowRematch))) {
        const time = new Date().toISOString();
        world.records.unshift({ id: crypto.randomUUID(), peer: person.id, direction: 'incoming', status: 'pending', createdAt: time, updatedAt: time });
        add('request', person.id, `${person.alias}: أرسل طلب تعارف`);
        social.set(person.id, 3);
      } else if (phase >= 2) {
        if(Date.now()-(lastVisits.get(person.id)??0)>90_000&&random()<.3) {
          world.activity('profile_visit',person.id);lastVisits.set(person.id,Date.now());add('profile_visit',person.id,`${person.alias}: زار ملفك`);return;
        }
        const online = !world.online.has(person.id);
        if (online) world.online.add(person.id); else world.online.delete(person.id);
        add('presence', person.id, `${person.alias}: ${online ? 'متصل الآن' : 'غادر التطبيق'}`);
      } else {
        const kind = phase === 1 ? 'interest' : 'profile_visit';
        world.activity(kind, person.id);
        if(kind==='profile_visit')lastVisits.set(person.id,Date.now());
        social.set(person.id, phase + 1);
        add(kind, person.id, `${person.alias}: ${kind === 'interest' ? 'أبدى اهتمامه بملفك' : 'زار ملفك'}`);
      }
    } finally {
      busy = false;
      changed();
    }
  }
  return {
    snapshot: () => ({ running, busy, participants: participants(), eventCount, log: [...log] }),
    start() { if (running) return; disposed = false; running = true; if (!observing && typeof document !== 'undefined') { document.addEventListener('visibilitychange', visible); observing = true; } changed(); schedule(true); },
    pause, step,
    wake() { if (running && !busy) schedule(true); },
    reset() { pause(); world.reset(); eventCount = 0; log = []; social.clear(); lastVisits.clear(); changed(); },
    dispose() { pause(); disposed = true; if (observing) { document.removeEventListener('visibilitychange', visible); observing = false; } },
  };
}
