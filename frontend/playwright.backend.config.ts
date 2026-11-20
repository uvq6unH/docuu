import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const lanHost = process.env.PLAYWRIGHT_LAN_HOST;
const baseURL = `http://${lanHost || '127.0.0.1'}:5175`;

export default defineConfig(base, {
  testDir: './tests/backend',
  use: { baseURL },
  webServer: [
    { command: 'node ../backend/apps/server/dist/index.js', env: { PORT: '3017', DATABASE_PATH: ':memory:' }, url: 'http://127.0.0.1:3017/healthz' },
    { command: `npm run ${lanHost ? 'dev:lan' : 'dev'} -- --port 5175`, env: { DEV_SERVER_ORIGIN: 'http://127.0.0.1:3017' }, url: baseURL },
  ],
});
