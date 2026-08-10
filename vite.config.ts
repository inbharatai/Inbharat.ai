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
            if (!id.includes('node_modules')) return undefined;
            // React core — loaded first, heavily cached
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-is')) return 'react';
            // Router — separate chunk, loaded on navigation
            if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
            // Markdown renderer — large, lazy-loaded
            if (
              id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') ||
              id.includes('unist-') || id.includes('micromark') || id.includes('mdast') ||
              id.includes('hast-') || id.includes('html-url') || id.includes('decode-named')
            ) return 'markdown';
            // Icons — frequently updated separately
            if (id.includes('lucide-react')) return 'icons';
            // Supabase — auth client
            if (id.includes('@supabase')) return 'supabase';
            // i18n — translation engine
            if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n';
            // OpenAI SDK (browser bundle)
            if (id.includes('openai')) return 'openai-client';
            // Zod validation
            if (id.includes('/zod/')) return 'validation';
          },
        },
      },
      // Raise warning threshold slightly — 500kB is fine for the react+app chunk
      chunkSizeWarningLimit: 600,
    },
  };
});
