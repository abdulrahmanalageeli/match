import type { RefObject } from 'react';
import { ArrowUpRight, Calculator, Fingerprint, MessageCircle, ScanLine } from "../BrandIcons";
import type { MatchFit } from './model';
import { personalityPercentage } from './model';
import { analyzePersonality, distributionSteps, personalityDomains, personalityTopics } from './personality-analysis';

const arabic = new Intl.NumberFormat('ar-SA', {numberingSystem:'arab'});

export function PersonalityAnalysis({fit,id,panelRef}:{fit:MatchFit;id:string;panelRef:RefObject<HTMLDetailsElement|null>}) {
  const percentage=personalityPercentage(fit);
  const unverifiable=percentage===null&&fit.personality?.complete===true;
  const analysis=percentage===null?null:analyzePersonality(fit.personality);
  const evidence=analysis;
  const close=evidence?evidence.distribution.same+evidence.distribution.near:0;
  const total=fit.personality?.total??12;
  const earned=evidence?distributionSteps.reduce((sum,step)=>sum+evidence.distribution[step.key]*step.points,0):0;
  const legacyTopics=percentage===null?[]:[...new Set([...(Array.isArray(fit.personality?.similarities)?fit.personality.similarities:[]),...(Array.isArray(fit.personality?.differences)?fit.personality.differences:[])])]
    .filter(key=>Object.hasOwn(personalityTopics,key)).map(key=>personalityTopics[key].title);
  const strength=analysis?.strengths[0],discussion=analysis?.discussion[0];

  return <details ref={panelRef} id={id} className="nf-personality-reading">
    <summary tabIndex={0}><span className="nf-personality-seal"><Fingerprint size={22} strokeWidth={1.5}/></span><span><strong>ما وراء انسجام الشخصية</strong><small>{unverifiable?'تفصيل النتيجة غير متاح حاليًا':percentage===null?'ما الذي نحتاجه لقراءة أوضح؟':'من الإجابات إلى معنى يمكن مناقشته'}</small></span></summary>
    <div className="nf-personality-body">
      {percentage===null?<div className="nf-personality-pending"><ScanLine size={24} strokeWidth={1.5}/><h3>{unverifiable?'نحتاج قراءة محدّثة':'نحتاج صوتكما معًا'}</h3>{unverifiable?<p>تعذّر التحقق من تفاصيل النتيجة. حدّث الملف للمحاولة مجددًا. لا نعرض نسبة لا تدعمها تفاصيل الحساب.</p>:<><p>تظهر النسبة وقراءتها عندما يجيب كلاكما عن عبارات الشخصية الاثنتي عشرة. لا نُكمل الإجابات الناقصة بالتخمين.</p><small>يمكن استكمال التقييم من الإعدادات ← ملفي وتفضيلاتي.</small></>}</div>
        : evidence&&analysis?<>
          <div className="nf-personality-lead"><span className="nf-personality-eyebrow">قراءة مبنية على إجاباتكما</span><h3>{arabic.format(close)} من {arabic.format(total)} عبارة متقاربة</h3><p>{close===total?'تتقارب درجات إجاباتكما في جميع العبارات. ابدآ بمثال من الحياة لترَيا كيف يظهر هذا التقارب بينكما.':`${arabic.format(total-close)} من العبارات تحمل اختلافًا أوضح. هذه مواضيع لفهم احتياجاتكما، وليست حكمًا على إمكانية العلاقة.`}</p></div>
          <div className="nf-personality-domains" aria-label="تقارب الإجابات في محاور الشخصية">
            {evidence.domains.map(domain=>{
              const definition=personalityDomains.find(item=>item.id===domain.id)!;
              return <div className="nf-personality-domain" key={domain.id}>
                <div className="nf-personality-domain-heading"><h4>{definition.title}</h4><strong>{arabic.format(domain.percentage!)}<small>٪</small></strong></div>
                <div className="nf-analysis-meter" role="meter" aria-label={`تقارب ${definition.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={domain.percentage!}><span style={{width:`${domain.percentage}%`}}/></div>
                <p>{definition.description}</p><small>{arabic.format(domain.covered)} من {arabic.format(domain.total)} عبارات لدى الطرفين</small>
              </div>;
            })}
          </div>
          <div className="nf-personality-insights">
            {strength&&<article className="nf-personality-insight"><span><ArrowUpRight size={17}/> نقطة تقارب</span><h4>{strength.title}</h4><p>{strength.interpretation}</p><blockquote>{strength.prompt}</blockquote></article>}
            {discussion&&<article className="nf-personality-insight nf-personality-discussion"><span><MessageCircle size={17}/> مساحة لفهم أعمق</span><h4>{discussion.title}</h4><p>{discussion.interpretation}</p><blockquote>{discussion.prompt}</blockquote></article>}
          </div>
          <details className="nf-personality-method"><summary><Calculator size={18}/><span>كيف وصلنا إلى {arabic.format(percentage)}٪؟</span></summary>
            <div><p>لكل عبارة خمس درجات، من «لا يشبهني إطلاقًا» إلى «يشبهني كثيرًا». نقيس المسافة بين إجابتَيكما؛ لكل عبارة الوزن نفسه.</p>
              <table><caption>تفصيل إجاباتكما الاثنتي عشرة</caption><thead><tr><th scope="col">المسافة بين الإجابتين</th><th scope="col">عدد العبارات</th><th scope="col">نقاط كل عبارة</th></tr></thead><tbody>{distributionSteps.map(step=><tr key={step.key}><th scope="row">{step.label}</th><td>{arabic.format(evidence.distribution[step.key])}</td><td>{arabic.format(step.points)}</td></tr>)}</tbody></table>
              <div className="nf-personality-equation"><span>مجموع النقاط ÷ عدد العبارات</span><strong dir="ltr">{arabic.format(earned)} ÷ {arabic.format(total)} ≈ {arabic.format(percentage)}٪</strong></div>
              <p>نقرّب الناتج إلى أقرب عدد صحيح. كل محور يلخّص ثلاث عبارات؛ والنسبة العامة تُحسب من العبارات الاثنتي عشرة قبل تقريب المحاور.</p>
            </div>
          </details>
        </>:<div className="nf-personality-legacy"><h3>قراءة موجزة متاحة</h3><p>تعكس النسبة تقارب إجاباتكما. تفصيل الحساب والمحاور غير متاح لهذه النتيجة حاليًا، لذلك لا نعرض درجات تقديرية.</p>{legacyTopics.length>0&&<p><strong>مواضيع شملها التقييم: </strong>{legacyTopics.join('، ')}.</p>}</div>}
      <p className="nf-personality-boundary">هذه قراءة وصفية لتشابه الإجابات، وليست اختبارًا نفسيًا معتمدًا أو نسبة لاحتمال نجاح الزواج. لا يكشف التحليل اختيارات الطرف الآخر حرفيًا، وقد تحمل الطباع المختلفة تكاملًا لا تقيسه هذه النسبة.</p>
      <details className="nf-personality-research"><summary>حدود القراءة والمرجع البحثي</summary><p>العبارات والأوزان هنا صُممت لوُدَين ولم تُتحقق صلاحيتها باختبار نفسي معياري. توضح أبحاث العلاقات أن التنبؤ بتغيّر جودتها من تقارير الأشخاص عن أنفسهم محدود.</p><a href="https://sites.lsa.umich.edu/whirl/wp-content/uploads/sites/792/2020/08/Joel-et-al-2020-PNAS.pdf" target="_blank" rel="noreferrer">قراءة بحثية عن حدود التنبؤ بالعلاقات (PNAS، ٢٠٢٠)</a><p>المرجع يوضح حدود التنبؤ، ولا يعتمد أسئلة وُدَين أو أوزانها.</p></details>
    </div>
  </details>;
}
