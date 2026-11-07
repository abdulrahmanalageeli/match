import type { Message, PublicPerson } from './data';

export type DemoSimulationEvent = { id: string; at: string; kind: string; personId?: string; detail: string };
export type DemoSimulationSnapshot = { running: boolean; busy: boolean; participants: string[]; eventCount: number; log: DemoSimulationEvent[] };
export type DemoSimulationOptions = {
  storageKey?: string;
  externalAccepted?: () => number;
  canAct?: () => boolean;
  aiReply?: (input: { person: PublicPerson; messages: { senderIsMe: boolean; body: string }[] }) => Promise<string>;
};
export type DemoSimulationController = {
  snapshot(): DemoSimulationSnapshot;
  start(): void;
  pause(): void;
  step(): Promise<void>;
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
  activity(kind: 'profile_visit' | 'interest', personId: string): void;
  changed(): void;
  reset(): void;
};

function hash(value: string) { return [...value].reduce((n, c) => n * 31 + c.charCodeAt(0) >>> 0, 7); }

/** A local test participant, never an autonomous action against a live member. */
export function fictionalReply(person: PublicPerson, history: { senderIsMe: boolean; body: string }[]): string {
  const recent = history.filter(message => message.senderIsMe).at(-1)?.body ?? '';
  const round = history.filter(message => !message.senderIsMe).length;
  const style = (hash(person.id) >>> 1) % 3;
  if (/رقم|واتساب|عنوان|موقعك|سناب/.test(recent)) return 'أفضل أن نبقى هنا في البداية إلى أن نتعرف أكثر ونرتاح للخطوة التالية.';
  if (/زواج|شهر|رسمي|أهل|لقاء/.test(recent)) {
    if (person.marriageBasics?.meetingPreference === 'family_before_formal') return 'أفضّل أن يكون اللقاء الأول بحضور الأهل، بعد أن نتفق على الأمور الأساسية. ما الذي يناسبك؟';
    if (person.marriageBasics?.meetingPreference === 'after_formal') return 'أرتاح أكثر للقاء بعد الخطوة الرسمية. قبل ذلك يهمني أن نتحدث بوضوح عن توقعاتنا للحياة.';
    return 'أحب أن نفهم توقعات بعض أولًا، ثم نتفق على لقاء وطريقة واضحة تناسب الطرفين. ما أهم شيء تريد معرفته قبلها؟';
  }
  if (/عمل|دوام|مهنة|شغل/.test(recent)) return `عملي في مجال ${person.occupation} يأخذ جزءًا من يومي، لكن أحاول أن أترك وقتًا حقيقيًا للبيت. كيف توازن بين العمل والحياة؟`;
  if (/سفر|رحل|مكان/.test(recent)) return ['أستمتع بالرحلات الهادئة أكثر من البرنامج المزدحم. أحب أن أترك وقتًا للمشي واكتشاف المكان. وأنت؟', 'أحب السفر بين فترة وأخرى، لكن ما يهمني أكثر هو من أشارك معه الرحلة. هل تفضّل البحر أم الجبال؟'][style % 2];
  if (/خلاف|زعل|عصب|نقاش/.test(recent)) return 'إذا صار خلاف، أفضّل أن نفهم السبب بدون تجريح. أحيانًا أحتاج وقتًا قصيرًا للهدوء ثم نرجع للكلام. هل يناسبك ذلك؟';
  if (/كيفك|كيف حال|أخبار|السلام|مرحبا|أهل|هلا/.test(recent)) return ['أهلًا، بخير الحمد لله. كان يومي مزدحمًا قليلًا، والآن عندي وقت نتكلم بهدوء. كيف كان يومك؟', 'وعليكم السلام، أهلًا وسهلًا. سعيد بهذه البداية. ما أكثر شيء تحب أن يكون حاضرًا في حياتك الزوجية؟', 'أهلًا بك. الحمد لله يوم هادئ بعد العمل. لفتني أننا نحاول أن نأخذ هذه الخطوة بجدية.'][style];
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
  let eventCount = Math.min(60, Math.max(0, initial?.eventCount ?? 0));
  let log = (initial?.log ?? []).slice(-30);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const participants = () => {
    const people = world.people();
    // Spread participants across the roster instead of animating every account.
    return people.filter((_, index) => index % 3 === 0).slice(0, 5).map(person => person.id);
  };
  function add(kind: string, personId: string | undefined, detail: string) {
    eventCount++;
    log = [...log, { id: crypto.randomUUID(), at: new Date().toISOString(), kind, personId, detail }].slice(-30);
  }
  function changed() { world.changed(); }
  function pause() { running = false; generation++; if (timer) clearTimeout(timer); timer = undefined; world.online.clear(); changed(); }
  function schedule() {
    if (!running || disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = undefined;
      if (typeof document === 'undefined' || !document.hidden) await step();
      schedule();
    }, 12_000 + eventCount % 4 * 4_000);
  }
  async function step() {
    if (busy || disposed || eventCount >= 60 || world.exclusive() || options.canAct?.() === false) return;
    busy = true; const ticket = generation;
    changed();
    try {
      const pool = new Set(participants());
      const people = world.people().filter(person => pool.has(person.id) && world.available(person.id));
      if (!people.length) return;
      const allowed = (id: string) => ticket === generation && !disposed && !world.exclusive() && options.canAct?.() !== false && world.available(id);
      const acceptedCount = () => world.records.filter(record => record.status === 'accepted').length + Math.max(0, options.externalAccepted?.() ?? 0);
      const pending = world.records.find(record => record.status === 'pending' && record.direction === 'outgoing' && people.some(person => person.id === record.peer));
      if (pending && acceptedCount() < 2) {
        const person = people.find(person => person.id === pending.peer)!;
        const decline = hash(person.id) % 4 === 0;
        pending.status = decline ? 'closed' : 'accepted'; pending.updatedAt = new Date().toISOString();
        pending.allowRematch = !decline;
        if (!decline) pending.celebrationKey = crypto.randomUUID();
        add(decline ? 'decline' : 'match', person.id, `${person.alias}: ${decline ? 'اعتذر عن طلب التعارف' : 'قبل طلب التعارف'}`);
        return;
      }
      const chat = world.records.find(record => {
        if (record.status !== 'accepted' || !people.some(person => person.id === record.peer)) return false;
        const rows = (world.messages.get(record.id) ?? []).filter(row => !row.deletedAt);
        return !rows.length || rows.at(-1)?.senderIsMe;
      });
      if (chat) {
        const person = people.find(person => person.id === chat.peer)!;
        const rows = world.messages.get(chat.id) ?? [];
        const last = rows.filter(row => !row.deletedAt).at(-1);
        if (last?.senderIsMe && !last.readAt) {
          const time = new Date().toISOString();
          rows.filter(row => row.senderIsMe && !row.deletedAt).forEach(row => { row.deliveredAt ??= time; row.readAt ??= time; });
          world.online.add(person.id); add('read', person.id, `${person.alias}: قرأ الرسالة`); return;
        }
        const history = rows.filter(row => !row.deletedAt && !row.attachment).slice(-10).map(({ senderIsMe, body }) => ({ senderIsMe, body }));
        let body = fictionalReply(person, history), kind = 'reply';
        if (options.aiReply) {
          try {
            const reply = await options.aiReply({ person, messages: history });
            if (typeof reply === 'string' && reply.trim() && reply.length <= 1000) { body = reply.trim(); kind = 'ai_reply'; }
          } catch { /* A bounded local reply keeps demo testing usable offline. */ }
        }
        if (!allowed(person.id) || chat.status !== 'accepted' || rows.filter(row => !row.deletedAt).at(-1)?.id !== last?.id) return;
        const createdAt = new Date().toISOString();
        rows.push({ id: crypto.randomUUID(), senderIsMe: false, body, createdAt });
        world.messages.set(chat.id, rows); chat.updatedAt = createdAt; world.online.add(person.id);
        add(kind, person.id, `${person.alias}: ${kind === 'ai_reply' ? 'رد بمساعدة الذكاء الاصطناعي' : 'أرسل ردًا تجريبيًا'}`);
        return;
      }
      const person = people[eventCount % people.length];
      const mode = eventCount % 6;
      if (mode === 1 || mode === 5) {
        if (mode === 1) world.online.add(person.id); else world.online.delete(person.id);
        add('presence', person.id, `${person.alias}: ${mode === 1 ? 'متصل الآن' : 'غادر التطبيق'}`);
      } else if (mode === 3 && acceptedCount() < 2 && world.records.filter(record => record.status === 'pending').length < 2 && !world.records.some(record => record.peer === person.id && (record.status !== 'closed' || !record.allowRematch))) {
        const time = new Date().toISOString();
        world.records.unshift({ id: crypto.randomUUID(), peer: person.id, direction: 'incoming', status: 'pending', createdAt: time, updatedAt: time });
        add('request', person.id, `${person.alias}: أرسل طلب تعارف`);
      } else {
        const kind = mode === 2 ? 'interest' : 'profile_visit';
        world.activity(kind, person.id);
        add(kind, person.id, `${person.alias}: ${kind === 'interest' ? 'أبدى اهتمامه بملفك' : 'زار ملفك'}`);
      }
    } finally {
      busy = false;
      if (eventCount >= 60) { running = false; if (timer) clearTimeout(timer); timer = undefined; }
      changed();
    }
  }
  return {
    snapshot: () => ({ running, busy, participants: participants(), eventCount, log: [...log] }),
    start() { if (running || eventCount >= 60) return; disposed = false; running = true; changed(); schedule(); },
    pause, step,
    reset() { pause(); world.reset(); eventCount = 0; log = []; changed(); },
    dispose() { pause(); disposed = true; },
  };
}
