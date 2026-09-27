import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setupTests.js'],
    globals: true,
    // Unit tests only (fast, no WASM).  Heavy WASM integration tests are
    // gated behind TEST_INTEGRATION=1 to prevent laptop-killing RAM spikes.
    include: process.env.TEST_INTEGRATION === '1'
      ? ['tests/**/*.test.jsx', 'tests/**/*.test.js']
      : [
          'tests/**/*.test.jsx',
          'tests/**/*.test.js',
          // Exclude the heavy Tree-sitter pipeline test by default
          '!tests/services/analyzer/analyzer.integration.test.js',
          '!tests/vitest-wts-test.test.js',
        ],
    // Single-process, single fork to cap memory usage
    pool: 'forks',
    forks: {
      minForks: 1,
      maxForks: 1,
      // 512 MB RSS cap — prevents OOM on dev machines
      execArgv: ['--max-old-space-size=512'],
    },
    testTimeout: 30_000,
  },
});
