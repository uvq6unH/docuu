import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DEV_');
  const target = env.DEV_SERVER_ORIGIN ?? 'http://127.0.0.1:3001';
  return {
    server: {
      host: '0.0.0.0',
      fs: { allow: ['./', '../packages/shared/maps', '../packages/shared/src'].map(path => fileURLToPath(new URL(path, import.meta.url))) },
      port: 5173,
      strictPort: true,
      proxy: {
        '/socket.io': { target, ws: true },
        '/healthz': { target },
        '/api': { target },
      },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/three')) {
              return 'three';
            }
            if (id.includes('node_modules/socket.io-client')) {
              return 'socketio';
            }
          },
        },
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



