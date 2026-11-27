import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Gift, RefreshCw} from 'lucide-react';
import {Check, ChevronLeft} from '../BrandIcons';
import {BrandWordmark} from '../Brand';
import {Frame} from '../Screens';
import {callRpc} from '../cloud';
import {buyGift, giftPrice, isIOSBilling, type GiftPrice} from '../billing';
import {normalizeSignupPhone} from '../auth/SignupSms';
import {giftProductId, membershipPriceLabel, seriousnessPriceLabel, type MembershipPlan} from '../membershipPricing';
import './gift-membership.css';

export type GiftRecipient = {id:string;name:string};
type Received = {id:string;tier:MembershipPlan;senderName:string;days:number};
type Sent = {id:string;tier:MembershipPlan;recipientName:string|null;recipientHint?:string;status:'waiting'|'ready'|'delivered'|'processing'|'paymentPending'|'refunded';productId:string|null};
const plans = {premium:'وُدَين المميزة', seriousness:'وسام الجدية'};
const giftTiers = ['premium','seriousness'] as const;
const giftRecipients = ['man','woman'] as const;
const giftProducts = giftTiers.flatMap(plan => giftRecipients.map(gender => giftProductId(plan,gender)));
const seals = {premium:'/brand/wudayn-member-seal.png', seriousness:'/brand/wudayn-seriousness-seal.png'};
const memberId = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

function giftError(cause:unknown, fallback:string) {
  if (cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message)) return cause.message;
  return fallback;
}

export function GiftMembership({owner,target,back,attention,settle,refreshAccount,focusGift,onGiftFocused}:{
  owner:string;target?:GiftRecipient;back:()=>void;attention:number;focusGift?:string;onGiftFocused?:()=>void;
  settle:(jws:string)=>Promise<void>;refreshAccount:()=>Promise<unknown>;
}) {
  const ios = isIOSBilling();
  const [tier,setTier] = useState<MembershipPlan>('premium');
  const [tab,setTab] = useState<'create'|'gifts'>((focusGift || !target && attention) ? 'gifts' : 'create');
  const [method,setMethod] = useState<'phone'|'member'>(target?'member':'phone');
  const [value,setValue] = useState('');
  const [prices,setPrices] = useState<Record<string,GiftPrice|undefined>>({});
  const [priceAttempt,setPriceAttempt] = useState(0);
  const [pricesDone,setPricesDone] = useState(false);
  const [inbox,setInbox] = useState<Received[]>([]);
  const [outbox,setOutbox] = useState<Sent[]>([]);
  const [listStatus,setListStatus] = useState<'loading'|'error'|'ready'>('loading');
  const [revision,setRevision] = useState(0);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [verifying,setVerifying] = useState<string[]>([]);
  const lock = useRef(false);
  const attempt = useRef<{key:string;id:string}|null>(null);
  const alive = useRef(true);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  useEffect(()=>{
    if (!ios) return;
    let active=true;
    setPricesDone(false);
    setPrices({});
    void Promise.allSettled(giftProducts.map(product => giftPrice(product))).then(results=>{
      if (!active) return;
      const available:Record<string,GiftPrice>={};
      for(const result of results) {
        if(result.status==='fulfilled') available[result.value.productId]=result.value;
      }
      setPrices(available);
      setPricesDone(true);
    });
    return ()=>{active=false;};
  },[ios,priceAttempt]);
  useEffect(()=>{
    let active=true;
    const reload=()=>{if (!document.hidden) setRevision(n=>n+1);};
    document.addEventListener('visibilitychange',reload);
    window.addEventListener('wudayn:gift-settled',reload);
    void Promise.all([callRpc<Received[]>('wudayn_received_gifts',{},owner),callRpc<Sent[]>('wudayn_sent_gifts',{},owner)]).then(([received,sent])=>{
      if(active){setInbox(received);setOutbox(sent);setListStatus('ready');}
    }).catch(()=>{if(active)setListStatus('error');});
    return ()=>{active=false;document.removeEventListener('visibilitychange',reload);window.removeEventListener('wudayn:gift-settled',reload);};
  },[owner,revision,attention]);
  useEffect(()=>{
    if(!focusGift||listStatus!=='ready') return;
    if(tab!=='gifts'){setTab('gifts');return;}
    document.getElementById(`gift-${focusGift}`)?.scrollIntoView({block:'center'});
    onGiftFocused?.();
  },[focusGift,listStatus,tab,onGiftFocused]);
  async function run(action:()=>Promise<void>) {
   if(lock.current) return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try {await action();}
    catch(cause){if(alive.current)setError(giftError(cause,'تعذّر إتمام الخطوة. حاول مجددًا.'));}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  function reload(){setRevision(n=>n+1);void refreshAccount().catch(()=>{});}
  function changeTab(next:'create'|'gifts'){setTab(next);setNotice('');setError('');}
  function invite(event:FormEvent) {
    event.preventDefault();
    void run(async()=>{
      const member=method==='member'?(target?.id??value.trim()):null;
      if (member!==null && (!memberId.test(member)||member.toLowerCase()===owner.toLowerCase())) throw Error('أدخل معرّف عضو آخر كما يظهر في إعدادات حسابه.');
      const phone=method==='phone'?normalizeSignupPhone(value):null;
      const key=[tier,member,phone].join('|');
      if(attempt.current?.key!==key) attempt.current={key,id:crypto.randomUUID()};
      await callRpc('wudayn_prepare_gift',{request_id:attempt.current.id,selected_tier:tier,recipient_member:member,recipient_phone:phone},owner);
      if(!alive.current)return;
      attempt.current=null;setValue('');setTab('gifts');reload();
    });
  }
  function respond(row:Received,accept:boolean) {
    void run(async()=>{
      await callRpc(accept?'wudayn_accept_gift':'wudayn_decline_gift',{gift_id:row.id},owner);
      if(!alive.current)return;
      setInbox(old=>old.filter(r=>r.id!==row.id));setNotice(accept?'قبلت الدعوة. يستطيع المُهدي الآن إتمام الشراء.':'أُغلقت الدعوة.');reload();
    });
  }
  function quoteFor(row:Sent) {
    if (!row.productId || !giftRecipients.some(gender=>giftProductId(row.tier,gender)===row.productId)) return;
    return prices[row.productId];
  }
  function pay(row:Sent) {
    void run(async()=>{
      const shown=quoteFor(row);
      if(!ios||!shown||!row.recipientName)throw Error('راجع الهدية وسعرها في تطبيق وُدَين على iPhone.');
      const order=await callRpc<{orderToken:string;productId:string}>('wudayn_gift_checkout',{gift_id:row.id},owner);
      if (order.productId!==shown.productId) {
        await callRpc('wudayn_release_gift_checkout',{order_token:order.orderToken},owner);
        reload();
        throw Error('تغيّرت بيانات الهدية. راجع السعر المحدّث قبل الشراء.');
      }
      let jws:string;
      try {jws=await buyGift(shown,order.orderToken);}
      catch(cause){
        setPriceAttempt(n=>n+1);
        const code=(cause as {code?:string})?.code;
        if(code==='CANCELLED'||code==='OFFER_CHANGED'||code==='OFFER_UNAVAILABLE'){
          await callRpc('wudayn_release_gift_checkout',{order_token:order.orderToken},owner).catch(()=>{});
          if(code==='CANCELLED'){setNotice('ما اكتمل الدفع. تقدر ترجع للهدية لاحقًا.');return;}
          if(code==='OFFER_UNAVAILABLE')throw Error('تعذّر تأكيد سعر الهدية في App Store. حدّث السعر وحاول مجددًا.');
          throw Error('تغيّر السعر في App Store. راجع السعر المحدّث قبل الشراء.');
        }
        if(code==='IN_PROGRESS'){setNotice('بدأ شراء هذه الهدية بالفعل. تحقّق من حالة العملية في Apple.');return;}
        if(code==='ALREADY_DELIVERED'){reload();setNotice('سُجّلت عملية الشراء من قبل. تُحدَّث حالة الهدية الآن.');return;}
        if(code==='PENDING'){reload();setNotice('عملية الشراء بانتظار موافقة Apple.');return;}
        throw cause;
      }
      setVerifying(ids=>[...ids,row.id]);
      try{await settle(jws);}
      catch{throw Error('وصلت عملية الشراء من Apple. سنعيد التحقق تلقائيًا عند الاتصال.');}
      if(!alive.current)return;
      setNotice('اكتمل شراء الهدية.');reload();
    });
  }
  const planPrices = giftRecipients.map(gender=>({
    label:gender==='man'?'للرجال':'للنساء',
    price: ios ? prices[giftProductId(tier,gender)]?.price :
      (tier==='premium'?membershipPriceLabel(gender):seriousnessPriceLabel(gender)),
  }));
  const missingPrice = planPrices.some(row=>!row.price);
  const openGifts=attention?new Intl.NumberFormat('ar-SA').format(attention):'';
  return <Frame back={back} backDisabled={busy} title="إهداء العضوية" className="wd-gift-page">
    <div className="wd-gift-nav" aria-label="خيارات الإهداء" role="group">
      <button type="button" aria-pressed={tab==='create'} onClick={()=>changeTab('create')}>هدية جديدة</button>
      <button type="button" aria-pressed={tab==='gifts'} onClick={()=>changeTab('gifts')}>هداياي{openGifts && <b>{openGifts}</b>}</button>
    </div>
    {tab==='create'?<>
      <div className="wd-gift-paper" data-tier={tier} aria-label={plans[tier]+' لمدة ٣٠ يومًا'}>
        <div className="wd-gift-stationery"><BrandWordmark/><span>بطاقة إهداء</span></div>
        <div className="wd-gift-inscription"><h1>{plans[tier]}</h1><p>عضوية لمدة ٣٠ يوم</p></div>
        <img className="wd-gift-seal" src={seals[tier]} width="75" height="75" alt=""/>
      </div>
      <form className="wd-gift-form" onSubmit={invite}>
        <fieldset disabled={busy}><legend>اختر الهدية</legend>
          <div className="wd-gift-plans">{giftTiers.map(plan=><button key={plan} type="button" aria-pressed={tier===plan} onClick={()=>{setTier(plan);setError('');}}>
            <img src={seals[plan]} alt=""/><span>{plan==='premium'?'المميزة':plans[plan]}</span>{tier===plan&&<Check size={14}/>}
          </button>)}</div>
          <div className="wd-gift-prices" aria-label={ios?'سعر الهدية حسب المستلم':'سعر الهدية المرجعي في السعودية حسب المستلم'}>
            {planPrices.map(({label,price})=><span key={label}>{label} <bdi>{price??'—'}</bdi></span>)}
          </div>
          <p className="wd-gift-benefit">{tier==='premium'?'قراءة التوافق والمبادرة بطلب التعارف.':'مزايا المميزة، مع بحث لونا وتحليل التوافق المعمّق.'}</p>
        </fieldset>
        <fieldset disabled={busy}><legend>لمن الهدية؟</legend>
          {target?<p className="wd-gift-target"><Gift size={17}/><bdi>{target.name}</bdi></p>:<>
            <div className="wd-gift-method" role="group" aria-label="طريقة اختيار المستلم">{(['phone','member'] as const).map(mode=><button key={mode} type="button" aria-pressed={method===mode} onClick={()=>{setMethod(mode);setValue('');setError('');}}>{mode==='phone'?'رقم الجوال':'معرّف العضو'}</button>)}</div>
            <input aria-label={method==='phone'?'رقم جوال المستلم':'معرّف العضو المستلم'} dir="ltr" type={method==='phone'?'tel':'text'} autoCapitalize="none" spellCheck={false} autoComplete="off" maxLength={method==='phone'?24:36} required value={value} placeholder={method==='phone'?'05X XXX XXXX':'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'} onChange={e=>{setValue(e.target.value);setError('');}}/>
          </>}
          <p className="wd-gift-detail">{method==='member'&&!target?'يمكن للعضو مشاركة معرّفه من إعدادات حسابه. ':''}تصل الدعوة داخل وُدَين. تدفع مرة واحدة بعد قبولها، دون تجديد.</p>
        </fieldset>
        {ios&&missingPrice&&<p className="wd-gift-detail">{pricesDone?<><span>بعض أسعار الهدايا غير متاحة حاليًا. </span><button type="button" className="wd-gift-text" onClick={()=>setPriceAttempt(n=>n+1)}>إعادة تحميل السعر</button></>:'جارٍ تحميل سعر App Store…'}</p>}
        {!ios&&<p className="wd-gift-detail">الأسعار المعروضة للسعودية. يظهر سعر متجرك عند الدفع في تطبيق iPhone.</p>}
        <button className="f-primary wd-gift-cta" disabled={busy||(ios&&planPrices.every(row=>!row.price))}>{busy?'جارٍ الإرسال…':'إرسال دعوة الإهداء'}<ChevronLeft size={17}/></button>
      </form>
    </>:<section className="wd-gift-history">
      <div className="wd-gift-history-heading"><h1>هداياي</h1><button type="button" aria-label="تحديث الهدايا" onClick={reload}><RefreshCw size={17}/></button></div>
      {listStatus==='loading'&&<p role="status">جارٍ تحميل الهدايا…</p>}
      {listStatus==='error'&&<p role="alert">ما قدرنا نعرض هداياك. جرّب تحدّث القائمة.</p>}
      {listStatus==='ready'&&!inbox.length&&!outbox.length&&<div className="wd-gift-empty"><Gift size={28}/><h2>لا توجد هدايا بعد</h2><button className="wd-gift-text" onClick={()=>changeTab('create')}>اختيار هدية</button></div>}
      {inbox.length>0&&<h2>دعوات وصلتني</h2>}
      {inbox.map(row=><article key={row.id} id={`gift-${row.id}`} className="wd-gift-record"><img src={seals[row.tier]} alt=""/><div><h3>{plans[row.tier]}</h3><p>دعوة من <bdi>{row.senderName}</bdi> · ٣٠ يومًا</p><small>بقبولك يظهر اسمك في وُدَين للمُهدي ليُكمل الشراء.</small><div className="wd-gift-row-actions"><button disabled={busy} onClick={()=>respond(row,true)}>قبول الدعوة</button><button disabled={busy} onClick={()=>respond(row,false)}>اعتذار</button></div></div></article>)}
      {outbox.length>0&&<h2>هدايا أرسلتها</h2>}
      {outbox.map(row=>{
        const quote=quoteFor(row);
        return <article key={row.id} className="wd-gift-record" data-state={row.status} data-tier={row.tier}><img src={seals[row.tier]} alt=""/><div><h3>{plans[row.tier]}</h3>{(row.recipientName||row.recipientHint)&&<p>إلى <bdi>{row.recipientName??row.recipientHint}</bdi></p>}
        <p>{row.status==='delivered'?'وصلت الهدية':row.status==='paymentPending'?'بانتظار تأكيد الشراء من Apple':row.status==='refunded'?'رُدّ مبلغ الهدية':row.status==='processing'?'قيد مراجعة التسليم':row.status==='waiting'?'بانتظار قبول الدعوة':verifying.includes(row.id)?'جارٍ التحقق من الشراء':'قُبلت الدعوة · جاهزة للإهداء'}</p>
        {row.status==='processing'&&<small>يمكنك مراجعة الشراء أو طلب استرداده من <a href="https://reportaproblem.apple.com" target="_blank" rel="noreferrer">دعم مشتريات Apple</a>.</small>}
        {row.status==='ready'&&row.recipientName&&<>{ios?<button type="button" className="wd-gift-payment" disabled={busy||verifying.includes(row.id)||!quote} onClick={()=>pay(row)}>{quote?'إهداء ٣٠ يومًا · '+quote.price:'بانتظار سعر المتجر'}</button>:<small>أكمل الشراء في تطبيق وُدَين على iPhone.</small>}{ios&&!quote&&pricesDone&&<button className="wd-gift-text" onClick={()=>setPriceAttempt(n=>n+1)}>تحديث السعر</button>}</>}
      </div></article>;})}
    </section>}
    {notice&&<p className="wd-gift-feedback" role="status"><Check size={16}/>{notice}</p>}
    {error&&<p className="wd-gift-error" role="alert">{error}</p>}
  </Frame>;
}
