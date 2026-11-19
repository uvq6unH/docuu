import { expect, test } from '@playwright/test';
import type { Snapshot } from '../../../backend/packages/shared/src/protocol';

test('two browsers receive the room and observe server-confirmed player movement', async ({ page, browser, request }) => {
  expect(await (await request.get('/healthz')).json()).toMatchObject({ status: 'ok' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Kết nối backend thử nghiệm' }).click();
  await expect(page.locator('.scene-label')).toContainText('police-1 · 6 nhân vật');
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
  await observer.goto('http://127.0.0.1:5175/?backend=mock');
  await expect(observer.locator('.scene-label')).toContainText('robber-1 · 6 nhân vật');
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
  await page.getByRole('link', { name: 'Về sân offline' }).click();
  await expect(page.locator('.scene-label')).toContainText('Offline');
});
