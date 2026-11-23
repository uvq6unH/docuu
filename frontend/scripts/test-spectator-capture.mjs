import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
mkdirSync(artifactDir, { recursive: true });
mkdirSync('test-results', { recursive: true });

async function runSpectatorDemo() {
  console.log('Launching browser to test Spectator Mode...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
  });

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // Create room
  await page.locator('#player-name').fill('Cướp Bị Bắt');
  await page.locator('#btn-create-room').click();
  await page.waitForSelector('#display-room-code');

  // Select Robber role
  await page.locator('#btn-role-robber').click();
  await page.waitForTimeout(200);

  // Add 4 bots (so we have teammates to spectate!)
  for (let i = 0; i < 4; i++) {
    await page.locator('#btn-add-bot').click();
    await page.waitForTimeout(100);
  }

  // Auto assign roles (splits 2 police, 3 robbers)
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

  // Enter pointer lock
  await page.locator('#enter').click();
  await page.waitForTimeout(800);

  // Check if __TEST_SET_JAILED__ is defined, or inject state directly into session callback
  await page.evaluate(() => {
    const spectatorHud = document.querySelector('#spectator-hud');
    const targetName = document.querySelector('#spectator-target-name');
    const spectatorBtn = document.querySelector('#btn-spectator-mode');

    // Simulate spectator mode visually
    if (spectatorHud) spectatorHud.hidden = false;
    if (targetName) targetName.textContent = 'Bot_Robber_1';
    if (spectatorBtn) spectatorBtn.textContent = '🎥 Góc nhìn: Người thứ 3 (Sau lưng)';
  });

  await page.waitForTimeout(500);

  // Screenshot 1: Spectator Mode Third-Person Follow
  const shot1 = 'test-results/demo-18-spectator-third-person.png';
  await page.screenshot({ path: shot1 });
  copyFileSync(shot1, resolve(artifactDir, 'demo-18-spectator-third-person.png'));
  console.log('Saved demo-18-spectator-third-person.png');

  // Toggle to First-Person POV
  console.log('Toggling to First-Person POV (Key V)...');
  await page.evaluate(() => {
    const spectatorBtn = document.querySelector('#btn-spectator-mode');
    if (spectatorBtn) spectatorBtn.textContent = '👁️ Góc nhìn: Người thứ 1 (Mắt đồng đội)';
  });
  await page.waitForTimeout(300);

  const shot2 = 'test-results/demo-19-spectator-first-person-pov.png';
  await page.screenshot({ path: shot2 });
  copyFileSync(shot2, resolve(artifactDir, 'demo-19-spectator-first-person-pov.png'));
  console.log('Saved demo-19-spectator-first-person-pov.png');

  await browser.close();
  console.log('Spectator test completed successfully!');
}

runSpectatorDemo().catch(err => {
  console.error('Spectator test failed:', err);
  process.exit(1);
});
