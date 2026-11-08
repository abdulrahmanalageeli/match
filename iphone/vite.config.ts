import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webExtensions = ['.web.mjs', '.mjs', '.web.js', '.js', '.web.ts', '.ts', '.web.tsx', '.tsx', '.web.jsx', '.jsx', '.json'];

export default defineConfig(({ mode, command }) => {
  // Normal hosted builds use the dedicated member project. Fictional/demo builds
  // remain available explicitly; private test accounts have their own entry URL.
  return {
    base: './',
    plugins: [react({ babel: { plugins: ['react-native-worklets/plugin'] } })],
    resolve: {
      alias: [
        { find: /^react-native$/, replacement: 'react-native-web' },
        { find: 'react-native/Libraries/Image/AssetRegistry', replacement: 'react-native-web/dist/modules/AssetRegistry' },
      ],
      extensions: webExtensions,
      dedupe: ['react', 'react-dom', 'react-native-reanimated', 'react-native-worklets'],
    },
    // Dependency prebundling must select the same web implementations as builds.
    optimizeDeps: { esbuildOptions: { resolveExtensions: webExtensions } },
    define: {
      __DEV__: JSON.stringify(command === 'serve'),
      global: 'globalThis',
      ...(mode === 'demo' ? { 'import.meta.env.VITE_MARRIAGE_ENV': JSON.stringify('demo') } : {}),
    },
    build: { target: 'safari16' },
    server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  };
});
