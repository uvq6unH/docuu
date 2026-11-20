import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { test, expect, type Page } from '@playwright/test';
import { CLIENT_EVENTS, PROTOCOL_VERSION, type AckResponse } from '../../../packages/shared/src/protocol';

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
        await new Promise(requestAnimationFrame);
      }
      throw new Error('Did not reach waypoint: ' + debug.textContent);
    } finally { walk(false); }
  }, { x, z, radius });
}

test('jailed player resumes after reload and a teammate rescues them in a six-player room', async ({ page, browser }) => {
  test.setTimeout(210000);
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
    await robber.goto('http://127.0.0.1:5175');
    await robber.locator('#join-room-code').fill(code);
    await robber.locator('#btn-join-room').click();
    await robber.locator('#btn-toggle-ready').click();
    await rescuer.goto('http://127.0.0.1:5175');
    await rescuer.locator('#join-room-code').fill(code);
    await rescuer.locator('#btn-join-room').click();
    await rescuer.locator('#btn-toggle-ready').click();
    for (let i = 0; i < 2; i++) await addPeer(code);
    await page.bringToFront();
    await page.locator('#btn-toggle-ready').click();
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
    await rescuer.keyboard.down('e');
    await expect(robber.locator('#hud-jailed-count')).toHaveText('0 / 4', { timeout: 12000 });
    await expect(robber.locator('#hud-immune-card')).toBeVisible();
    await expect(robber.locator('#hud-action')).not.toContainText('bị giam');
    await expect(robber.locator('#debug')).toHaveAttribute('data-x', '3.500');
    await expect(robber.locator('#debug')).toHaveAttribute('data-z', '0');
    await rescuer.keyboard.up('e');
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
