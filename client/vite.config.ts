import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'node:child_process';
import process from 'node:process';

let gitCommitHash = process.env.GIT_COMMIT_HASH || 'dev';
if (gitCommitHash === 'dev') {
  try {
    gitCommitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() || 'dev';
  } catch {
    // ignore
  }
}

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '..');
  const env = loadEnv(mode, envDir, '');
  const devPort = Number.parseInt(env.VITE_DEV_PORT || '5174', 10);
  const backendPort = env.VITE_BACKEND_PORT || env.PORT || '4200';

  return {
    envDir,
    plugins: [react()],
    define: {
      __GIT_COMMIT_HASH__: JSON.stringify(gitCommitHash),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    server: {
      host: true,
      port: devPort,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
