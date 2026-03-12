import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  define: {
    __GIT_COMMIT_HASH__: JSON.stringify('test'),
  },
  test: {
    globals: true,
    projects: [
      {
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './client/src'),
            '@shared': path.resolve(__dirname, './shared'),
          },
        },
        define: {
          __GIT_COMMIT_HASH__: JSON.stringify('test'),
        },
        test: {
          name: 'client',
          root: './client',
          environment: 'jsdom',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
        },
      },
      {
        define: {
          __GIT_COMMIT_HASH__: JSON.stringify('test'),
        },
        test: {
          name: 'server',
          root: './server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          globals: true,
        },
      },
      {
        test: {
          name: 'shared',
          root: './shared',
          environment: 'node',
          include: ['**/*.{test,spec}.ts'],
          globals: true,
        },
      },
    ],
  },
});
