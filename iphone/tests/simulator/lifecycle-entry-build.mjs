import {build} from 'vite';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
await build({root,configFile:resolve(root,'vite.config.ts'),configLoader:'runner',publicDir:false,envDir:false,
  define:{'import.meta.env.VITE_MARRIAGE_ENV':'"staging"','import.meta.env.VITE_MARRIAGE_SUPABASE_URL':'"https://fixturetest.supabase.co"','import.meta.env.VITE_MARRIAGE_SUPABASE_PUBLISHABLE_KEY':'"sb_publishable_fixture_only"'},
  plugins:[{name:'local-entry-sdk',enforce:'pre',resolveId(id,importer){
    if(id==='@supabase/supabase-js'&&importer?.replaceAll('\\','/').endsWith('/src/cloud.ts'))return resolve(here,'lifecycle-entry-transport.mjs');
  }}],
  build:{outDir:resolve(root,process.argv[2]||'dist/simulator-tests'),emptyOutDir:false,copyPublicDir:false,reportCompressedSize:false,rollupOptions:{input:resolve(here,'lifecycle-entry.html')}}
});
