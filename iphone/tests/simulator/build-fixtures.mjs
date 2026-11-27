import { readFile } from 'node:fs/promises';
import { build } from 'vite';

const main = await readFile('src/main.tsx', 'utf8');
const memberEntry = '<App openLogin={testerEntry}/>';
if (!main.includes(memberEntry)) throw new Error('The member app entry changed');

await build({
  plugins: [{
    name: 'offline-simulator-preview',
    enforce: 'pre',
    transform(_code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/tests/simulator/preview-entry.tsx')) return;
      const source = main.replace(/^(import .*?['"])\.\//gm, '$1../../src/')
        .replaceAll("import('./", "import('../../src/")
        .replace(memberEntry, '<App tester={previewSession}/>');
      return "import { previewSession } from './preview-session';\n" + source;
    },
  }],
  build: { rollupOptions: { input: ['index.html', 'tests/simulator/preview.html'] } },
});
