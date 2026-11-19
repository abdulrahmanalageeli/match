import { build } from 'vite';
// Only the simulator job bundles these HTML entries, after the member app build.
await build({ mode:'demo', publicDir:false, build:{
  outDir:'dist/simulator-tests', emptyOutDir:true,
  rollupOptions:{input:['tests/simulator/luna.html','tests/fixtures/chat-privacy-qa.html']},
}});
