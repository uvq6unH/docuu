import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
mkdirSync(artifactDir, { recursive: true });
mkdirSync('test-results', { recursive: true });

async function runCapture() {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // Create room
  await page.locator('#player-name').fill('Cảnh sát Đức');
  await page.locator('#btn-create-room').click();
  await page.waitForSelector('#display-room-code');

  // Set Police role
  await page.locator('#btn-role-police').click();
  await page.waitForTimeout(200);

  // Add 3 bots
  for (let i = 0; i < 3; i++) {
    await page.locator('#btn-add-bot').click();
    await page.waitForTimeout(150);
  }

  // Auto assign roles
  await page.locator('#btn-auto-roles').click();
  await page.waitForTimeout(300);

  // Ready and Start
  await page.locator('#btn-toggle-ready').click();
  await page.waitForTimeout(200);
  await page.locator('#btn-start-game').click();

  try {
    await page.waitForSelector('[data-jail="J1"]', { timeout: 3000 });
    await page.locator('[data-jail="J1"]').click();
  } catch {}

  // Wait for PLAYING phase (10s head start)
  console.log('Waiting for PLAYING phase...');
  await page.waitForFunction(() => {
    return document.querySelector('#hud-phase')?.textContent === 'PLAYING';
  }, { timeout: 25000 });

  console.log('PLAYING phase reached!');
  await page.locator('#enter').click();
  await page.waitForTimeout(1500);

  // Press W and look towards village center
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(1000);

  const shot = 'test-results/demo-10-bots-playing-chase.png';
  await page.screenshot({ path: shot });
  console.log('Saved playing chase screenshot:', shot);

  copyFileSync(shot, resolve(artifactDir, 'demo-10-bots-playing-chase.png'));
  console.log('Copied to artifact directory!');

  await browser.close();
}

runCapture().catch(err => {
  console.error(err);
  process.exit(1);
});
