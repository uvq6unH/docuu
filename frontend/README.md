# @folk-tag/frontend

Giao diện người dùng và client WebGL 3D cho trò chơi **Cảnh Sát Bắt Cướp (Folk Tag 3D)**.

## Cấu trúc thư mục

```
frontend/
├── assets/                  # Tài nguyên nguồn (Blender .blend, script xuất mô hình, sơ đồ SVG)
├── docs/                    # Tài liệu tiến trình, sổ tay vận hành (SOP) và nhật ký kỹ thuật
├── public/                  # Tài nguyên tĩnh phục vụ trực tiếp (GLB models, audio, favicon)
│   ├── models/              # Mô hình GLB (nhà, cây, đụn rơm, hàng rào, nhà giam, avatar)
│   └── audio/               # Hiệu ứng âm thanh trò chơi
├── scripts/                 # Kịch bản kiểm thử hiệu năng (FPS, benchmark) và chụp ảnh showcase
├── src/                     # Mã nguồn chính của client
│   ├── core/                # Khởi tạo WebGL Scene, Camera, Ánh sáng, Quản lý Âm thanh
│   ├── input/               # Điều khiển bàn phím/chuột (WASD, Mouse look, Pointer Lock, Touch)
│   ├── net/                 # Kết nối Socket.IO, Client-side prediction & reconciliation
│   ├── player/              # Avatar nhân vật 3D, Viewmodel tay cầm góc nhìn thứ nhất (FPS)
│   ├── world/               # Xây dựng môi trường làng quê, vật cản, nhà giam, tuyến đường
│   ├── main.ts              # Entry point điều phối trạng thái game, render loop và UI DOM
│   └── style.css            # Giao diện phong cách Sơn Mài & Khắc Gỗ Dân Gian
├── tests/                   # Bộ kiểm thử tự động
│   ├── unit/                # Unit test với Vitest (16 files: models, physics, controls, sound)
│   ├── e2e/                 # E2E test client với Playwright (scene.spec.ts)
│   └── integration/         # E2E test nhiều người chơi thời gian thực (capture.spec.ts, mock.spec.ts)
├── index.html               # Trang HTML chính chứa canvas WebGL và DOM HUD
├── playwright.config.ts     # Cấu hình Playwright cho E2E Scene tests
├── playwright.integration.config.ts # Cấu hình Playwright cho Multiplayer Integration tests
└── vite.config.ts           # Cấu hình Vite bundler & chia chunk tối ưu
```

## Các lệnh phát triển & kiểm thử

| Lệnh | Mục đích |
| :--- | :--- |
| `npm run dev` | Khởi chạy Vite dev server tại `http://127.0.0.1:5174` |
| `npm run dev:lan` | Khởi chạy Vite lắng nghe trên toàn mạng LAN (`0.0.0.0`) |
| `npm run build` | Kiểm tra kiểu và đóng gói mã nguồn vào `dist/` |
| `npm run preview` | Xem trước bản build production tại `http://127.0.0.1:5174` |
| `npm run typecheck` | Kiểm tra kiểu TypeScript không xuất file (`tsc --noEmit`) |
| `npm run lint` | Chạy linter ESLint kiểm tra chuẩn code |
| `npm run test` / `npm run test:unit` | Chạy toàn bộ 16 file unit test với Vitest |
| `npm run test:e2e` | Chạy kiểm thử E2E scene & WebGL (`tests/e2e/scene.spec.ts`) |
| `npm run test:integration` | Chạy kiểm thử đa người chơi với server thật (`tests/integration/`) |
| `npm run test:all` | Chạy toàn bộ unit test, e2e test và integration test |
