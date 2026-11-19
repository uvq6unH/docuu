import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DEV_');
  const target = env.DEV_SERVER_ORIGIN ?? 'http://127.0.0.1:3001';
  return {
    server: {
      fs: { allow: ['./', '../packages/shared/maps', '../packages/shared/src', '../backend/packages/shared/src/protocol.ts'].map(path => fileURLToPath(new URL(path, import.meta.url))) },
      port: 5173,
      strictPort: true,
      proxy: {
        '/socket.io': { target, ws: true },
        '/healthz': { target },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['tests/unit/**/*.test.ts'],
      clearMocks: true,
      restoreMocks: true,
    },
  };
});



