import { build } from 'vite';
import { writeFile } from 'node:fs/promises';

const pages = {
  welcome: 'member-journey-qa',
  criteria: 'registration-qa?chapter=criteria&consolidation',
  photo: 'registration-qa?chapter=avatar',
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
await build({mode:'demo', publicDir:false, build:{outDir:'dist/audit',rollupOptions:{
  input:[...new Set(Object.values(pages).map(value=>path(value).split('?')[0]))],
}}});
// The runner installs this offline fixture selector in its disposable app bundle.
await writeFile('dist/index.html','<meta name="viewport" content="width=device-width,initial-scale=1"><style>a{display:block;padding:8px}</style>' +
  Object.entries(pages).map(([name,value])=>'<a href="audit/'+path(value)+'">'+name+'</a>').join(''));
