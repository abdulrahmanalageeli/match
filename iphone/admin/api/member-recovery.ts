import type { VercelRequest,VercelResponse } from '@vercel/node';

export default async function recover(req:VercelRequest,res:VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).end();
  if(typeof req.headers.authorization!=='string'||!req.headers.authorization.startsWith('Bearer '))return res.status(401).end();
  const project=process.env.NISFAYN_SUPABASE_URL;
  const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!project||!key||project!=='https://wupkifqbwhhebwrgvwai.supabase.co')return res.status(503).json({error:'خدمة الاستعادة غير متصلة.'});
  const redirect=process.env.WUDAYN_MEMBER_RECOVERY_URL??'https://nisfayn-preview.vercel.app/?auth=recovery';
  try{
    const url=new URL(redirect);
    if(url.protocol!=='https:'||url.username||url.password||url.searchParams.get('auth')!=='recovery')return res.status(503).end();
    const input=req.body;
    if(!input||typeof input!=='object'||Array.isArray(input))return res.status(400).end();
    const authorized=await fetch(project+'/rest/v1/rpc/marriage_ops_action',{method:'POST',headers:{Authorization:req.headers.authorization,apikey:key,'Content-Type':'application/json'},body:JSON.stringify({command:'recovery_address',input}),signal:AbortSignal.timeout(8000)});
    if(!authorized.ok)return res.status(authorized.status).json({error:'تحقق من صلاحية الطلب ووجود بريد مؤكد للحساب.'});
    const {email}=await authorized.json() as {email?:string};
    if(!email)return res.status(409).json({error:'لا يوجد بريد مؤكد.'});
    const sent=await fetch(project+'/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email}),signal:AbortSignal.timeout(8000)});
    if(!sent.ok)return res.status(sent.status===429?429:502).json({error:sent.status===429?'أُرسل طلب مؤخرًا. انتظر قبل إعادة المحاولة.':'تعذّر قبول طلب إرسال الرابط.'});
    return res.status(202).json({accepted:true});
  }catch{return res.status(502).json({error:'تعذّر التحقق من إرسال الطلب.'});}
}
