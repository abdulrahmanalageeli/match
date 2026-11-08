import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  // Hosted consumer previews contain fictional data only. Native production
  // builds keep the normal dedicated-project configuration.
  if (process.env.VERCEL_ENV && mode !== 'demo') throw new Error('Use build:demo for the hosted iPhone preview.');
  return {
    base: './',
    plugins: [react({ babel: { plugins: ['react-native-worklets/plugin'] } })],
    resolve: {
      alias: [{ find: /^react-native$/, replacement: 'react-native-web' }],
      extensions: ['.web.mjs', '.mjs', '.web.js', '.js', '.web.ts', '.ts', '.web.tsx', '.tsx', '.web.jsx', '.jsx', '.json'],
      dedupe: ['react', 'react-dom', 'react-native-reanimated', 'react-native-worklets'],
    },
    define: {
      __DEV__: JSON.stringify(command === 'serve'),
      global: 'globalThis',
      ...(mode === 'demo' ? { 'import.meta.env.VITE_MARRIAGE_ENV': JSON.stringify('demo') } : {}),
    },
    build: { target: 'safari16' },
    server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  };
});
