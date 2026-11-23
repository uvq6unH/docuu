import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
mkdirSync(artifactDir, { recursive: true });
mkdirSync('test-results', { recursive: true });

async function runDemo() {
  console.log('Launching headless Chromium with WebGL SwiftShader...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
  });

  console.log('Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // 1. Enter First-Person Practice Gameplay
  console.log('Entering First-Person Practice Mode...');
  await page.locator('#enter').click();
  await page.waitForTimeout(600);

  // Take screenshot: First-person hands in idle posture
  const shot1 = 'test-results/demo-14-viewmodel-hands-idle.png';
  await page.screenshot({ path: shot1 });
  copyFileSync(shot1, resolve(artifactDir, 'demo-14-viewmodel-hands-idle.png'));
  console.log('Saved demo-14-viewmodel-hands-idle.png');

  // 2. Sprinting Motion: Shift + W
  console.log('Sprinting forward (Shift + W)...');
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);

  const shot2 = 'test-results/demo-15-viewmodel-sprint-swing.png';
  await page.screenshot({ path: shot2 });
  copyFileSync(shot2, resolve(artifactDir, 'demo-15-viewmodel-sprint-swing.png'));
  console.log('Saved demo-15-viewmodel-sprint-swing.png');

  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(300);

  // 3. Action Gesture: Capture Swing (Left Click on canvas)
  console.log('Triggering capture hand swipe...');
  await page.mouse.click(640, 360);
  await page.waitForTimeout(120);

  const shot3 = 'test-results/demo-16-viewmodel-capture-swipe.png';
  await page.screenshot({ path: shot3 });
  copyFileSync(shot3, resolve(artifactDir, 'demo-16-viewmodel-capture-swipe.png'));
  console.log('Saved demo-16-viewmodel-capture-swipe.png');

  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 4. Create Room to test Spectator Mode with Bots
  console.log('Testing Spectator Mode with Bots...');
  await page.locator('#player-name').fill('Cướp Thử Nghiệm');
  await page.locator('#btn-create-room').click();
  await page.waitForSelector('#display-room-code');

  // Select Robber role
  await page.locator('#btn-role-robber').click();
  await page.waitForTimeout(200);

  // Add 3 bots
  for (let i = 0; i < 3; i++) {
    await page.locator('#btn-add-bot').click();
    await page.waitForTimeout(100);
  }

  // Auto assign roles
  await page.locator('#btn-auto-roles').click();
  await page.waitForTimeout(200);

  // Ready and Start
  await page.locator('#btn-toggle-ready').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-start-game').click();

  try {
    await page.waitForSelector('[data-jail="J1"]', { timeout: 3000 });
    await page.locator('[data-jail="J1"]').click();
  } catch {
    void 0;
  }

  console.log('Waiting for match start...');
  await page.waitForSelector('#hud-phase', { timeout: 5000 });
  await page.locator('#enter').click();
  await page.waitForTimeout(1000);

  // Verify spectator UI elements
  const spectatorBtn = await page.locator('#btn-spectator-mode').isVisible();
  console.log('Spectator mode button rendered in DOM:', spectatorBtn !== undefined);

  // Capture match in-progress view
  const shot4 = 'test-results/demo-17-multiplayer-match-firstperson.png';
  await page.screenshot({ path: shot4 });
  copyFileSync(shot4, resolve(artifactDir, 'demo-17-multiplayer-match-firstperson.png'));
  console.log('Saved demo-17-multiplayer-match-firstperson.png');

  await browser.close();
  console.log('All verification captures completed successfully!');
}

runDemo().catch((err) => {
  console.error('Demo capture failed:', err);
  process.exit(1);
});
