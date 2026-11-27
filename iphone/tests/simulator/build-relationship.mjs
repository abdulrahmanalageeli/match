import { build } from 'vite';
// Append to the simulator fixture output, preserving signup and bundled member assets.
await build({mode:'demo',publicDir:false,build:{outDir:'dist/simulator-tests',emptyOutDir:false,rollupOptions:{input:['tests/simulator/lifecycle-relationship.html']}}});
