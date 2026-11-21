import { chromium } from 'playwright';

async function measureFps() {
  console.log('=== Empirical FPS & Rendering Measurement ===');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://127.0.0.1:5173/?backend=mock', { waitUntil: 'networkidle' });

  // Enter 3D scene directly via Offline / Mock
  await page.locator('#enter').click();
  await page.waitForTimeout(500);

  // Mock pointerlock to activate full playing mode
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    Object.defineProperty(document, 'pointerLockElement', { value: canvas, writable: true, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  await page.waitForTimeout(500);

  // Measure 120 consecutive frames in gameplay mode
  const metrics = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const debugInfo = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    const gpuRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';

    const renderer = window.__THREE_RENDERER__;
    const calls = renderer ? renderer.info.render.calls : 0;
    const triangles = renderer ? renderer.info.render.triangles : 0;
    const geometries = renderer ? renderer.info.memory.geometries : 0;
    const textures = renderer ? renderer.info.memory.textures : 0;

    const frameTimes = [];
    let last = performance.now();
    let count = 0;

    await new Promise((resolve) => {
      function onFrame(now) {
        const delta = now - last;
        last = now;
        if (count > 0) frameTimes.push(delta); // discard first frame jitter
        count++;
        if (count >= 120) resolve();
        else requestAnimationFrame(onFrame);
      }
      requestAnimationFrame(onFrame);
    });

    const sum = frameTimes.reduce((a, b) => a + b, 0);
    const avgDelta = sum / frameTimes.length;
    const fps = 1000 / avgDelta;
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return {
      gpuRenderer,
      fps: Math.round(fps * 10) / 10,
      avgFrameMs: Math.round(avgDelta * 100) / 100,
      minFrameMs: Math.round(min * 100) / 100,
      maxFrameMs: Math.round(max * 100) / 100,
      p95FrameMs: Math.round(p95 * 100) / 100,
      p99FrameMs: Math.round(p99 * 100) / 100,
      drawCalls: calls,
      triangles,
      geometries,
      textures,
    };
  });

  console.log('Results:');
  console.log(`- Active GPU Renderer: ${metrics.gpuRenderer}`);
  console.log(`- Measured Average FPS: ${metrics.fps} FPS`);
  console.log(`- Frame Delta (Average): ${metrics.avgFrameMs} ms (Target: <= 16.67 ms)`);
  console.log(`- Frame Delta (Min/Max): ${metrics.minFrameMs} ms / ${metrics.maxFrameMs} ms`);
  console.log(`- P95 Frame Time: ${metrics.p95FrameMs} ms`);
  console.log(`- P99 Frame Time: ${metrics.p99FrameMs} ms`);
  console.log(`- Draw Calls per Frame: ${metrics.drawCalls}`);
  console.log(`- Rendered Triangles: ${metrics.triangles.toLocaleString('en-US')}`);
  console.log(`- Geometries: ${metrics.geometries}, Textures: ${metrics.textures}`);

  await browser.close();
}

measureFps().catch(console.error);
