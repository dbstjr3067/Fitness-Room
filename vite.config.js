import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
