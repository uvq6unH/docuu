import { networkInterfaces } from 'node:os';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');

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

  // Prioritize physical Wi-Fi / Ethernet interfaces
  const best =
    candidates.find((c) => /wi-fi|ethernet|wlan|eth/i.test(c.name) && c.ip.startsWith('192.168.')) ||
    candidates.find((c) => c.ip.startsWith('192.168.') || c.ip.startsWith('10.')) ||
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
console.log('\x1b[90m(Chỉ cần kết nối cùng Wi-Fi và dán link trên vào trình duyệt Chrome/Edge/Safari)\x1b[0m');

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

console.log('\x1b[90mNhấn Ctrl + C để dừng máy chủ bất cứ lúc nào.\x1b[0m');
console.log('\x1b[36m%s\x1b[0m', '=============================================================================');
console.log('');

// 1. Start Backend Server
const backend = spawn('npm', ['--prefix', 'backend/apps/server', 'run', 'dev'], {
  cwd: rootDir,
  shell: true,
  stdio: 'inherit',
});

// 2. Start Frontend Vite Server with --host 0.0.0.0
const frontend = spawn('npm', ['--prefix', 'frontend', 'run', 'dev', '--', '--host', '0.0.0.0'], {
  cwd: rootDir,
  shell: true,
  stdio: 'inherit',
});

// 3. Auto-open default browser after 3 seconds
setTimeout(() => {
  try {
    exec(`start ${localUrl}`);
  } catch {}
}, 3000);

// 4. Clean exit handling (kill child process trees)
function shutdown() {
  console.log('\n\x1b[33mĐang tắt máy chủ Folk Tag LAN...\x1b[0m');
  if (backend.pid) {
    exec(`taskkill /pid ${backend.pid} /T /F`, () => {});
  }
  if (frontend.pid) {
    exec(`taskkill /pid ${frontend.pid} /T /F`, () => {});
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
