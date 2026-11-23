import type {VercelRequest,VercelResponse} from '@vercel/node';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

export default async function handler(req:VercelRequest,res:VercelResponse) {
 const origin=req.headers.origin;
 if(origin!=='https://nisfayn-preview.vercel.app'&&origin!=='capacitor://localhost') return res.status(403).end();
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).end();
 const key=process.env.NISFAYN_SERVICE_ROLE_KEY,url=process.env.NISFAYN_SUPABASE_URL,network=req.headers['x-vercel-forwarded-for'];
 if(process.env.VERCEL_ENV!=='production'||!key||url!=='https://wupkifqbwhhebwrgvwai.supabase.co'||typeof network!=='string'||!network)return res.status(503).end();
 const bucket=createHash('sha256').update([key,'signup-start',new Date().toISOString().slice(0,13),network.split(',')[0].trim()].join(':')).digest('hex');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await client.rpc('marriage_launch_counter',{kind_value:'signup_start',bucket});
 return res.status(error?503:204).end();
}
