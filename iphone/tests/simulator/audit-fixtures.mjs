import { build } from 'vite';
import { writeFile, readFile } from 'node:fs/promises';

const pages = {
  welcome: 'member-journey-qa',
  criteria: 'registration-qa?chapter=criteria&consolidation',
  birthday: 'registration-qa?chapter=identity',
  photo: 'registration-qa?chapter=avatar&consolidation',
  readiness: 'registration-qa?chapter=readiness&consolidation',
  settings: 'settings-qa',
  profile: 'profile-qa',
  messages: 'chat-privacy-qa?interrupt',
  luna: 'luna',
};
function path(value) {
  const [file, query] = value.split('?');
  return 'tests/' + (file === 'luna' ? 'simulator/' : 'fixtures/') + file + '.html' + (query ? '?' + query : '');
}
// Match the member entry's viewport and stylesheet cascade on every fixture.
const css = [...(await readFile('src/main.tsx','utf8')).matchAll(/^import ['"](.+?\.css)['"]/gm)].map(match=>match[1].replace('./','/src/'));
const parity = {name:'member-layout',enforce:'pre',
  transform(code,id) {
    if (!/tests[\/](fixtures|simulator)[\/][^/]+\.tsx$/.test(id.replaceAll('\\','/'))) return;
    return code + '\n' + css.map(url=>'import '+JSON.stringify(url)+';').join('\n');
  },
  transformIndexHtml: html=>html.replace('initial-scale=1','initial-scale=1, viewport-fit=cover'),
};
await build({plugins:[parity],mode:'demo', publicDir:false, build:{outDir:'dist/'+(process.env.AUDIT_BEFORE?'baseline':'audit'),rollupOptions:{
  input:[...new Set(Object.values(pages).map(value=>path(value).split('?')[0]))],
}}});
// The runner installs this offline fixture selector in its disposable app bundle.
await writeFile('dist/index.html','<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{padding:66px 16px 24px;display:grid;grid-template-columns:1fr 1fr}a{display:block;padding:8px}</style>' +
  Object.entries(pages).filter(([name])=>['criteria','birthday','settings','profile'].includes(name)).map(([name,value])=>'<a href="baseline/'+path(value)+'">before-'+name+'</a>').join('') + Object.entries(pages).map(([name,value])=>'<a href="audit/'+path(value)+'">'+name+'</a>').join(''));
