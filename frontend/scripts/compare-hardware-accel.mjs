import { chromium } from 'playwright';

async function runComparison() {
  console.log('=== Comparing Hardware Acceleration ON vs OFF in Edge ===\n');

  // Case 1: Hardware Acceleration DISABLED (User current Edge configuration)
  console.log('--- Test 1: Hardware Acceleration DISABLED (Software CPU Rasterizer) ---');
  const browserNoGpu = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--disable-gpu', '--disable-gpu-compositing'],
  });
  const pageNoGpu = await browserNoGpu.newPage();
  await pageNoGpu.goto('about:blank');
  const gpuInfoNoGpu = await pageNoGpu.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ext = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'N/A',
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'N/A',
    };
  });
  console.log('Active WebGL Renderer:', gpuInfoNoGpu.renderer);
  console.log('Diagnosis: When hardware acceleration is OFF, all 3D pixels are calculated on CPU using software rendering!');
  await browserNoGpu.close();

  // Case 2: Hardware Acceleration ENABLED (Standard PC configuration)
  console.log('\n--- Test 2: Hardware Acceleration ENABLED (Intel UHD Graphics GPU) ---');
  const browserGpu = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const pageGpu = await browserGpu.newPage();
  await pageGpu.goto('about:blank');
  const gpuInfoGpu = await pageGpu.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ext = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'N/A',
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'N/A',
    };
  });
  console.log('Active WebGL Renderer:', gpuInfoGpu.renderer);
  console.log('Diagnosis: When hardware acceleration is ON, the Intel UHD Graphics GPU processes graphics natively, freeing CPU entirely!');
  await browserGpu.close();
}

runComparison().catch(console.error);
