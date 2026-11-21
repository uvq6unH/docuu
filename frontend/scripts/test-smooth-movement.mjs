import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
mkdirSync(artifactDir, { recursive: true });
mkdirSync('test-results', { recursive: true });

async function runTest() {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // 1. Walk to the center in LOBBY mode (standing in the jail pad area at [0,0,0])
  console.log('Testing standing in center before match starts...');
  await page.locator('#enter').click();
  await page.waitForTimeout(500);

  // Press W to walk towards village center
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');

  // Press Esc to return to menu
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 2. Create room as Host
  console.log('Creating room as Host...');
  await page.locator('#player-name').fill('Trưởng Làng');
  await page.locator('#btn-create-room').click();
  await page.waitForSelector('#display-room-code');

  // Pick Robber role so player can move freely right away during HEAD_START!
  console.log('Selecting role: CƯỚP...');
  await page.locator('#btn-role-robber').click();
  await page.waitForTimeout(200);

  // Add 3 bots
  console.log('Adding 3 bots...');
  for (let i = 0; i < 3; i++) {
    await page.locator('#btn-add-bot').click();
    await page.waitForTimeout(200);
  }

  // Auto assign roles
  await page.locator('#btn-auto-roles').click();
  await page.waitForTimeout(300);

  // Explicitly ensure player is CƯỚP to test free movement right at start
  await page.locator('#btn-role-robber').click();
  await page.waitForTimeout(200);

  // Ready and Start match
  console.log('Starting match...');
  await page.locator('#btn-toggle-ready').click();
  await page.waitForTimeout(200);
  await page.locator('#btn-start-game').click();

  try {
    await page.waitForSelector('[data-jail="J1"]', { timeout: 3000 });
    await page.locator('[data-jail="J1"]').click();
  } catch {
    void 0;
  }

  // Wait for game phase (HEAD_START or PLAYING)
  console.log('Waiting for game phase...');
  await page.waitForFunction(() => {
    const phase = document.querySelector('#hud-phase')?.textContent;
    return phase === 'HEAD_START' || phase === 'PLAYING';
  }, { timeout: 20000 });

  // Enter 3D scene
  await page.locator('#enter').click();
  await page.waitForTimeout(1000);

  // Check how many remote player entities exist in session
  const entityCount = await page.evaluate(() => {
    return document.querySelectorAll('#roster-list li').length;
  });
  console.log('Roster count in game:', entityCount);

  // 3. Test Sprint and Jump
  console.log('Testing sprint and jump movement...');
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);

  // Jump while sprinting
  console.log('Jumping while sprinting...');
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);

  const shot2 = 'test-results/demo-12-smooth-jump-and-sprint.png';
  await page.screenshot({ path: shot2 });
  console.log('Saved jump & sprint screenshot:', shot2);

  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');

  // Wait for PLAYING phase to see bots active in village
  console.log('Waiting for PLAYING phase...');
  await page.waitForFunction(() => {
    const phase = document.querySelector('#hud-phase')?.textContent;
    return phase === 'PLAYING';
  }, { timeout: 25000 });

  await page.waitForTimeout(2000);

  // Turn camera towards village center (where bots gather or roam)
  // Robbers start at [-23, -15], village center is at [0, 0]
  // Let's walk towards the center to meet the bots
  console.log('Walking towards village center to observe bots...');
  await page.keyboard.down('KeyD'); // strafe towards center
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyS');

  // Rotate mouse to look around
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(200, 360);
  await page.mouse.up();
  await page.waitForTimeout(1000);

  // Capture screenshot: Bots visible in scene
  const shot1 = 'test-results/demo-11-bots-visible-in-scene.png';
  await page.screenshot({ path: shot1 });
  console.log('Saved bots visible screenshot:', shot1);

  // Copy screenshots to artifact directory
  for (const img of ['demo-11-bots-visible-in-scene.png', 'demo-12-smooth-jump-and-sprint.png']) {
    copyFileSync(`test-results/${img}`, resolve(artifactDir, img));
  }
  console.log('All screenshots copied to artifacts directory!');

  await browser.close();
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
