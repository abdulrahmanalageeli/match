import { applicableDimensions, hasPartnerQuestion } from '../compatibility/practical-catalog.ts';
import { readPreferenceEvidence } from '../compatibility/preference-evidence.ts';
import { currentPersonalityDomains, personalityDomains, personalityTopics } from '../compatibility/personality-analysis.ts';
import { personalityQuestionsFor } from '../compatibility/personality.ts';
import { pairedPersonality } from './pairedPersonality.ts';
import { addReportOutlook } from './reportOutlook.ts';
import { personalityPortrait } from './personalityPortrait.ts';
import type { MatchFit } from '../compatibility/model';
import type { Profile } from '../types';
import type { DeepAnalysisSource, DeepFinding, DeepReview, DeepSnapshot } from './deepCompatibilityModel.ts';

type Assessment = Pick<Profile, 'assessmentVersion' | 'surveyAnswers' | 'personalityVersion' | 'personalityAnswers' | 'marriageBasics' | 'partnerCriteria'>;
type Pair = { member: Assessment; person: Assessment & { alias: string }; fit: MatchFit };
type Reading = { snapshot: DeepSnapshot; prepared: DeepFinding[]; revision: string };

function practicalAnswers(profile: Assessment, fallbackVersion: string) {
  const version = profile.assessmentVersion || fallbackVersion;
  return applicableDimensions(version, profile.surveyAnswers, profile.marriageBasics?.childrenCount, profile.partnerCriteria?.children).map(topic => ({
    topic,
    self: topic.options.find(option => option.code === profile.surveyAnswers?.[topic.id])?.self,
    partner: hasPartnerQuestion(topic.id, version) ? topic.options.find(option => option.code === profile.surveyAnswers?.[topic.partnerId])?.partner : undefined,
  }));
}

function personalityInstrument(profile: Assessment, fallbackVersion: string) {
  return profile.personalityVersion ?? ((profile.assessmentVersion ?? fallbackVersion) === 'marriage-v4' ? 'personality-v2' : 'personality-v1');
}

function assessmentRevision(profile: Assessment) {
  return [profile.assessmentVersion, profile.surveyAnswers, profile.personalityVersion, profile.personalityAnswers,
    profile.marriageBasics?.childrenCount, profile.partnerCriteria?.children];
}

const personalityPrompts: Record<string, string> = {
  stability: 'حين تمرّ بيوم ضاغط، ما الذي تتمنى أن يفهمه الناس عن طريقة ردّك؟',
  reliability: 'ما موقف من العمل أو الدراسة يوضح كيف تتصرف عندما يضيق الوقت؟',
  warmth: 'ما الذي أقنعك يومًا بأن شخصًا فهم وجهة نظرك رغم اختلافه معك؟',
  social_energy: 'ما الذي تستمتع به في مناسبة اجتماعية، ومتى تشعر أنك اكتفيت منها؟',
  openness: 'متى غيّرت رأيك في شيء مألوف بعدما سمعت فكرة جديدة؟',
  communication: 'متى يناسب كلًّا منكما أن يبادر بالحديث عن موضوع مهم؟',
  closeness: 'ما التصرف اليومي الذي يجعل كلًّا منكما يشعر بالاهتمام؟',
  everyday: 'في أسبوعك المعتاد، أي التفاصيل تحب معرفتها مبكرًا وأيها ترتاح لتركه مفتوحًا؟',
  pressure: 'عند الضغط، هل تفضّل أن يسألك الشخص عمّا حدث أم يترك لك فرصة بدء الحديث؟',
};

const practicalSteps: Record<string, string> = {
  children_plan: 'إذا صار الحديث عن الزواج جديًا، ما الذي يهم كل طرف أن يعرفه الآخر عن رغبته في الإنجاب أو تردده فيه؟',
  residence_plan: 'أي المدن تبدو خيارًا واقعيًا بعد الزواج لكل منكما، وما الذي يصعّب الانتقال إليها؟',
  wife_work: 'كيف يتصور كل منكما استمرار العمل بعد الزواج، خصوصًا في الفترات التي تتغير فيها ساعات الدوام؟',
  marriage_timeline: 'ما الذي يحتاج كل منكما إلى معرفته قبل أن يشعر بأنه مستعد لخطوة رسمية؟',
  family_authority: 'في قرار كبير بعد الزواج، أين تنتهي مشورة الأهل وأين تبدأ مسؤولية الزوجين في نظر كل منكما؟',
  financial_provision: 'ما المصروف الذي يتوقع كل منكما أن يكون مسؤولية مشتركة بعد الزواج؟ مثال واحد قد يكشف فرقًا في معنى المشاركة.',
  domestic_labor: 'حين يقول أحدكما «نتشارك مسؤولية البيت»، هل يشمل ذلك ملاحظة ما ينقص وترتيبه، أم تنفيذ المهمة فقط؟',
  housing_arrangement: 'لو أصبح الزواج مطروحًا، ما الذي يجعل السكن مناسبًا لكل منكما من حيث الخصوصية والقرب من الأهل؟',
  social_rhythm: 'كيف يقضي كل منكما عطلة مريحة الآن، وما الذي يود أن يحتفظ به من هذا الإيقاع بعد الزواج؟',
  social_boundaries: 'ما الذي يجعل مناسبة اجتماعية مريحة لأحدكما، وما الذي قد يدفعه إلى الاعتذار عنها؟',
  conflict_response: 'عندما يختلف رأيك مع شخص تعرفه، ما الذي يساعدك على مواصلة الحديث بهدوء؟',
  repair_after_conflict: 'ما الذي يجعل الاعتذار مقنعًا في نظرك: فهم ما أزعجك، أم تغيير التصرف، أم شيء آخر؟',
  faith_routine: 'ما العادات الدينية التي يتمنى كل منكما حضورها في بيته مستقبلًا، وما الذي يعدّه أمرًا شخصيًا؟',
  closeness_pace: 'في بداية التعارف، ما الذي يجعل السؤال عن تفاصيل يومك لطيفًا، ومتى يبدو مبكرًا؟',
  money_management: 'بعد الزواج، كيف يتصور كل منكما الفرق بين مصروف شخصي وقرار مالي يحتاج إلى تشاور؟',
  parenting_approach: 'إن كان الإنجاب ضمن التصور المستقبلي، كيف يفهم كل منكما الفرق بين الحزم والقسوة في التربية؟',
};

const differentInPractice: Record<string, string> = {
  calm_before_acting: 'وقت الانزعاج، قد يكون أحدكما جاهزًا للرد بينما يحتاج الآخر إلى لحظة يرتّب فيها أفكاره.',
  lasting_tension: 'قد ينتهي الموقف ويظل أثره حاضرًا عند أحدكما. السؤال عن أثره قد يساعد أكثر من افتراض أن اليوم عاد لطبيعته.',
  stress_recovery: 'قد يستعيد كل منكما هدوءه بإيقاع مختلف بعد يوم صعب، فيأتي عرض المساعدة قبل أن يكون الآخر مستعدًا له.',
  follow_through: 'عند ازدحام الأسبوع قد يفهم أحدكما تأجيل الوعد على أنه تراجع عنه. تحديد موعد بديل يجعل المقصود أوضح.',
  prepare_early: 'في ترتيب سفر أو زيارة، قد يبدأ القلق عند أحدكما قبل أن يرى الآخر حاجة إلى التحضير.',
  unfinished_tasks: 'قد تبدآن خطة بحماس ثم تختلفان في اللحظة التي تعتبرانها مكتملة. ما الذي يجعل كل طرف يعتبر الالتزام مكتملًا؟',
  perspective_taking: 'عند الاختلاف قد يصل أحدكما إلى اقتراح الحل قبل أن يشعر الآخر بأن رأيه فُهم.',
  make_amends: 'قد ينتظر أحدكما إشارة إلى إصلاح الموقف بينما يظن الآخر أن الحديث التالي يكفي لطي الصفحة.',
  harsh_words: 'وقت الزعل قد تبقى عبارة عابرة في ذهن أحدكما بعد هدوء الآخر. وقد يكشف الحديث عن معنى الاعتذار كيف يقرأ كل طرف أثر الكلمات.',
  group_energy: 'بعد زيارة طويلة قد تكون لدى أحدكما طاقة للقاء آخر بينما يحتاج الآخر إلى استراحة.',
  start_conversation: 'في لقاء عائلي جديد قد يقع عبء فتح الحديث على أحدكما. من المفيد معرفة كيف يفضّل كل طرف أن يدخل حديثًا جديدًا.',
  quiet_settings: 'اختيار مكان اللقاء قد يؤثر في راحة كل منكما أكثر من عدد الزيارات نفسه.',
  try_new_ideas: 'عند تجربة عادة جديدة قد يحتاج أحدكما إلى تجربة قصيرة قبل الالتزام بتغيير الروتين.',
  explore_views: 'قد يستمتع أحدكما بإطالة النقاش حول رأي مختلف فيما ينتظر الآخر الوصول إلى قرار.',
  prefer_familiar: 'عند تغيير عادة منزلية قد يهم أحدكما الاحتفاظ بما اعتاده. ما الذي جعل تغيير عادة مألوفة أسهل في تجربة سابقة؟',
};

function compareAnswers({member, person, fit}: Pair) {
  const findings: DeepFinding[] = [], review: DeepReview[] = [];
  const statuses = new Map(readPreferenceEvidence(fit).topics.map(topic => [topic.id, topic.status]));
  for (const {topic, self, partner} of practicalAnswers(member, fit.version)) {
    if (!self && !partner) continue;
    const status = statuses.get(topic.id);
    const missing = !status || status === 'missing';
    const aligned = status === 'aligned';
    const section = aligned ? 'strengths' : missing ? 'expectations' : 'differences';
    const id = topic.id;
    const meaning = aligned ? topic.reason : missing ? 'ما زالت الصورة ناقصة هنا. مثال واقعي من كل منكما يساعد على فهم ما يمكن الاتفاق عليه.'
      : status === 'one_sided' ? 'الترتيب الذي يبدو مناسبًا لأحدكما قد يتطلب من الآخر تنازلًا. حدّدا معًا ما يمكن تعديله.'
      : status === 'conditional' ? 'قد يناسبكما الترتيب نفسه في ظروف محددة. من المفيد تسمية تلك الظروف قبل اتخاذ القرار.'
      : 'قد يبني كل منكما خطته على توقع مختلف في هذا الجانب. قد يكشف مثال افتراضي ما يقصده كل منكما.';
    findings.push({id, section, kind:aligned?'strength':missing?'uncertain':'manageable', text:[topic.title, meaning, practicalSteps[id] ?? topic.discussion].join('\n\n')});
    const ownEvidence = [];
    if (self) ownEvidence.push({key:`answer:${id}`,label:topic.selfPrompt,value:self});
    if (partner) ownEvidence.push({key:`answer:${topic.partnerId}`,label:topic.partnerPrompt,value:partner});
    review.push({id,section,ownInterpretation:`مشاركة اختياراتك حول ${topic.title}.`,ownEvidence});
  }

  const version = personalityInstrument(member, fit.version);
  const ownPortrait = personalityPortrait(member,version,member.assessmentVersion ?? fit.version);
  const peerPortrait = personalityPortrait(person,personalityInstrument(person,fit.version),person.assessmentVersion ?? fit.version);
  if (ownPortrait.evidence.some(e=>e.key.startsWith('personality:')) && peerPortrait.evidence.some(e=>e.key.startsWith('personality:'))) {
    const id = 'interaction-portraits';
    const paragraphs = ownPortrait.text===peerPortrait.text ? ['لكلٍّ منكما: '+ownPortrait.text]
      : ['إليك: '+ownPortrait.text,'إلى '+person.alias+': '+peerPortrait.text];
    findings.push({id,section:'patterns',kind:'uncertain',text:['ما قد يغيب عن الانطباع الأول',...paragraphs].join('\n\n')});
    review.push({id,section:'patterns',ownInterpretation:ownPortrait.text,ownEvidence:ownPortrait.evidence});
  }
  const sameInstrument = version === personalityInstrument(person, fit.version);
  if (sameInstrument) {
    const paired = pairedPersonality(version, member.personalityAnswers, person.personalityAnswers, person.alias);
    findings.push(...paired.findings);
    review.push(...paired.review);
  }
  const questions = personalityQuestionsFor(version);
  const groups = version === 'personality-v1' ? personalityDomains.map(group => ({...group, questions:questions.filter(question => group.questionIds.some(id => id === question.id))}))
    : currentPersonalityDomains.map(group => ({...group, questions:questions.filter(question => 'domain' in question && question.domain === group.id)}));
  for (const group of groups) {
    const ownEvidence: DeepReview['ownEvidence'] = [];
    let strongestContrast: { id: string; title: string; difference: number } | undefined;
    for (const question of group.questions) {
      const own = question.options.find(option => option.code === member.personalityAnswers?.[question.id]);
      const peer = sameInstrument && question.options.find(option => option.code === person.personalityAnswers?.[question.id]);
      if (!own && !peer) continue;
      if (own && peer) {
        const difference = Math.abs(own.code.charCodeAt(0) - peer.code.charCodeAt(0));
        if (!strongestContrast || difference > strongestContrast.difference) strongestContrast = {id:question.id,title:question.title,difference};
      }
      if (own) ownEvidence.push({key:`personality:${question.id}`,label:question.prompt,value:own.label});
    }
    if (!ownEvidence.length) continue;
    const id = `personality-${group.id}`;
    const section = 'patterns';
    const prompt = personalityPrompts[group.id];
    let focus = 'يصعب تحديد نمط مشترك من المعلومات المتاحة. ابدآ بموقف عاشه كل منكما مؤخرًا.';
    if (strongestContrast) {
      const item = strongestContrast;
      const legacy = version === 'personality-v1' && personalityTopics[item.id];
      if (legacy) focus = item.difference >= 2 ? legacy.discussion : legacy.similarity;
      else focus = item.difference >= 2 ? differentInPractice[item.id]
        : `يبدو أن بينكما أرضية مشتركة في «${item.title}». استحضرا موقفًا من الأسبوع الماضي لترَيا كيف يظهر هذا التقارب في التصرف اليومي.`;
    }
    const action = ['stability','pressure'].includes(group.id) && strongestContrast
      ? 'ما الفرق عندك بين إنصات يريحك ومساعدة عملية تحتاجها؟' : undefined;
    findings.push({id, section, kind:'uncertain', text:[group.title, focus, action, prompt].filter(Boolean).join('\n\n')});
    review.push({id,section,ownInterpretation:`مشاركة اختياراتك حول ${group.title}.`,ownEvidence});
  }
  addReportOutlook(findings,review);
  return {findings,review};
}

// Each authenticated tester or local test session owns its own in-memory reports.
export function createProfileReading(pairFor:(id:string)=>Pair, changed:()=>void,
  generateRemote?:(id:string)=>Promise<Pick<DeepSnapshot,'findings'|'review'>>, canUseRemote=()=>true): DeepAnalysisSource {
  const readings = new Map<string,Reading>();
  function current(id:string) {
    const pair = pairFor(id);
    const revision = JSON.stringify([assessmentRevision(pair.member), assessmentRevision(pair.person), pair.person.alias, pair.fit]);
    let reading = readings.get(id);
    if (!reading || reading.revision !== revision) {
      reading = {revision,prepared:[],snapshot:{status:reading?'stale':'none',canRequest:true,requestedByMe:true,
        canGenerate:false,myReviewed:false,peerReviewed:false,findings:[],review:[]}};
      readings.set(id,reading);
    }
    return reading;
  }
  return {
    localProcessing:()=>!generateRemote || !canUseRemote(),
    async request(id, action, decisions) {
      const reading=current(id);
      const state=reading.snapshot;
      if (action==='get') return {...state};
      if (action==='request' && ['none','stale','cancelled'].includes(state.status)) {
        // The fictional peer accepts this invitation. The member still controls disclosure.
        Object.assign(state,{id:crypto.randomUUID(),status:'ready',canGenerate:true,myReviewed:false,peerReviewed:false});
      } else if (action==='cancel') {
        readings.delete(id);
        const fresh=current(id);
        fresh.snapshot.status='cancelled';
        changed();
        return {...fresh.snapshot};
      } else if (action==='review' && state.status==='review') {
        const denied = new Set(state.review.filter(item=>decisions?.[item.id]!==true).flatMap(item=>item.ownEvidence.map(entry=>entry.key)));
        const allowed = new Set(state.review.filter(item=>decisions?.[item.id]===true && item.ownEvidence.every(entry=>!denied.has(entry.key))).map(item=>item.id));
        state.findings=reading.prepared.filter(item=>allowed.has(item.id) && (!denied.size || !['summary','conclusion'].includes(item.section)));
        state.review=[]; reading.prepared=[];
        Object.assign(state,{status:'shared',myReviewed:true,peerReviewed:true});
      } else throw Error('تغيّرت حالة التحليل. حدّث القراءة.');
      changed();
      return {...state};
    },
    async generate(id) {
      const reading=current(id);
      const state=reading.snapshot;
      if (!state.canGenerate || !['ready','failed'].includes(state.status)) return;
      Object.assign(state,{status:'generating',canGenerate:false});
      changed();
      try {
        const local=compareAnswers(pairFor(id));
        let findings=local.findings, review=local.review;
        if (generateRemote && canUseRemote()) {
          try {
            const report=await generateRemote(id);
            if (report.review.length && report.findings.every(f=>report.review.some(r=>r.id===f.id && r.ownEvidence.length))) {
              findings=report.findings; review=report.review;
            }
          } catch(error) {
            if (!(error instanceof Error && 'status' in error && error.status===429 && findings.length)) throw error;
          }
        }
        if (!findings.length) throw Error('أكمل إجابات التوافق لتظهر قراءة تخصّكما.');
        if (current(id)!==reading) return;
        reading.prepared=findings;
        Object.assign(state,{status:'review',review,peerReviewed:true});
      } catch(error) {
        if(readings.get(id)===reading) Object.assign(state,{status:'failed',canGenerate:true});
        throw error;
      } finally { changed(); }
    },
  };
}
