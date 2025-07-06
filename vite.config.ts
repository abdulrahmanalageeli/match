import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router', 'react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-slot', '@radix-ui/react-switch', '@radix-ui/react-tabs', '@radix-ui/react-tooltip'],
          icons: ['lucide-react'],
          utils: ['clsx', 'class-variance-authority', 'tailwind-merge'],
        },
      },
    },
    target: 'esnext',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
  server: {
    hmr: {
      overlay: false,
    },
  },
});
