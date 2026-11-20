import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
mkdirSync(artifactDir, { recursive: true });
mkdirSync('test-results', { recursive: true });

async function runShowcase() {
  console.log('Starting Showcase Playwright test...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const hostPage = await hostContext.newPage();
  await hostPage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // 1. Home / Lobby
  await hostPage.screenshot({ path: 'test-results/showcase-01-home.png' });

  // 2. Host creates room
  await hostPage.locator('#player-name').fill('Cảnh sát Trưởng');
  await hostPage.locator('#btn-create-room').click();
  await hostPage.waitForSelector('#display-room-code');
  const code = (await hostPage.locator('#display-room-code').innerText()).trim();

  // 3. Guest joins as Robber
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestPage = await guestContext.newPage();
  await guestPage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await guestPage.locator('#player-name').fill('Tướng cướp Ba');
  await guestPage.locator('#join-room-code').fill(code);
  await guestPage.locator('#btn-join-room').click();

  await hostPage.waitForFunction(() => document.querySelectorAll('#roster-list li').length === 2);
  await hostPage.screenshot({ path: 'test-results/showcase-02-room.png' });

  // 4. Ready & Start
  await hostPage.locator('#btn-toggle-ready').click();
  await guestPage.locator('#btn-toggle-ready').click();
  await hostPage.locator('#btn-start-game').click();

  // 5. Captain selects Jail J1
  await hostPage.waitForSelector('[data-jail="J1"]', { timeout: 10000 });
  await hostPage.locator('[data-jail="J1"]').click();

  // Wait for PLAYING phase so players can run around freely
  console.log('Waiting for PLAYING phase...');
  await hostPage.waitForFunction(() => {
    return document.querySelector('#hud-phase')?.textContent === 'PLAYING';
  }, { timeout: 35000 });

  await hostPage.bringToFront();
  await hostPage.locator('#enter').click();
  await guestPage.bringToFront();
  await guestPage.locator('#enter').click();

  // Force pointerLockElement in page if needed
  await guestPage.evaluate(() => {
    if (!document.pointerLockElement) {
      Object.defineProperty(document, 'pointerLockElement', {
        get: () => document.querySelector('canvas'),
        configurable: true,
      });
      window.dispatchEvent(new Event('pointerlockchange'));
    }
  });
  await hostPage.evaluate(() => {
    if (!document.pointerLockElement) {
      Object.defineProperty(document, 'pointerLockElement', {
        get: () => document.querySelector('canvas'),
        configurable: true,
      });
      window.dispatchEvent(new Event('pointerlockchange'));
    }
  });

  // Host (Police) is at (-2, -18). Guest (Robber) is at (-23, 0).
  // Walk Guest directly towards Police to meet in front of House H02 at (-8, -16)
  console.log('Robber walking towards Police...');
  await guestPage.evaluate(async () => {
    const debug = document.querySelector('#debug');
    const start = performance.now();
    let walking = false;
    const walk = (on) => {
      if (on !== walking) window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: 'KeyW' }));
      walking = on;
    };

    // Robber approaches (-3.5, -16.5)
    while (performance.now() - start < 15000) {
      const curX = Number(debug.dataset.x);
      const curZ = Number(debug.dataset.z);
      const dx = -3.5 - curX;
      const dz = -16.5 - curZ;
      if (Math.hypot(dx, dz) < 1.2) break;

      const targetYaw = Math.atan2(-dx, -dz);
      const delta = targetYaw - Number(debug.dataset.yaw);
      const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (Math.abs(turn) > 0.05) {
        window.dispatchEvent(new MouseEvent('mousemove', { movementX: turn * 320, movementY: 0 }));
      }
      walk(true);
      await new Promise(r => setTimeout(r, 33));
    }
    walk(false);

    // Aim directly at Police (-2, -18)
    const curX = Number(debug.dataset.x);
    const curZ = Number(debug.dataset.z);
    const aimYaw = Math.atan2(-(-2 - curX), -(-18 - curZ));
    const delta = aimYaw - Number(debug.dataset.yaw);
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: delta * 320, movementY: 0 }));
  });

  await guestPage.waitForTimeout(1000);

  // Take screenshot: Robber standing 2m in front of Police looking at Police
  console.log('Capturing close-up of Police Model...');
  await guestPage.screenshot({ path: 'test-results/showcase-03-police-avatar.png' });

  // Now Police turns around and aims directly at Robber
  console.log('Police aiming at Robber...');
  await hostPage.evaluate(() => {
    const debug = document.querySelector('#debug');
    // Robber is at roughly (-3.5, -16.5)
    const curX = Number(debug.dataset.x);
    const curZ = Number(debug.dataset.z);
    const aimYaw = Math.atan2(-(-3.5 - curX), -(-16.5 - curZ));
    const delta = aimYaw - Number(debug.dataset.yaw);
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: delta * 320, movementY: 0 }));
  });

  await hostPage.waitForTimeout(1000);

  // Take screenshot: Police looking at Robber standing 2m away
  console.log('Capturing close-up of Robber Model...');
  await hostPage.screenshot({ path: 'test-results/showcase-04-robber-avatar.png' });

  // Copy all showcase images to artifact directory
  for (const img of [
    'showcase-01-home.png',
    'showcase-02-room.png',
    'showcase-03-police-avatar.png',
    'showcase-04-robber-avatar.png',
  ]) {
    copyFileSync(`test-results/${img}`, resolve(artifactDir, img));
  }
  console.log('Showcase screenshots saved and copied to artifact directory!');

  await browser.close();
}

runShowcase().catch(e => {
  console.error('Showcase failed:', e);
  process.exit(1);
});
