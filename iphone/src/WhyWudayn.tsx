import {useId,useRef} from 'react';
import {ArrowLeft,X} from './BrandIcons';
import './whyWudayn.css';

export function WhyWudayn({label='ما الذي يختلف في وُدَين؟'}:{label?:string}) {
 const dialog=useRef<HTMLDialogElement>(null),id=useId();
 return <>
  <button type="button" className="wd-why-link" onClick={()=>dialog.current?.showModal()} aria-haspopup="dialog">{label}<ArrowLeft size={14}/></button>
  <dialog ref={dialog} className="wd-why-dialog" dir="rtl" aria-labelledby={id} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
   <div className="wd-why-content">
    <header><span>منهج وُدَين</span><button type="button" className="f-icon" autoFocus aria-label="إغلاق" onClick={()=>dialog.current?.close()}><X size={20}/></button></header>
    <h2 id={id}>اختيار تفهمه.<br/>وتعارف تعرف وجهته.</h2>
    <p>من خبرتنا في لقاءات BlindMatch الواقعية، إلى تجربة مصمّمة لقرار الزواج: من يناسبك، ولماذا، وما الخطوة التالية؟</p>
    <ol>
     <li><span>٠١</span><div><h3>خوارزمية تشرح أسباب التوافق</h3><p>تفضيلات الحياة، والشخصية، ومواقف «بيننا» تعطيك زوايا مختلفة لفهم العلاقة. ترى نقاط الاتفاق وما يستحق النقاش، مع أفكار حوار من إجاباتكما.</p></div></li>
     <li><span>٠٢</span><div><h3>الجدّية باتفاق واضح</h3><p>قبل المحادثة، إقرار جدّية ومدة تقترحها المرأة ويوافق عليها الرجل. تحددان الخطوة التالية، ويمكنكما الاتفاق على تمديد الوقت أو التراجع.</p></div></li>
     <li><span>٠٣</span><div><h3>حين تختاران بعضكما، يتغيّر المسار</h3><p>بموافقتكما على التعارف الحصري، تُغلق الاتصالات الأخرى وتتوقف الترشيحات الجديدة. يظهر الالتزام بوضوح، دون انتقال تلقائي نيابةً عنكما.</p></div></li>
     <li><span>٠٤</span><div><h3>للأهل مساحة، ولكما خصوصيتكما</h3><p>«جسر الأهل» يجمع من تختارونه في محادثة منفصلة لتنسيق الخطوات الرسمية، دون كشف حديثكما الخاص.</p></div></li>
    </ol>
    <details><summary>خبرة واقعية وراء التطوير · اطّلع على الدليل</summary>
     <div className="wd-why-stats"><div><strong>١٠٦</strong><span>مشاركين في دراسة داخلية</span></div><div><strong>١٬٩٦٦</strong><span>تقييمًا اتجاهيًا للاختيارات</span></div></div>
     <p>دراسة BlindMatch لفعاليات ٢٦–٢٨، سبتمبر ٢٠٢٦، قارنت نماذج ترتيب الاختيارات باستخدام مشاركين محجوبين عن التدريب أثناء التقييم. هذه عيّنة من أبحاث التطوير، وليست عدد مستخدمي وُدَين أو حالات زواج ناجحة.</p>
     <p>نسبة التوافق تصف التقارب في الإجابات المتاحة؛ لا تمثل احتمال نجاح الزواج. نميّز بين ما قِيس في اللقاءات وما يحتاج إلى تحقق في تجربة الزواج.</p>
    </details>
    <button type="button" className="f-primary" onClick={()=>dialog.current?.close()}>واضح، لنكمل</button>
   </div>
  </dialog>
 </>;
}
