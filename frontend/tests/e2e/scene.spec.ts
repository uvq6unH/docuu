import { expect, test } from '@playwright/test';

test('F04 renders a real WebGL canvas, resizes, and has no browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Vào sân tập' })).toBeEnabled();
  await expect(page.locator('#status')).toContainText('Sẵn sàng');
  const canvas = page.locator('#viewport canvas');
  await expect(canvas).toHaveCount(1);
  expect(await canvas.evaluate((element) => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThanOrEqual(1440);
  await page.screenshot({ path: 'test-results/scene-desktop.png' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBe(1024);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).height)).toBe(768);
  await page.screenshot({ path: 'test-results/scene-compact.png' });
  expect(errors).toEqual([]);
});

test('F05 locks the real mouse, samples WASD, changes view and clears on Escape', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('Sẵn sàng');
  await page.getByRole('button', { name: 'Vào sân tập' }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await page.keyboard.down('w');
  await expect(page.locator('#debug')).toContainText('Input X/Z 0/1');
  await page.keyboard.down('e');
  await expect(page.locator('#debug')).toContainText('E 1');
  await page.mouse.move(700, 350);
  await page.mouse.move(800, 400);
  await expect(page.locator('#debug')).not.toContainText('Yaw 0.00 · Pitch 0.00');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.locator('#debug')).toContainText('Input X/Z 0/0');
  await expect(page.locator('#debug')).toContainText('E 0');
  await page.keyboard.up('w'); await page.keyboard.up('e');
  await expect(page.getByRole('button', { name: 'Vào sân tập' })).toBeFocused();
});

test('reviews all village viewpoints and obstacle outlines', async ({ page }) => {
  await page.goto('/');
  const view = page.getByLabel('Góc nhìn');
  for (const point of ['overview', 'J1', 'J2', 'J3', 'yard']) {
    await view.selectOption(point);
    await expect(view).toHaveValue(point);
    const guide = page.getByText('Vòng xanh: điểm cứu', { exact: false });
    if (point.startsWith('J')) await expect(guide).toBeVisible();
    else await expect(guide).toBeHidden();
    if (point === 'J2') await page.screenshot({ path: 'test-results/jail-survey.png' });
  }
  await view.selectOption('overview');
  await page.getByLabel('Khung vật cản dự kiến').check();
  await page.screenshot({ path: 'test-results/village-overview.png' });
});


test('selects a rescue route, shows its length and returns to the yard', async ({ page }) => {
  await page.goto('/');
  const view = page.getByLabel('Góc nhìn');
  await view.selectOption('J2');
  const route = page.getByRole('combobox', { name: /Tuyến cứu/ });
  await route.selectOption('0/-1');
  await expect(route.locator('..')).toContainText(/\d m/);
  await route.selectOption('3/1');
  await expect(route.locator('..')).toContainText(/\d m/);
  await page.screenshot({ path: 'test-results/rescue-route.png' });
  await view.selectOption('yard');
  await expect(route).toHaveCount(0);
});

test('loads, rejects and clears local collider overlays', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Đối chiếu vật cản từ JSON');
  const load = (contents: string) => input.setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
  const valid = '{"colliders":[{"id":"a","center":[0,2,0],"size":[4,4,4]}]}';
  await load(valid);
  await expect(page.getByText(/review.json · 1 khung/)).toBeVisible();
  await page.getByText(/Tọa độ so với village-v1/).click();
  await expect(page.getByText('Thiếu danh sách nhà giam')).toBeVisible();
  await load('{');
  await expect(page.getByText(/Tọa độ so với village-v1/)).toHaveCount(0);
  await expect(page.getByText('Không đọc được cú pháp JSON.')).toBeVisible();
  await load(valid);
  await page.getByRole('button', { name: 'Gỡ lớp đối chiếu' }).click();
  await expect(page.getByText(/review.json · 1 khung/)).toHaveCount(0);
});

test('compares all routes and restores the selected v0 route on removal', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Góc nhìn').selectOption('J1');
  await page.getByRole('combobox', { name: /Tuyến cứu/ }).selectOption('0/-1');
  const wall = { id: 'wall', center: [0, 2, 0], size: [80, 4, 80] };
  await page.getByLabel('Đối chiếu vật cản từ JSON').setInputFiles({
    name: 'wall.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({colliders: [wall]})),
  });
  await expect(page.getByText('24 tuyến · 24 bị chặn · 0 đổi độ dài')).toBeVisible();
  await expect(page.getByText(/Chưa tìm thấy đường/)).toBeVisible();
  await page.getByRole('button', {name: 'Gỡ lớp đối chiếu'}).click();
  await expect(page.getByRole('combobox', {name: /Tuyến cứu/}).locator('..')).toContainText(/\d m/);
});


test('uses imported endpoints for the selected route', async ({ page }) => {
  await page.goto('/');
  const map = {
    size:[80,80], colliders:[], spawns:{robber:Array(4).fill([-10.2,0,1.1])},
    jails:['J1','J2','J3'].map(id => ({id, center:[1.1,0,1.1], size:[4,4], guardRadius:4,
      rescueAnchors:[[3.6,0,1.1],[-1.4,0,1.1]]})),
  };
  await page.getByLabel('Đối chiếu vật cản từ JSON').setInputFiles({
    name:'moved.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(map)),
  });
  await page.getByLabel('Góc nhìn').selectOption('J1');
  const route = page.getByRole('combobox',{ name:/Tuyến cứu/ });
  await route.selectOption('0/-1');
  await expect(route.locator('..')).toContainText('8,8 m');
  await expect(page.getByText(/Vòng xanh: điểm cứu/)).toContainText('vùng canh 4 m');
  await expect(page.getByText(/Vòng xanh: điểm cứu/)).not.toContainText('điểm thả');
  await page.getByRole('button', { name: 'Gỡ lớp đối chiếu' }).click();
  await expect(page.getByText(/Vòng xanh: điểm cứu/)).toContainText('vùng canh 5 m');
});



test('M03 walks and sprints from spawn, crouches, jumps and lands', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('Sẵn sàng');
  await page.getByRole('button', { name: 'Vào sân tập' }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  const debug = page.locator('#debug');
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await debug.getAttribute('data-x'))).toBeGreaterThan(-22);
  await expect(page.locator('#stamina')).not.toHaveText('Thể lực 100/100');
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.keyboard.down('c');
  await expect(debug).toHaveAttribute('data-eye', '0.950');
  await page.keyboard.up('c');
  await expect(debug).toHaveAttribute('data-eye', '1.550');
  await page.keyboard.press('Space');
  await expect(debug).toHaveAttribute('data-grounded', 'false');
  await expect(debug).toHaveAttribute('data-grounded', 'true');
  await expect(debug).toHaveAttribute('data-eye', '1.550');
});

test('M03 bounds a burst of mouse movement in a locked Chrome frame', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Vào sân tập' }).click();
  await expect(page.locator('#debug')).toContainText('Yaw -1.57');
  const debug = page.locator('#debug');
  const yaw = async () => Number((await debug.textContent())?.match(/Yaw ([-\d.]+)/)?.[1]);
  const before = await yaw();
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 800, movementY: 0 }));
    }
  });
  await expect.poll(yaw).toBeLessThan(before);
  expect(before - await yaw()).toBeLessThan(0.36);
  await page.keyboard.press('Escape');
  await expect(page.locator('#enter')).toBeFocused();
});

test('A01 and A02 load all nine village models into the WebGL scene', async ({ page }) => {
  const loaded = new Set<string>();
  const issues: string[] = [];
  page.on('response', response => {
    if (response.ok() && response.url().endsWith('.glb')) loaded.add(new URL(response.url()).pathname);
  });
  page.on('pageerror', error => issues.push(error.message));
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('Giữ mẫu graybox')) issues.push(msg.text());
  });
  await page.goto('/');
  await expect(page.locator('#viewport')).toHaveAttribute('aria-busy', 'false');
  expect([...loaded].sort()).toEqual(['bush','fence_segment','haystack','house_a','house_b','house_c','jail','tree_a','tree_b'].map(n => '/models/' + n + '.glb'));
  await page.getByLabel('Góc nhìn').selectOption('overview');
  await page.screenshot({ path: 'test-results/a01-village.png' });
  await page.getByLabel('Góc nhìn').selectOption('J2');
  await page.screenshot({ path: 'test-results/a02-jail.png' });
  expect(issues).toEqual([]);
});
