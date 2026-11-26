import { build } from 'vite';

// Bundle the same synthetic screens used by the browser preview into Capacitor.
await build({ mode:'demo', publicDir:false, build:{
  outDir:'dist/simulator-tests', emptyOutDir:true,
  rollupOptions:{input:['tests/fixtures/profile-qa.html']},
}});
