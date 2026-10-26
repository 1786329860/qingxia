import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { localApi } from './scripts/dev-api';
export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), '');
  for (const name of [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ADMIN_PASSWORD',
    'ADMIN_SESSION_SECRET',
  ])
    if (values[name] && !process.env[name]) process.env[name] = values[name];
  return {
    plugins: [react(), localApi()],
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  };
});
