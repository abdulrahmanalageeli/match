import { protectLunaEndpoint, sendLunaAccessError } from './_lib/luna-access.mjs';
import {createDeepAnalysisService,DeepAnalysisError,MAX_BODY} from './_lib/deep-compatibility.mjs';
const serve=protectLunaEndpoint('deep', createDeepAnalysisService(), MAX_BODY);
const origins=new Set(['capacitor://localhost','http://localhost']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
 const native=origins.has(req.headers.origin);
 if(native){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization')}
 if(req.method==='OPTIONS'){const asked=req.headers['access-control-request-headers'];return res.status(native&&req.headers['access-control-request-method']==='POST'&&(!asked||typeof asked==='string'&&asked.split(',').every(k=>['content-type','authorization'].includes(k.trim().toLowerCase())))?204:403).end()}
 if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return res.status(405).json({error:'Method not allowed'})}
 if(Number(req.headers['content-length']||0)>MAX_BODY)return res.status(413).json({error:'الطلب أطول من المسموح.'});
 try{return res.status(200).json(await serve(req.body,req.headers))}catch(error){if (sendLunaAccessError(error,res)) return; return res.status(error instanceof DeepAnalysisError?error.status:503).json({error:error instanceof DeepAnalysisError?error.message:'تعذّر إكمال التحليل الآن.'})}
}
