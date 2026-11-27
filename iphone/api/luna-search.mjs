import { protectLunaEndpoint, sendLunaAccessError } from './_lib/luna-access.mjs';
import {createLunaSearch} from './_lib/luna-search.mjs';
import {AIError} from './_lib/ai.mjs';
const search=protectLunaEndpoint('search', createLunaSearch(), 16384);
const origins=new Set(['capacitor://localhost','http://localhost']);
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Vary','Origin');
  if (origins.has(req.headers.origin)) {
    res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  }
  if(req.method==='OPTIONS') return res.status(origins.has(req.headers.origin)?204:403).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(Number(req.headers['content-length']||0)>16384) return res.status(413).json({error:'اكتب حتى ٦٠٠ حرف.'});
  try {
    const closeRecommendations=new URL(req.url??'/', 'http://localhost').searchParams.get('closeRecommendations')==='1';
    return res.status(200).json(await search(req.body,{...req.headers,closeRecommendations}));
  }
  catch(error) { if (sendLunaAccessError(error,res)) return; return res.status(error instanceof AIError?error.status:503).json({error:error instanceof AIError?error.message:'تعذّر البحث الآن. حاول مجددًا.'}); }
}
