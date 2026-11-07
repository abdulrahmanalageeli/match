import { Buffer } from 'node:buffer'
import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { Environment, SignedDataVerifier, VerificationStatus } from 'npm:@apple/app-store-server-library@3.1.0'

const bundle = 'com.blindmatch.marriage'
const product = 'com.blindmatch.marriage.monthly'
let verifier: SignedDataVerifier | undefined

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function configured(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new HttpError(503, 'إعداد الخدمة غير مكتمل.')
  return value
}

function key(newName: string, legacyName: string): string {
  const raw = Deno.env.get(newName)
  return raw ? JSON.parse(raw).default || configured(legacyName) : configured(legacyName)
}

export function admin() {
  return createClient(configured('SUPABASE_URL'), key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),
    {auth:{persistSession:false,autoRefreshToken:false}})
}

export async function currentUser(req: Request): Promise<string> {
  const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') ?? '')
  if (!bearer) throw new HttpError(401, 'يلزم تسجيل الدخول.')
  const userClient = createClient(configured('SUPABASE_URL'), key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),
    {auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+bearer[1]}}})
  const {data,error}=await userClient.auth.getUser(bearer[1])
  if (error || !data.user) throw new HttpError(401, 'يلزم تسجيل الدخول.')
  // The SQL helper checks the session still exists, even for a signed JWT.
  const session=await userClient.rpc('marriage_state')
  if (session.error || session.data?.user?.id!==data.user.id) throw new HttpError(401,'انتهت الجلسة.')
  return data.user.id
}

function apple(): SignedDataVerifier {
  if (verifier) return verifier
  const env = configured('APPLE_STORE_ENV')
  if (env!==Environment.SANDBOX && env!==Environment.PRODUCTION) throw new HttpError(503,'إعداد بيئة Apple غير صالح.')
  const appId = Number(Deno.env.get('APPLE_APP_ID'))
  if (env===Environment.PRODUCTION && (!Number.isSafeInteger(appId) || appId<=0)) throw new HttpError(503,'معرّف Apple غير مهيأ.')
  const roots=configured('APPLE_ROOT_CERTS_BASE64').split(',').map(value=>Buffer.from(value.trim(),'base64'))
  if (!roots.length || roots.some(cert=>cert.length<100)) throw new HttpError(503,'شهادات Apple غير مهيأة.')
  verifier=new SignedDataVerifier(roots,true,env,bundle,appId||undefined)
  return verifier
}

function validateJws(value: unknown): string {
  if(typeof value!=='string' || value.length>64000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))
    throw new HttpError(400,'بيانات Apple غير صالحة.')
  return value
}

async function verify<T>(work:()=>Promise<T>):Promise<T>{
  try { return await work() }
  catch (e) {
    if(e instanceof HttpError)throw e
    if(e && typeof e==='object' && 'status' in e && e.status===VerificationStatus.RETRYABLE_VERIFICATION_FAILURE)
      throw new HttpError(503,'التحقق من Apple غير متاح مؤقتًا.')
    throw new HttpError(403,'تعذّر التحقق من توقيع Apple.')
  }
}

export async function ingest(jws: unknown, actor: string|null, notification: boolean) {
  const signed=validateJws(jws)
  const receipt=await verify(()=>apple().verifyAndDecodeTransaction(signed))
  if(notification && (receipt.productId!==product || !receipt.appAccountToken))return null
  if(receipt.bundleId!==bundle || receipt.productId!==product || !receipt.appAccountToken)
    throw new HttpError(403,'الاشتراك لا يخص هذا التطبيق.')
  const {data,error}=await admin().rpc('marriage_record_receipt',{actor,receipt,notification})
  if(error)throw new HttpError(error.code==='42501'?403:error.code==='22023'?400:503,'تعذّر تسجيل اشتراك Apple.')
  return data
}

export async function notification(req: Request) {
  const body=await readBody(req)
  const signed=validateJws(body.signedPayload)
  const message=await verify(()=>apple().verifyAndDecodeNotification(signed))
  if(message.data?.signedTransactionInfo) await ingest(message.data.signedTransactionInfo,null,true)
  return {ok:true}
}

export async function readBody(req:Request):Promise<Record<string,unknown>>{
  const reader=req.body?.getReader()
  if(!reader)throw new HttpError(400,'بيانات الطلب مفقودة.')
  const chunks:Uint8Array[]=[]
  let size=0
  while(true){
    const part=await reader.read()
    if(part.done)break
    size+=part.value.byteLength
    if(size>72000){await reader.cancel();throw new HttpError(413,'الطلب كبير جدًا.')}
    chunks.push(part.value)
  }
  try {
    const content=await new Blob(chunks as BlobPart[]).text()
    const value=JSON.parse(content)
    if(!value || typeof value!=='object'||Array.isArray(value))throw Error()
    return value
  }catch{throw new HttpError(400,'بيانات الطلب غير صالحة.')}
}

const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
export function endpoint(action:(req:Request)=>Promise<unknown>){
  return async(req:Request):Promise<Response>=>{
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
    try {
      if(req.method!=='POST')throw new HttpError(405,'طريقة اتصال غير مدعومة.')
      return Response.json(await action(req),{headers})
    }catch(e){
      const status=e instanceof HttpError?e.status:503
      const error=e instanceof HttpError?e.message:'الخدمة غير متاحة مؤقتًا.'
      return Response.json({error},{status,headers})
    }
  }
}
