import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const directory=new URL('./',import.meta.url);
const slides=JSON.parse(await readFile(new URL('public/slides.json',directory),'utf8'));
let code;try{code=(await readFile(new URL('.env.host',directory),'utf8')).trim().split('=')[1];}catch{code=randomBytes(16).toString('hex').toUpperCase();await writeFile(new URL('.env.host',directory),`CIRCLE_HOST_CODE=${code}\n`);}
const hash=createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
const sql=`update public.circle_events set slides = '${JSON.stringify(slides).replaceAll("'","''")}'::jsonb, current_slide_id = coalesce(current_slide_id,'page-1'), host_code_hash = '${hash}' where id = 'the-circle-2026-10-07';\nselect id, jsonb_array_length(slides) as slides, host_code_hash is not null as host_configured from public.circle_events where id='the-circle-2026-10-07';\n`;
await writeFile(new URL('seed-event.sql',directory),sql);console.log('Prepared event seed and private local host code.');
