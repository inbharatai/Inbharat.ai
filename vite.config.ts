import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const apiProxyTarget = process.env.VITE_PROXY_API_TARGET || process.env.API_PROXY_TARGET;
  return {
    server: {
      port: 5173,
      strictPort: false,
      host: '0.0.0.0',
      proxy: apiProxyTarget
        ? {
            '/api': {
              target: apiProxyTarget,
              changeOrigin: true,
              secure: true,
            },
          }
        : undefined,
    },
    plugins: [react()],
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
