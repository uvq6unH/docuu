import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { test, expect, type Page } from '@playwright/test';
import { CLIENT_EVENTS, PROTOCOL_VERSION, type AckResponse } from '../../../packages/shared/src/protocol';

async function ensureReady(client: Page) {
  const btn = client.locator('#btn-toggle-ready');
  await expect(btn).toBeVisible();
  const text = (await btn.innerText()).trim();
  if (text === 'Sẵn sàng') {
    await btn.click();
  }
}

test('two clients observe a player entering a house and leaving through its other door', async ({ page, browser }) => {
  test.setTimeout(120000);
  const guest = await browser.newPage();
  let observedZ: number | undefined;
  guest.on('websocket', socket => {
    socket.on('framereceived', ({ payload }) => {
      const packet = payload.toString();
      if (!packet.startsWith('42["game:snapshot",')) return;
      const [, snapshot] = JSON.parse(packet.slice(2));
      observedZ = snapshot.players.find((player: { role: string }) => player.role === 'POLICE')?.pos[2];
    });
  });
  try {
    await page.goto('/');
    await page.locator('#btn-create-room').click();
    await expect(page.locator('#display-room-code')).toHaveText(/^[A-Z2-9]{6}$/);
    const code = (await page.locator('#display-room-code').innerText()).trim();
    await guest.goto(page.url());
    await guest.locator('#join-room-code').fill(code);
    await guest.locator('#btn-join-room').click();
    for (const client of [page, guest]) await ensureReady(client);
    await page.locator('#btn-start-game').click();
    await page.locator('[data-jail="J1"]').click();
    await expect(page.locator('#hud-phase')).toHaveText('PLAYING', { timeout: 60000 });
    await page.bringToFront();
    await page.locator('#enter').click();
    await approach(page, 12, -19, .8);
    await approach(page, 12, -28, .5);
    await expect.poll(() => observedZ).toBeLessThan(-27);
    await page.screenshot({ path: 'test-results/house-interior.png' });
    await approach(page, 12, -34, .5);
    await expect.poll(() => observedZ).toBeLessThan(-33);
    await page.keyboard.press('Escape');
  } finally {
    await guest.close();
  }
});

test('robbers win after the full five minutes and both players can rematch', async ({ page, browser }) => {
  test.setTimeout(600000);
  const guest = await browser.newPage({ viewport: { width: 900, height: 650 } });
  try {
    await page.goto('/');
    await page.locator('#btn-create-room').click();
    await expect(page.locator('#display-room-code')).toHaveText(/^[A-Z2-9]{6}$/);
    const code = (await page.locator('#display-room-code').innerText()).trim();
    await guest.goto(page.url());
    await guest.locator('#join-room-code').fill(code);
    await guest.locator('#btn-join-room').click();
    for (const jail of ['J1', 'J3']) {
      for (const client of [page, guest]) {
        await expect(client.locator('#display-room-code')).toHaveText(code);
        await expect(client.locator('#match-result')).toBeHidden();
        await ensureReady(client);
      }
      await page.locator('#btn-start-game').click();
      await page.locator('[data-jail="' + jail + '"]').click();
      for (const client of [page, guest]) {
        await expect(client.locator('#hud-jail')).toHaveText(jail);
        await expect(client.locator('#hud-jailed-count')).toHaveText('0 / 1');
        await expect(client.locator('#hud-phase')).toHaveText('PLAYING', { timeout: 60000 });
      }
      if (jail === 'J3') break;
      await page.bringToFront();
      await page.locator('#enter').click();
      await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
      await expect(page.locator('#result-title')).toHaveText('Cướp thắng', { timeout: 480000 });
      for (const client of [page, guest]) {
        await expect(client.locator('#result-title')).toBeVisible();
        await expect(client.locator('#result-title')).toHaveText('Cướp thắng');
        await expect(client.locator('#result-reason')).toHaveText('Hết giờ, vẫn còn cướp tự do.');
        await expect(client.locator('#hud-overlay')).toBeHidden();
        await expect(client.locator('#action-prompt')).toBeHidden();
      }
      await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
      await expect(guest.locator('#result-wait')).toBeVisible();
      await page.screenshot({ path: 'test-results/timeout-host.png' });
      await guest.screenshot({ path: 'test-results/timeout-guest.png' });
      await page.locator('#btn-rematch').click();
    }
  } finally {
    await guest.close();
  }
});

// Follow a clear walking route with the regular keyboard/mouse listeners.
// Only the server can set a position or confirm the capture.
async function approach(page: Page, x: number, z: number, radius: number) {
  await page.evaluate(async ({ x, z, radius }) => {
    const debug = document.querySelector<HTMLOutputElement>('#debug')!;
    const start = performance.now();
    let walking = false;
    const walk = (on: boolean) => {
      if (on !== walking) window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: 'KeyW' }));
      walking = on;
    };
    try {
      while (performance.now() - start < 25000) {
        const dx = x - Number(debug.dataset.x), dz = z - Number(debug.dataset.z);
        const delta = Math.atan2(-dx, -dz) - Number(debug.dataset.yaw);
        const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
        if (Math.hypot(dx, dz) < radius && Math.abs(turn) < .28) return;
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: Math.round(-turn / .002) }));
        walk(Math.abs(turn) < .28 && Math.hypot(dx, dz) >= radius);
        // Position/yaw diagnostics refresh at 10Hz. Wait for the next sample
        // before steering again so delayed telemetry cannot amplify mouse turns.
        await new Promise(resolve => window.setTimeout(resolve, 120));
      }
      throw new Error('Did not reach waypoint: ' + debug.textContent);
    } finally { walk(false); }
  }, { x, z, radius });
}

test('jailed player resumes after reload and a teammate rescues them in a six-player room', async ({ page, browser }) => {
  test.setTimeout(300000);
  const peers: Socket[] = [];
  const robber = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const rescuer = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const hash = createHash('sha256').update(readFileSync('../packages/shared/maps/village-v1.json')).digest('hex');
  let interruptTransport: (() => Promise<void>) | undefined;
  await robber.routeWebSocket(/socket\.io/, client => {
    const upstream = client.connectToServer();
    interruptTransport = async () => {
      await Promise.all([
        client.close({ code: 1001, reason: 'Network test' }),
        upstream.close({ code: 1001, reason: 'Network test' }),
      ]);
    };
  });
  async function addPeer(code: string) {
    const socket = io('http://127.0.0.1:3017', { forceNew: true });
    peers.push(socket);
    const join: AckResponse = await socket.timeout(5000).emitWithAck(CLIENT_EVENTS.ROOM_JOIN,
      { name: 'Peer' + peers.length, roomCode: code, protocolVersion: PROTOCOL_VERSION, requestId: crypto.randomUUID() });
    expect(join.ok).toBe(true);
    const ready: AckResponse = await socket.timeout(5000).emitWithAck(CLIENT_EVENTS.ROOM_READY,
      { ready: true, mapHash: hash, requestId: crypto.randomUUID() });
    expect(ready.ok).toBe(true);
  }
  try {
    await page.setViewportSize({ width: 900, height: 650 });
    await page.goto('/');
    await expect(page.locator('#menu-view')).toBeVisible();
    await page.locator('#btn-create-room').click();
    await expect(page.locator('#display-room-code')).toHaveText(/^[A-Z2-9]{6}$/);
    const code = (await page.locator('#display-room-code').textContent())!;
    await addPeer(code);
    await robber.goto(page.url());
    await robber.locator('#join-room-code').waitFor({ state: 'visible' });
    await robber.locator('#join-room-code').fill(code);
    await expect(robber.locator('#join-room-code')).toHaveValue(code);
    await robber.locator('#btn-join-room').click();
    await expect(robber.locator('#display-room-code')).toHaveText(code, { timeout: 15000 });
    await ensureReady(robber);
    await rescuer.goto(page.url());
    await rescuer.locator('#join-room-code').waitFor({ state: 'visible' });
    await rescuer.locator('#join-room-code').fill(code);
    await expect(rescuer.locator('#join-room-code')).toHaveValue(code);
    await rescuer.locator('#btn-join-room').click();
    await expect(rescuer.locator('#display-room-code')).toHaveText(code, { timeout: 15000 });
    await ensureReady(rescuer);
    for (let i = 0; i < 2; i++) await addPeer(code);
    await page.bringToFront();
    await ensureReady(page);
    await expect(page.locator('#btn-start-game')).toBeEnabled();
    await page.locator('#btn-start-game').click();
    await page.locator('[data-jail="J1"]').click();
    await expect(page.locator('#hud-phase')).toHaveText('PLAYING', { timeout: 60000 });
    await expect(robber.locator('#hud-role')).toHaveText('CƯỚP');
    await page.bringToFront();
    await page.locator('#enter').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
    await approach(page, -5, -13, .8);
    await approach(page, -23, -12, .8);
    await approach(page, -23, 0, 1.1);
    await expect(page.locator('#action-prompt')).toContainText('BẮT CƯỚP');
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('#hud-jailed-count')).toHaveText('1 / 4');
    await expect(robber.locator('#hud-action')).toContainText('Bạn đang bị giam');
    await expect(robber.locator('#debug')).toHaveAttribute('data-x', '-0.800');
    await expect(robber.locator('#debug')).toHaveAttribute('data-z', '-0.8');
    await robber.bringToFront();
    await robber.locator('#enter').click();
    await expect.poll(async () => Number(await robber.locator('#debug').getAttribute('data-ack'))).toBeGreaterThan(2);
    const readSession = () => robber.evaluate(() => JSON.parse(sessionStorage.getItem('folk_tag_room_v1') ?? 'null'));
    const before = await readSession();
    await robber.reload();
    await expect(robber.locator('#hud-action')).toContainText('Bạn đang bị giam');
    await expect(robber.locator('#display-room-code')).toHaveText(code);
    await expect(robber.locator('#debug')).toHaveAttribute('data-x', '-0.800');
    await expect(robber.locator('#debug')).toHaveAttribute('data-z', '-0.8');
    await expect.poll(async () => {
      const after = await readSession();
      return after?.playerId === before.playerId && after.resumeToken !== before.resumeToken;
    }).toBe(true);
    const afterReload = await readSession();
    await expect.poll(() => Boolean(interruptTransport)).toBe(true);
    await interruptTransport!();
    await expect.poll(async () => {
      const after = await readSession();
      return after?.playerId === before.playerId && after.resumeToken !== afterReload.resumeToken;
    }, { timeout: 20000 }).toBe(true);
    await expect(robber.locator('#hud-action')).toContainText('Bạn đang bị giam');
    const ack = Number(await robber.locator('#debug').getAttribute('data-ack'));
    await robber.locator('#enter').click();
    await expect.poll(async () => Number(await robber.locator('#debug').getAttribute('data-ack'))).toBeGreaterThan(ack);
    await robber.keyboard.press('Escape');

    await rescuer.bringToFront();
    await rescuer.locator('#enter').click();
    await approach(rescuer, 23, 3, .7);
    await approach(rescuer, 3, 3, .7);
    await approach(rescuer, 2.7, 0, .55);
    await approach(rescuer, 0, 0, 4);
    await expect(rescuer.locator('#action-prompt')).toBeVisible();
    await expect(rescuer.locator('#action-prompt')).toContainText('CỨU ĐỒNG ĐỘI');
    await rescuer.evaluate(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      const start = performance.now();
      const countEl = document.querySelector('#hud-jailed-count');
      while (performance.now() - start < 25000) {
        if (countEl && countEl.textContent?.includes('0 / 4')) break;
        await new Promise(r => setTimeout(r, 50));
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
    });
    await robber.bringToFront();
    await expect(robber.locator('#hud-jailed-count')).toHaveText('0 / 4', { timeout: 15000 });
    await expect(robber.locator('#hud-immune-card')).toBeVisible();
    await expect(robber.locator('#hud-action')).not.toContainText('bị giam');
    await expect(robber.locator('#debug')).toHaveAttribute('data-x', '3.500');
    await expect(robber.locator('#debug')).toHaveAttribute('data-z', '0');
    await expect(robber.locator('#hud-immune-card')).toBeHidden({ timeout: 5000 });
    await robber.locator('#btn-leave-room').click();
    await expect(robber.locator('#menu-view')).toBeVisible();
    expect(await readSession()).toBeNull();
  } finally {
    await rescuer.close();
    for (const socket of peers) socket.disconnect();
    await robber.close();
  }
});

test('expired room credentials return the player to the menu', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('folk_tag_room_v1', JSON.stringify({
    roomCode: 'ZZZZZZ', playerId: 'expired-player', resumeToken: 'expired-session',
  })));
  await page.reload();
  await expect(page.locator('#status')).toContainText('Phiên phòng không còn khả dụng');
  await expect(page.locator('#btn-create-room')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('folk_tag_room_v1') === null)).toBe(true);
});

test('two players finish by capture and start another match in the same room', async ({ page, browser }) => {
  test.setTimeout(180000);
  const guest = await browser.newPage({ viewport: { width: 900, height: 650 } });
  try {
    await page.goto('/');
    await page.locator('#btn-create-room').click();
    const codeLabel = page.locator('#display-room-code');
    await expect(codeLabel).toHaveText(/^[A-Z2-9]{6}$/);
    const code = (await codeLabel.innerText()).trim();
    await guest.goto(page.url());
    await guest.locator('#join-room-code').fill(code);
    await guest.locator('#btn-join-room').click();
    for (const jail of ['J1', 'J2']) {
      for (const client of [page, guest]) {
        await expect(client.locator('#display-room-code')).toHaveText(code);
        await expect(client.locator('#roster-list li')).toHaveCount(2);
        await expect(client.locator('#match-result')).toBeHidden();
        await ensureReady(client);
      }
      await page.locator('#btn-start-game').click();
      await page.locator('[data-jail="' + jail + '"]').click();
      for (const client of [page, guest]) {
        await expect(client.locator('#hud-jail')).toHaveText(jail);
        await expect(client.locator('#hud-jailed-count')).toHaveText('0 / 1');
        await expect(client.locator('#hud-immune-card')).toBeHidden();
        await expect(client.locator('#rescue-bar-container')).toBeHidden();
        await expect(client.locator('#hud-phase')).toHaveText('PLAYING', { timeout: 60000 });
      }
      if (jail === 'J2') break;
      await page.bringToFront();
      await page.locator('#enter').click();
      await approach(page, -5, -13, .8);
      await approach(page, -23, -12, .8);
      await approach(page, -23, 0, 1.1);
      await expect(page.locator('#action-prompt')).toContainText('BẮT CƯỚP');
      await page.screenshot({ path: 'test-results/police-capturing-robber.png' });
      await guest.screenshot({ path: 'test-results/robber-view-of-police.png' });
      try {
        const { copyFileSync } = await import('node:fs');
        const artifactDir = 'C:\\Users\\v3411179\\.gemini\\antigravity\\brain\\56aa1232-d0ed-43f3-820f-33729688864e';
        copyFileSync('test-results/police-capturing-robber.png', artifactDir + '\\police-capturing-robber.png');
        copyFileSync('test-results/robber-view-of-police.png', artifactDir + '\\robber-view-of-police.png');
      } catch {
        void 0;
      }
      await page.mouse.down();
      await page.mouse.up();
      for (const client of [page, guest]) {
        await expect(client.locator('#result-title')).toBeVisible();
        await expect(client.locator('#result-title')).toHaveText('Cảnh sát thắng');
        await expect(client.locator('#result-reason')).toHaveText('Toàn bộ cướp đã bị bắt.');
        await expect(client.locator('#action-prompt')).toBeHidden();
        await expect(client.locator('#hud-overlay')).toBeHidden();
      }
      await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
      await expect(guest.locator('#result-wait')).toBeVisible();
      await expect(guest.locator('#btn-rematch')).toBeHidden();
      await page.locator('#btn-rematch').click();
    }
  } finally {
    await guest.close();
  }
});
