import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig(base, {
  testDir: './tests/backend',
  use: { baseURL: 'http://127.0.0.1:5175' },
  webServer: [
    { command: 'node ../backend/apps/server/dist/index.js', env: { PORT: '3017', DATABASE_PATH: ':memory:' }, url: 'http://127.0.0.1:3017/healthz' },
    { command: 'npm run dev -- --port 5175', env: { DEV_SERVER_ORIGIN: 'http://127.0.0.1:3017' }, url: 'http://127.0.0.1:5175' },
  ],
});
