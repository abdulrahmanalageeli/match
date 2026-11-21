import { useEffect, useState } from 'react';
import { ArrowLeft } from './BrandIcons';
import './welcomePairPreview.css';

// Fictional welcome stories. The percentage describes the whole pair, the story one decision.
const pairs = [
  {
    score: 86, topic: 'متى نصير أمّ وأب؟',
    reading: 'كلاهما يتمنى أطفالًا. نورة تفضّل بعد التخرّج، وعبدالله يتمنى أن يبدأ من السنة الأولى.',
    people: [
      { name: 'نورة', image: 'noura', quote: 'ودّي أتخرّج وأكون حاضرة لطفلي من أول يوم.' },
      { name: 'عبدالله', image: 'abdullah', quote: 'أتمنى نصير أهل من أول سنة، ويهمني نختار الوقت سوا.' },
    ],
  },
  {
    score: 92, topic: 'كيف نرتّب مسؤولياتنا المالية؟',
    reading: 'لولوة تساند أهلها شهريًا. هي وفهد متفقان أن يحسبا هذا الالتزام قبل تحديد ميزانية البيت.',
    people: [
      { name: 'لولوة', image: 'lulwa', quote: 'جزء من راتبي لأهلي، وأبغى نخطط وإحنا عارفين هالشي.' },
      { name: 'فهد', image: 'fahad', quote: 'نحسب التزاماتنا لأهلنا أول، وبعدها نتفق على مصاريف بيتنا.' },
    ],
  },
  {
    score: 78, topic: 'لو جاء عرض عمل في مدينة ثانية؟',
    reading: 'رعاية والدتها تربط منال بمدينتها. نواف منفتح على الانتقال، ويهمهما حسم مكان السكن مبكرًا.',
    people: [
      { name: 'منال', image: 'manal', quote: 'أنا اللي أودّي أمي مواعيدها، وقربي منها يفرق.' },
      { name: 'نواف', image: 'nawaf', quote: 'لو جتني فرصة في مدينة ثانية، ودي نفكّر فيها سوا.' },
    ],
  },
  {
    score: 89, topic: 'وقت الخلاف، متى نرجع للكلام؟',
    reading: 'سارة تحتاج وقتًا لتهدأ. وعمر يرتاح إذا اتفقا متى يكملان الحديث، حتى لو كان بكرة.',
    people: [
      { name: 'سارة', image: 'sarah', quote: 'إذا زعلت أحتاج أهدأ عشان أقدر أسمع.' },
      { name: 'عمر', image: 'omar', quote: 'أقدر أعطيك وقت، بس خلينا نتفق متى نرجع نتكلم.' },
    ],
  },
];
const format = new Intl.NumberFormat('ar-SA-u-nu-arab');

export function WelcomePairPreview({ visible, reduced }: { visible: boolean; reduced: boolean }) {
  const [index, setIndex] = useState(0);
  const [speaker, setSpeaker] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const pair = pairs[index];
  const rotating = visible && !reduced && !paused;

  function nextPair() {
    setSpeaker(null);
    setIndex(current => (current + 1) % pairs.length);
  }
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(nextPair, 6800);
    return () => window.clearTimeout(timer);
  }, [rotating, index]);

  return <section className="wd-pair-preview" aria-label="قصص التوافق" hidden={!visible}
    aria-live={rotating ? 'off' : 'polite'}>
    <div className="wd-pair-top">
      {pair.people.map((person, i) => <button key={i} className="wd-pair-person" type="button"
        aria-label={'من كلام ' + person.name} aria-pressed={speaker === i} onClick={() => {
          setPaused(true);
          setSpeaker(speaker === i ? null : i);
        }}>
        <img key={person.image} src={'/demo/portraits/' + person.image + '.webp'} width="36" height="36" alt=""/>
        <span>{person.name}</span>
      </button>)}
      <div className="wd-pair-score"><strong key={index} dir="ltr">{format.format(pair.score)}<small>٪</small></strong><span>التوافق العام</span></div>
      <div className="wd-pair-controls">
        {!reduced && <button type="button" aria-label={paused ? 'تشغيل التبديل التلقائي' : 'إيقاف التبديل التلقائي'}
          onClick={() => setPaused(!paused)}><svg viewBox="0 0 16 16" aria-hidden="true">
          {paused ? <path d="M5 3 13 8 5 13Z" fill="currentColor"/> : <path d="M5.5 3v10m5-10v10" stroke="currentColor" strokeWidth="2"/>}
        </svg></button>}
        <button type="button" aria-label="القصة التالية" onClick={nextPair}><ArrowLeft size={16}/></button>
      </div>
    </div>
    <div key={index + '-' + speaker} className="wd-pair-reading">
      <strong>{pair.topic}</strong>
      <p>{speaker === null ? pair.reading : '«' + pair.people[speaker].quote + '»'}</p>
    </div>
  </section>;
}
