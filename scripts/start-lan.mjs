import { networkInterfaces } from 'node:os';
import { spawn, exec, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');

// Helper to kill processes holding a port on Windows
function freePort(port) {
  try {
    const stdout = execSync(`netstat -ano | findstr LISTENING | findstr ":${port}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(Number(pid)) && pid !== '0' && pid !== String(process.pid)) {
        try {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
        } catch {}
      }
    }
  } catch {}
}

// 1. Free ports 3001 (Backend) and 5173 (Frontend) if occupied by stale processes
freePort(3001);
freePort(5173);

// 2. Ensure shared and backend are built before running
const sharedDist = resolve(rootDir, 'packages/shared/dist/index.js');
const backendDist = resolve(rootDir, 'backend/apps/server/dist/index.js');

if (!existsSync(sharedDist) || !existsSync(backendDist)) {
  console.log('\x1b[33m⚡ Đang tự động build packages/shared và backend/apps/server trước khi khởi động...\x1b[0m');
  try {
    execSync('npm --prefix packages/shared run build && npm --prefix backend run build', {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    });
    console.log('\x1b[32m✔ Build hoàn tất!\x1b[0m\n');
  } catch (err) {
    console.error('\x1b[31m✖ Lỗi khi build Shared/Backend:\x1b[0m', err.message);
  }
}

function getLanIp() {
  const nets = networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ name, ip: net.address });
      }
    }
  }

  // Prioritize physical Wi-Fi / Ethernet interfaces (192.168.x or 10.x)
  const best =
    candidates.find((c) => /wi-fi|ethernet|wlan|eth/i.test(c.name) && c.ip.startsWith('192.168.')) ||
    candidates.find((c) => c.ip.startsWith('192.168.')) ||
    candidates.find((c) => c.ip.startsWith('10.')) ||
    candidates[0];

  return best ? best.ip : '127.0.0.1';
}

const lanIp = getLanIp();
const localUrl = 'http://localhost:5173';
const lanUrl = `http://${lanIp}:5173`;

console.clear?.();
console.log('\x1b[36m%s\x1b[0m', '=============================================================================');
console.log('\x1b[33m%s\x1b[0m', '               🎮  FOLK TAG 3D (ĐỒ CỨU) - LAN MULTIPLAYER  🎮');
console.log('\x1b[36m%s\x1b[0m', '=============================================================================');
console.log('');
console.log('\x1b[32m✔ Đang khởi động Backend Server (Port 3001) & Frontend WebGL (Port 5173)...\x1b[0m');
console.log('');
console.log('💻 \x1b[1mCHƠI TRÊN MÁY TÍNH NÀY:\x1b[0m');
console.log(`   👉 \x1b[34m${localUrl}\x1b[0m`);
console.log('');
console.log('📱 \x1b[1mCHO BẠN BÈ / ĐIỆN THOẠI CÙNG MẠNG WIFI (LAN):\x1b[0m');
console.log(`   👉 \x1b[32m\x1b[1m${lanUrl}\x1b[0m`);
console.log('');
console.log('\x1b[90m(Chỉ cần kết nối cùng Wi-Fi và mở link trên bằng Chrome, Edge hoặc Safari)\x1b[0m');

// Check if Edge has hardware acceleration disabled
try {
  const localStatePath = resolve(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/User Data/Local State');
  if (existsSync(localStatePath)) {
    const data = JSON.parse(readFileSync(localStatePath, 'utf8'));
    if (data.hardware_acceleration_mode?.enabled === false) {
      console.log('');
      console.log('\x1b[33m%s\x1b[0m', '⚠️  CHÚ Ý HIỆU NĂNG: Trình duyệt Edge đang TẮT tính năng Tăng tốc phần cứng (GPU)!');
      console.log('\x1b[33m%s\x1b[0m', '   Để tránh CPU 100% và chơi mượt 60 FPS: Hãy chạy BAT_TANG_TOC_GPU_EDGE.bat hoặc');
      console.log('\x1b[33m%s\x1b[0m', '   vào edge://settings/system -> Bật "Sử dụng tính năng tăng tốc đồ họa khi khả dụng".');
    }
  }
} catch {
  void 0;
}

console.log('');
console.log('\x1b[90mNhấn Ctrl + C để dừng máy chủ bất cứ lúc nào.\x1b[0m');
console.log('\x1b[36m%s\x1b[0m', '=============================================================================');
console.log('');

// 3. Start Backend Server (single string command to avoid Node 25 DEP0190)
const backend = spawn('npm --prefix backend/apps/server run dev', {
  cwd: rootDir,
  shell: true,
  stdio: 'inherit',
});

// 4. Start Frontend Vite Server with dev:lan (runs vite --host 0.0.0.0)
const frontend = spawn('npm --prefix frontend run dev:lan', {
  cwd: rootDir,
  shell: true,
  stdio: 'inherit',
});

// 5. Auto-open default browser after 3 seconds
setTimeout(() => {
  try {
    exec(`start "" "${localUrl}"`);
  } catch {}
}, 3000);

// 6. Clean exit handling (kill child process trees and ensure ports are freed)
let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n\x1b[33mĐang tắt máy chủ Folk Tag (Frontend & Backend)...\x1b[0m');

  if (backend.pid) {
    try { execSync(`taskkill /pid ${backend.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  }
  if (frontend.pid) {
    try { execSync(`taskkill /pid ${frontend.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  }

  freePort(3001);
  freePort(5173);

  setTimeout(() => process.exit(0), 400);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);
