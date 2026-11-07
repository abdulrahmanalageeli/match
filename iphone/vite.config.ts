import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // Hosted consumer previews contain fictional data only. Native production
  // builds keep the normal dedicated-project configuration.
  if (process.env.VERCEL_ENV && mode !== 'demo') throw new Error('Use build:demo for the hosted iPhone preview.');
  return {
    base: './',
    define: mode === 'demo' ? { 'import.meta.env.VITE_MARRIAGE_ENV': JSON.stringify('demo') } : {},
    build: { target: 'safari16' },
    server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  };
});
