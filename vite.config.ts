import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        port: 5173,
        host: '0.0.0.0',
        strictPort: true,
        hmr: {
          port: 5174, // Different port for HMR
          host: 'localhost',
        },
        // Use polling for file watching
        watch: {
          usePolling: true,
          interval: 1000,
        },
      },
      build: {
        outDir: 'dist',
        sourcemap: true,
      },
      // Suppress WebSocket warnings
      logLevel: 'warn',
    };
});