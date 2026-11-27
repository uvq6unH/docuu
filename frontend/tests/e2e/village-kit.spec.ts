import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import type { WebGLRenderer } from 'three';
const manifest = JSON.parse(readFileSync('vietnam-village-kit/manifest.json', 'utf8'));

test('village kit loads all 35 GLBs and presents desktop and mobile menus', async ({ page, browser }) => {
  const loaded = new Set<string>(), errors: string[] = [];
  page.on('response', response => {
    if (response.ok() && response.url().endsWith('.glb')) loaded.add(new URL(response.url()).pathname.split('/').pop()!);
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#viewport')).toHaveAttribute('aria-busy', 'false');
  expect(await page.locator('#viewport').getAttribute('data-asset-error')).toBeNull();
  expect([...loaded].sort()).toEqual(Object.keys(manifest).map(asset => asset + '.glb').sort());
  await page.screenshot({ path: 'test-results/village-kit-desktop.png' });
  await page.locator('#survey-view').selectOption('overview');
  await page.screenshot({ path: 'test-results/vietnam-village-overview.png',
    style: '.panel, .masthead, .hud-corner-bl, .hud-corner-br { display: none !important; }' });
  await page.locator('#survey-view').selectOption('yard');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(page.url());
  await expect(mobile.locator('#viewport')).toHaveAttribute('aria-busy', 'false');
  await expect(mobile.locator('#btn-create-room')).toBeVisible();
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mobile.screenshot({ path: 'test-results/village-kit-mobile.png' });
  await mobileContext.close();
  await page.locator('#enter').click();
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true);
  await page.waitForTimeout(2000);
  const measurement = await page.evaluate(async () => {
    const renderer = (window as Window & { __THREE_RENDERER__?: WebGLRenderer }).__THREE_RENDERER__;
    if (!renderer) throw new Error('Development renderer diagnostics unavailable');
    const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : 'WebGL';
    const firstFrame = renderer.info.render.frame, start = performance.now();
    const samples: number[] = [];
    let before = performance.now();
    for (let count = 0; count < 120; count++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      samples.push(now - before);
      before = now;
    }
    return { browser: navigator.userAgent, gpu, viewport: [innerWidth, innerHeight],
      elapsedMs: performance.now() - start, renderedFrames: renderer.info.render.frame - firstFrame,
      renderedFps: (renderer.info.render.frame - firstFrame) * 1000 / (performance.now() - start),
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      averageFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length,
      p95FrameMs: [...samples].sort((a, b) => a - b)[Math.floor(samples.length * .95)] };
  });
  writeFileSync('test-results/village-kit-frame-sample.json', JSON.stringify(measurement, null, 2));
  await page.screenshot({ path: 'test-results/village-kit-fps-view.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#resume-village')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile enters a furnished house, opens and closes its door and resumes after pause', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:5174');
    await expect(page.locator('#viewport')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#enter').tap();
    await expect(page.locator('body')).toHaveClass(/looking/);
    await expect(page.locator('#touch-controls')).toBeVisible();
    const joystick = (await page.locator('#touch-joystick-zone').boundingBox())!;
    const initialX = Number(await page.locator('#debug').getAttribute('data-x'));
    const cdp = await context.newCDPSession(page);
    const x = joystick.x + joystick.width / 2, y = joystick.y + joystick.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 35 }] });
    await expect.poll(async () => Number(await page.locator('#debug').getAttribute('data-x'))).toBeGreaterThan(initialX + .3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Use the same keyboard/look listeners as desktop; the door itself is tapped.
    const walk = async (x: number, z: number) => {
      await page.evaluate(async ({ x, z }) => {
        const output = document.querySelector<HTMLOutputElement>('#debug')!;
        const start = performance.now();
        try {
          while (performance.now() - start < 15000) {
            const dx = x - Number(output.dataset.x), dz = z - Number(output.dataset.z);
            if (Math.hypot(dx, dz) < .22) return;
            const delta = Math.atan2(-dx, -dz) - Number(output.dataset.yaw);
            const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
            document.dispatchEvent(new MouseEvent('mousemove', { movementX: -turn / .002 }));
            window.dispatchEvent(new KeyboardEvent(Math.abs(turn) < .25 ? 'keydown' : 'keyup', { code: 'KeyW' }));
            await new Promise(resolve => setTimeout(resolve, 120));
          }
          throw new Error('House waypoint blocked: ' + output.textContent);
        } finally { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); }
      }, { x, z });
    };
    await walk(-29, 2.5);
    await walk(-24.9, 6);
    await page.evaluate(async () => {
      const debug = document.querySelector<HTMLOutputElement>('#debug')!;
      for (let count = 0; count < 10; count++) {
        const desired = Math.atan2(Number(debug.dataset.x) + 22, Number(debug.dataset.z) - .48);
        const delta = desired - Number(debug.dataset.yaw);
        const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
        if (Math.abs(turn) < .02) break;
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: -turn / .002 }));
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      document.dispatchEvent(new MouseEvent('mousemove', { movementY: -125 }));
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/vietnam-village-house-facade.png',
      style: '#touch-controls, #village-pause, #hud-corner-bl, #hud-corner-br, #crosshair { display: none !important; }' });
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementY: 125 })));
    await walk(-22, 2.5);
    await walk(-22, 1.1);
    await expect(page.locator('#door-interaction')).toContainText('Mở');
    await page.locator('#door-interaction').tap();
    await expect(page.locator('#door-interaction')).toContainText('Đóng');
    await page.waitForTimeout(450);
    await walk(-22, -1.1);
    await page.screenshot({ path: 'test-results/village-kit-house-mobile.png' });
    await walk(-22, 1.1);
    await page.locator('#door-interaction').tap();
    await expect(page.locator('#door-interaction')).toContainText('Mở');
    await page.locator('#village-pause').tap();
    await expect(page.locator('#resume-village')).toBeVisible();
    await page.locator('#resume-village').tap();
    await expect(page.locator('body')).toHaveClass(/looking/);
  } finally { await context.close(); }
});
