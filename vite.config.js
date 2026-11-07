import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const local = (p) => fileURLToPath(new URL(`./src/local/${p}`, import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // `vite build --mode mobile`: the Android app runs the API server in the app itself,
  // so Node-only modules used by server/ are swapped for in-browser versions.
  const mobile = mode === 'mobile';
  return {
    plugins: [react()],
    base: mobile ? './' : '/',
    define: mobile ? { 'import.meta.env.VITE_LOCAL_BACKEND': JSON.stringify('true') } : {},
    resolve: mobile
      ? {
          alias: [
            { find: /^node:sqlite$/, replacement: local('sqlite.js') },
            { find: /^node:(crypto|fs|path|os)$/, replacement: local('nodeShims.js') },
            { find: /^express$/, replacement: local('express.js') },
            { find: /^cookie-parser$/, replacement: local('stubs.js') },
            { find: /^@anthropic-ai\/sdk$/, replacement: local('anthropicStub.js') },
          ],
        }
      : {},
    build: mobile ? { outDir: 'dist-mobile', target: 'es2020' } : {},
    server: {
      port: 3000,
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.js'],
      globalSetup: ['./tests/apiServer.js'],
      testTimeout: 20000,
      include: ['src/**/*.test.{js,jsx}', 'server/**/*.test.js'],
    },
  };
});
