import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Snapshot } from '../../../packages/shared/src/protocol';

test('two browsers receive the room and observe server-confirmed player movement', async ({ page, browser, request }) => {
  expect(await (await request.get('/healthz')).json()).toMatchObject({ status: 'ok' });
  await page.goto('/');
  await page.locator('#btn-mock-mode').click();
  await expect(page.locator('#hud-role')).toHaveText('CẢNH SÁT');
  const room = page.locator('.room-details');
  await room.locator('summary').click();
  await expect(room.getByRole('listitem')).toHaveCount(6);
  await expect(room.getByRole('listitem').first()).toContainText('POLICE-1 · Cảnh sát · Chủ phòng · Sẵn sàng');
  await expect(room).toContainText('Server đang dùng hash thử nghiệm');
  const hash = createHash('sha256').update(readFileSync('../packages/shared/maps/village-v1.json')).digest('hex');
  await expect(room.locator('code')).toHaveText(hash);
  await room.locator('summary').click();
  const observer = await browser.newPage();
  let remotePos: Snapshot['self']['pos'] | undefined;
  observer.on('websocket', ws => {
    ws.on('framereceived', ({ payload }) => {
      const packet = payload.toString();
      if (!packet.startsWith('42["game:snapshot",')) return;
      const [, snapshot] = JSON.parse(packet.slice(2)) as [string, Snapshot];
      remotePos = snapshot.players.find(p => p.id === 'police-1')?.pos;
    });
  });
  await observer.goto('http://127.0.0.1:5175');
  await observer.locator('#btn-mock-mode').click();
  await expect(observer.locator('#hud-role')).toHaveText('CƯỚP');
  await expect.poll(() => remotePos).toBeDefined();
  await page.bringToFront();
  await page.locator('#enter').click();
  const start = remotePos!;
  // Any yaw is possible when attaching to a patrolling bot. Align the
  // assertion to the actual displacement over the two-dimensional plane.
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await page.locator('#debug').getAttribute('data-ack'))).toBeGreaterThan(2);
  await expect.poll(() => Math.hypot(remotePos![0] - start[0], remotePos![2] - start[2])).toBeGreaterThan(.05);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await observer.close();
  await page.locator('#btn-leave-room').click();
  await expect(page.locator('#menu-view')).toBeVisible();
});

test('two browsers observe capture: police clicks in range, robber teleports to jail J1 and jailedCount becomes 1', async ({ page, browser }) => {
  await page.goto('/?backend=mock');
  await expect(page.locator('.scene-label')).toContainText('police-1');

  const robberBrowser = await browser.newPage();
  let robberSelfPos: Snapshot['self']['pos'] | undefined;
  let robberSelfState: string | undefined;
  let observerJailedCount = 0;

  robberBrowser.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      const packet = payload.toString();
      if (!packet.startsWith('42["game:snapshot",')) return;
      const [, snapshot] = JSON.parse(packet.slice(2)) as [string, Snapshot];
      robberSelfPos = snapshot.self.pos;
      robberSelfState = snapshot.self.state;
      observerJailedCount = snapshot.jailedCount;
    });
  });

  await robberBrowser.goto('http://127.0.0.1:5175/?backend=mock&spawn=near');
  await expect(robberBrowser.locator('.scene-label')).toContainText('robber-1');

  await expect.poll(() => robberSelfPos).toBeDefined();
  await expect.poll(() => observerJailedCount).toBe(0);

  // Police enters and clicks left mouse to capture robber
  await page.bringToFront();
  await page.locator('#enter').click();
  await expect(page.locator('#status')).toContainText('Chuột đã khóa');

  const canvas = page.locator('canvas');
  await canvas.dispatchEvent('mousedown', { button: 0 });

  // Both browsers observe robber in jail J1 slot 0 [-0.8, 0, -0.8] and jailedCount = 1
  await expect.poll(() => observerJailedCount).toBe(1);
  await expect.poll(() => robberSelfState).toBe('JAILED');
  await expect.poll(() => robberSelfPos && Math.hypot(robberSelfPos[0] - (-0.8), robberSelfPos[2] - (-0.8))).toBeLessThan(0.01);

  await page.keyboard.press('Escape');
  await robberBrowser.close();
});
