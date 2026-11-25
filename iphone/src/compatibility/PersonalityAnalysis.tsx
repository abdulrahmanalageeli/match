import type { RefObject } from 'react';
import { ArrowUpRight, CircleHelp, Fingerprint, MessageCircle, ScanLine } from "../BrandIcons";
import type { MatchFit } from './model';
import { personalityPercentage } from './model';
import { analyzePersonality, currentPersonalityDomains, personalityDomains, personalityTopics } from './personality-analysis';

const arabic = new Intl.NumberFormat('ar-SA', {numberingSystem:'arab'});

export function PersonalityAnalysis({fit,id,panelRef}:{fit:MatchFit;id:string;panelRef:RefObject<HTMLDetailsElement|null>}) {
  const percentage=personalityPercentage(fit);
  const unverifiable=percentage===null&&fit.personality?.complete===true;
  const analysis=percentage===null?null:analyzePersonality(fit.personality);
  const evidence=analysis;
  const close=evidence?evidence.distribution.same+evidence.distribution.near:0;
  const total=fit.personality?.total??12;
  const legacyTopics=percentage===null?[]:[...new Set([...(Array.isArray(fit.personality?.similarities)?fit.personality.similarities:[]),...(Array.isArray(fit.personality?.differences)?fit.personality.differences:[])])]
    .filter(key=>Object.hasOwn(personalityTopics,key)).map(key=>personalityTopics[key].title);
  const strength=analysis?.strengths[0],discussion=analysis?.discussion[0];

  return <details ref={panelRef} id={id} className="nf-personality-reading">
    <summary tabIndex={0}><span className="nf-personality-seal"><Fingerprint size={22} strokeWidth={1.5}/></span><span><strong>ما وراء انسجام الشخصية</strong></span></summary>
    <div className="nf-personality-body">
      {percentage===null?<div className="nf-personality-pending"><ScanLine size={24} strokeWidth={1.5}/><h3>{unverifiable?'نحتاج قراءة محدّثة':'نحتاج صوتكما معًا'}</h3>{unverifiable?<p>تعذّر التحقق من تفاصيل النتيجة. حدّث الملف للمحاولة مجددًا.</p>:<><p>تظهر النسبة وقراءتها عندما يجيب كلاكما عن عبارات الشخصية {fit.personality?.version === 'personality-v2' ? 'الخمس عشرة' : 'الاثنتي عشرة'}.</p><small>يمكن استكمال التقييم من الإعدادات ← ملفي وتفضيلاتي.</small></>}</div>
        : evidence&&analysis?<>
          <div className="nf-personality-lead"><h3>{arabic.format(close)} من {arabic.format(total)} عبارة متقاربة</h3></div>
          <div className="nf-personality-domains" aria-label="تقارب الإجابات في محاور الشخصية">
            {evidence.domains.map(domain=>{
              const definition=[...personalityDomains, ...currentPersonalityDomains].find(item=>item.id===domain.id)!;
              return <div className="nf-personality-domain" key={domain.id}>
                <div className="nf-personality-domain-heading"><h4>{definition.title}</h4><strong>{arabic.format(domain.percentage!)}<small>٪</small></strong></div>
                <div className="nf-analysis-meter" role="meter" aria-label={`تقارب ${definition.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={domain.percentage!}><span style={{width:`${domain.percentage}%`}}/></div>
                <p>{definition.description}</p>
              </div>;
            })}
          </div>
          <div className="nf-personality-insights">
            {strength&&<article className="nf-personality-insight"><span><ArrowUpRight size={17}/> نقطة تقارب</span><h4>{strength.title}</h4><p>{strength.interpretation}</p><blockquote>{strength.prompt}</blockquote></article>}
            {discussion&&<article className="nf-personality-insight nf-personality-discussion"><span><MessageCircle size={17}/> مساحة لفهم أعمق</span><h4>{discussion.title}</h4><p>{discussion.interpretation}</p><blockquote>{discussion.prompt}</blockquote></article>}
          </div>
          <details className="nf-personality-method"><summary><CircleHelp size={18}/><span>كيف نقرأ انسجام الشخصية؟</span></summary>
            <p>تصف النسبة مدى تشابه إجاباتكما عن الشخصية. تبقى إجابات كل طرف خاصة.</p>
          </details>
        </>:<div className="nf-personality-legacy"><h3>قراءة موجزة متاحة</h3><p>تفاصيل المحاور غير متاحة لهذا التقييم.</p>{legacyTopics.length>0&&<p><strong>مواضيع شملها التقييم: </strong>{legacyTopics.join('، ')}.</p>}</div>}
    </div>
  </details>;
}
