import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
mkdirSync(artifactDir, { recursive: true });

async function captureCloseup() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const hostPage = await hostContext.newPage();
  await hostPage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  await hostPage.locator('#player-name').fill('Cảnh sát Đức');
  await hostPage.locator('#btn-create-room').click();
  await hostPage.waitForSelector('#display-room-code');
  const code = (await hostPage.locator('#display-room-code').innerText()).trim();

  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestPage = await guestContext.newPage();
  await guestPage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await guestPage.locator('#player-name').fill('Cướp Nam');
  await guestPage.locator('#join-room-code').fill(code);
  await guestPage.locator('#btn-join-room').click();

  await hostPage.waitForFunction(() => document.querySelectorAll('#roster-list li').length === 2);
  await guestPage.waitForFunction(() => document.querySelectorAll('#roster-list li').length === 2);

  await hostPage.locator('#btn-toggle-ready').click();
  await guestPage.locator('#btn-toggle-ready').click();
  await hostPage.locator('#btn-start-game').click();

  await hostPage.waitForSelector('[data-jail="J1"]', { timeout: 10000 });
  await hostPage.locator('[data-jail="J1"]').click();

  await hostPage.waitForFunction(() => {
    const phase = document.querySelector('#hud-phase')?.textContent;
    return phase === 'HEAD_START' || phase === 'PLAYING';
  }, { timeout: 25000 });

  await hostPage.locator('#enter').click();
  await guestPage.locator('#enter').click();

  // Bring guest to approach police at (-2, -18)
  console.log('Navigating guest closer to police for high-detail close-up...');
  await guestPage.evaluate(async () => {
    const debug = document.querySelector('#debug');
    const start = performance.now();
    let walking = false;
    const walk = (on) => {
      if (on !== walking) window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: 'KeyW' }));
      walking = on;
    };
    // Target position ~ 2.5m in front of police (-2, -15.5)
    const targetX = -2;
    const targetZ = -15.5;

    while (performance.now() - start < 12000) {
      const curX = Number(debug.dataset.x);
      const curZ = Number(debug.dataset.z);
      const dx = targetX - curX;
      const dz = targetZ - curZ;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.0) break;

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

    // Aim camera directly at police
    const curX = Number(debug.dataset.x);
    const curZ = Number(debug.dataset.z);
    const aimYaw = Math.atan2(-(-2 - curX), -(-18 - curZ));
    const delta = aimYaw - Number(debug.dataset.yaw);
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: delta * 320, movementY: 15 }));
  });

  await guestPage.waitForTimeout(1000);

  const closeupShot = 'test-results/demo-05-police-avatar-closeup.png';
  await guestPage.screenshot({ path: closeupShot });
  copyFileSync(closeupShot, resolve(artifactDir, 'demo-05-police-avatar-closeup.png'));
  console.log('Saved close-up screenshot:', closeupShot);

  // Now let police turn and look at robber to take a close-up of Robber avatar!
  console.log('Police looking at robber...');
  await hostPage.evaluate(() => {
    // Turn around 180 degrees to look south towards the robber
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 3.14 * 320, movementY: 15 }));
  });
  await hostPage.waitForTimeout(1000);

  const robberCloseupShot = 'test-results/demo-06-robber-avatar-closeup.png';
  await hostPage.screenshot({ path: robberCloseupShot });
  copyFileSync(robberCloseupShot, resolve(artifactDir, 'demo-06-robber-avatar-closeup.png'));
  console.log('Saved robber close-up screenshot:', robberCloseupShot);

  await browser.close();
}

captureCloseup().catch(e => {
  console.error(e);
  process.exit(1);
});
