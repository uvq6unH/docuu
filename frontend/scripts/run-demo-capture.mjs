import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
mkdirSync(artifactDir, { recursive: true });
mkdirSync('test-results', { recursive: true });

async function runDemo() {
  console.log('Launching Chromium with WebGL enabled...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const hostPage = await hostContext.newPage();

  console.log('Opening http://127.0.0.1:5173/ ...');
  await hostPage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // 1. Capture Lobby Screenshot
  const lobbyShot = 'test-results/demo-01-lobby.png';
  await hostPage.screenshot({ path: lobbyShot });
  console.log('Saved lobby screenshot:', lobbyShot);

  // Host creates room
  console.log('Creating room as Host...');
  await hostPage.locator('#player-name').fill('Cảnh sát Đức');
  await hostPage.locator('#btn-create-room').click();
  await hostPage.waitForSelector('#display-room-code');
  const code = (await hostPage.locator('#display-room-code').innerText()).trim();
  console.log('Room created with code:', code);

  // Guest joins
  console.log('Guest joining room...');
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestPage = await guestContext.newPage();
  await guestPage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await guestPage.locator('#player-name').fill('Cướp Nam');
  await guestPage.locator('#join-room-code').fill(code);
  await guestPage.locator('#btn-join-room').click();

  // Wait for roster to show 2 players
  await hostPage.waitForFunction(() => document.querySelectorAll('#roster-list li').length === 2);
  await guestPage.waitForFunction(() => document.querySelectorAll('#roster-list li').length === 2);

  const roomShot = 'test-results/demo-02-room-roster.png';
  await hostPage.screenshot({ path: roomShot });
  console.log('Saved room roster screenshot:', roomShot);

  // Both ready up
  console.log('Both players toggling ready...');
  await hostPage.locator('#btn-toggle-ready').click();
  await guestPage.locator('#btn-toggle-ready').click();

  // Host starts game
  console.log('Host starting game...');
  await hostPage.locator('#btn-start-game').click();

  // Captain picks jail
  console.log('Captain selecting jail J1...');
  await hostPage.waitForSelector('[data-jail="J1"]', { timeout: 10000 });
  await hostPage.locator('[data-jail="J1"]').click();

  // Wait for HEAD_START or PLAYING phase
  console.log('Waiting for match to enter game phase...');
  await hostPage.waitForFunction(() => {
    const phase = document.querySelector('#hud-phase')?.textContent;
    return phase === 'HEAD_START' || phase === 'PLAYING';
  }, { timeout: 25000 });

  // Click into 3D view
  await hostPage.locator('#enter').click();
  await guestPage.locator('#enter').click();

  // Wait 2 seconds for Three.js render frames & model loading
  await hostPage.waitForTimeout(2000);

  const hostGameShot = 'test-results/demo-03-host-gameplay.png';
  await hostPage.screenshot({ path: hostGameShot });
  console.log('Saved host gameplay screenshot:', hostGameShot);

  const guestGameShot = 'test-results/demo-04-guest-gameplay.png';
  await guestPage.screenshot({ path: guestGameShot });
  console.log('Saved guest gameplay screenshot:', guestGameShot);

  // Copy screenshots to artifact directory
  for (const img of ['demo-01-lobby.png', 'demo-02-room-roster.png', 'demo-03-host-gameplay.png', 'demo-04-guest-gameplay.png']) {
    copyFileSync(`test-results/${img}`, resolve(artifactDir, img));
  }
  console.log('All screenshots successfully copied to artifact directory!');

  await browser.close();
}

runDemo().catch(err => {
  console.error('Demo run error:', err);
  process.exit(1);
});
