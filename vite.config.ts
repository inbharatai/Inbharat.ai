import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3001,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
      'process.env.SERPER_API_KEY': JSON.stringify(env.SERPER_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.includes('react/')) return 'react';
              if (id.includes('@clerk/')) return 'clerk';
              if (id.includes('lucide-react')) return 'lucide';
              if (id.includes('openai')) return 'openai';
              if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
              if (id.includes('react-markdown') || id.includes('remark-') || id.includes('unist-') || id.includes('micromark') || id.includes('mdast')) return 'markdown';
            }
          },
        },
      },
      chunkSizeWarningLimit: 500,
    },
  };
});
