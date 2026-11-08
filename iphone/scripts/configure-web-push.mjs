// Run only for the already-linked Nisfayn projects. Secrets go through stdin;
// the recoverable signing key stays in the ignored .vercel directory.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const cli=process.argv[2];
if(!cli)throw Error('Pass the installed Vercel CLI entrypoint');
const root=fileURLToPath(new URL('../',import.meta.url));
const admin=fileURLToPath(new URL('../admin/',import.meta.url));
for(const [cwd,id] of [[root,'prj_Ucec4gPCxXWUEp5PLeoqaIYNRqbL'],[admin,'prj_R65TZRZWM1rpP6ohL7et5aH1PCyN']]){
 const link=JSON.parse(readFileSync(cwd+'/.vercel/project.json','utf8'));
 if(link.projectId!==id||link.orgId!=='team_A9No1ttTsWExk5NqWNwDWq96')throw Error('Wrong deployment target');
}
const keyFile=root+'/.vercel/web-push.keys.json';
const require=createRequire(new URL('../admin/package.json',import.meta.url));
const keys=existsSync(keyFile)?JSON.parse(readFileSync(keyFile,'utf8')):require('web-push').generateVAPIDKeys();
if(!existsSync(keyFile))writeFileSync(keyFile,JSON.stringify(keys),{mode:0o600});
const values=[
 [admin,'WEB_PUSH_VAPID_PUBLIC_KEY',keys.publicKey,'config'],
 [admin,'WEB_PUSH_VAPID_PRIVATE_KEY',keys.privateKey,'secret'],
 [admin,'WEB_PUSH_VAPID_SUBJECT','mailto:privacy@blindmatch.app','config'],
 [admin,'NISFAYN_WEB_PUSH_ENABLED','true','config'],
 [root,'VITE_MARRIAGE_WEB_PUSH_PUBLIC_KEY',keys.publicKey,'config'],
 [root,'VITE_MARRIAGE_WEB_PUSH_ENABLED','true','config'],
];
for(const [cwd,name,value,type] of values){
 try{execFileSync(process.execPath,[cli,'env','add',name,'production','--type',type,'--yes','--force'],{cwd,input:value,stdio:['pipe','pipe','pipe'],timeout:60000});}
 catch{throw Error('Could not configure '+name+'; secret output suppressed');}
 console.log('Configured '+name);
}
