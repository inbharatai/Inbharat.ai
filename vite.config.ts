import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function localApiStub(): Plugin {
  return {
    name: 'local-api-stub',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 503;
          res.end(JSON.stringify({ organic: [], error: 'Local dev: Vercel serverless functions not available. Deploy to Vercel or use vercel dev.' }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3001,
      host: '0.0.0.0',
      proxy: {
        '/openai-proxy': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/openai-proxy/, ''),
        },
      },
    },
    plugins: [localApiStub(), react()],
    define: {
      // Support both OPENAI_API_KEY and VITE_OPENAI_API_KEY so client always gets key
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || ''),
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
