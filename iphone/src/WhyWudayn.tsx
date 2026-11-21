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
    <h2 id={id}>كيف نقرأ التوافق بينكم؟</h2>
    <p>تبدأ القراءة من جانبين. وش يهمّك في شريك حياتك؟ ووش يهمّه هو؟</p>
    <ol>
     <li><span>٠١</span><div><h3>كلامك بإقرارك</h3><p>تقترح لونا إجابات من وصفك لنفسك ولشريكك. تقدر تعدّل أي اقتراح وتجاوب بنفسك عن باقي الأسئلة.</p></div></li>
     <li><span>٠٢</span><div><h3>التوافق من الجهتين</h3><p>نقارن رغبات كل طرف بإجابات الثاني عن أمور مثل العمل والأطفال والمصاريف. وللطباع قراءة مستقلة توضّح وين تتشابهون ووين تختلفون.</p></div></li>
     <li><span>٠٣</span><div><h3>من النسبة إلى الحديث</h3><p>تفاصيل التوافق تفتح لكم مواضيع للنقاش. وفي مواقف «بيننا» تقدرون تشوفون كيف يتعامل كل طرف مع موقف من الحياة اليومية.</p></div></li>
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
