import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
mkdirSync(artifactDir, { recursive: true });
mkdirSync('test-results', { recursive: true });

async function verifyOverhaul() {
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

  console.log('1. Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Shot 1: Redesigned Menu View (Lobby waiting screen)
  console.log('Capturing Redesigned Menu View...');
  const shot1 = 'test-results/demo-20-lobby-redesign.png';
  await page.screenshot({ path: shot1 });
  copyFileSync(shot1, resolve(artifactDir, 'demo-20-lobby-redesign.png'));
  console.log('Saved demo-20-lobby-redesign.png');

  // Shot 1b: Guide tab
  console.log('Testing and capturing Guide Tab...');
  await page.locator('#tab-btn-guide').click();
  await page.waitForTimeout(250);
  const shot1b = 'test-results/demo-20b-lobby-guide-tab.png';
  await page.screenshot({ path: shot1b });
  copyFileSync(shot1b, resolve(artifactDir, 'demo-20b-lobby-guide-tab.png'));
  console.log('Saved demo-20b-lobby-guide-tab.png');

  // Shot 1c: Public Browser tab
  console.log('Testing and capturing Public Rooms Tab...');
  await page.locator('#tab-btn-browser').click();
  await page.waitForTimeout(300);
  const shot1c = 'test-results/demo-25-public-rooms-loaded.png';
  await page.screenshot({ path: shot1c });
  copyFileSync(shot1c, resolve(artifactDir, 'demo-25-public-rooms-loaded.png'));
  console.log('Saved demo-25-public-rooms-loaded.png');

  // Return to play tab
  await page.locator('#tab-btn-play').click();
  await page.waitForTimeout(200);

  // Shot 2: Create room, add bots, show 2-column waiting screen with prominent host start button
  console.log('Entering Room View...');
  await page.locator('#player-name').fill('Trưởng Làng');
  await page.locator('#btn-create-room').click();
  await page.waitForSelector('#display-room-code');
  await page.waitForTimeout(400);

  // Add 2 bots to demonstrate host controls & ready status
  await page.locator('#btn-add-bot').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-add-bot').click();
  await page.waitForTimeout(200);

  // Scroll down so the start button and action footer are fully visible
  await page.locator('#btn-start-game').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const shot2 = 'test-results/demo-21-room-view-waiting.png';
  await page.screenshot({ path: shot2 });
  copyFileSync(shot2, resolve(artifactDir, 'demo-21-room-view-waiting.png'));
  console.log('Saved demo-21-room-view-waiting.png');

  // Shot 3: Host starts the game directly ("khi vào trận chỉ cần chủ phòng bắt đầu")
  console.log('Host launching match directly...');
  await page.locator('#btn-start-game').click();
  await page.waitForTimeout(800);

  // Enter 3D view
  await page.locator('#enter').click();
  await page.waitForTimeout(600);

  const shot3 = 'test-results/demo-22-fullscreen-corner-hud.png';
  await page.screenshot({ path: shot3 });
  copyFileSync(shot3, resolve(artifactDir, 'demo-22-fullscreen-corner-hud.png'));
  console.log('Saved demo-22-fullscreen-corner-hud.png');

  // Shot 4: Move camera near house doorway to inspect clean seamless frame (Zero Z-Fighting)
  console.log('Moving camera towards house doorway...');
  // Turn left towards H01/H02 and walk forward
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(400, 360);
  await page.mouse.up();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);

  const shot4 = 'test-results/demo-23-house-door-seamless.png';
  await page.screenshot({ path: shot4 });
  copyFileSync(shot4, resolve(artifactDir, 'demo-23-house-door-seamless.png'));
  console.log('Saved demo-23-house-door-seamless.png');

  // Shot 5: Look up at the sky, clouds and landscape
  console.log('Looking up at sky, fluffy cumulus clouds, and lush environment...');
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(640, 180);
  await page.mouse.up();
  await page.waitForTimeout(400);

  const shot5 = 'test-results/demo-24-lush-environment-clouds.png';
  await page.screenshot({ path: shot5 });
  copyFileSync(shot5, resolve(artifactDir, 'demo-24-lush-environment-clouds.png'));
  console.log('Saved demo-24-lush-environment-clouds.png');

  await browser.close();
  console.log('All verification captures completed successfully!');
}

verifyOverhaul().catch((err) => {
  console.error('Error during verification capture:', err);
  process.exit(1);
});
