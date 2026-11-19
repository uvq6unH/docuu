# Frontend — Cảnh sát bắt cướp

Client độc lập của B, hiện có sân thử Three.js (F04) và camera/input (F05). Đọc [TIEN_TRINH.md](TIEN_TRINH.md) trước khi tiếp tục. Sân tập FPS offline dùng chung mô phỏng M02 và collider M01 trong packages/shared.

## Chạy local

Node đã pin ở `.nvmrc`: `24.21.0`; npm 11. Chạy từ thư mục `frontend/`:

```powershell
cd D:\Projects\docuu\frontend
npm ci
npm run dev
```

Mở <http://127.0.0.1:5173>. Bấm **Vào sân tập** để khóa chuột, di chuột để nhìn, Esc để thả. Dùng WASD để đi, Shift để chạy, Space để nhảy và C hoặc Ctrl để cúi. Thể lực hiển thị ở chân màn hình. Dev hiển thị input readout; build production không hiển thị readout.

Mất focus, ẩn tab hoặc nhả pointer lock sẽ xóa input để tránh kẹt phím. Khi thả chuột, mô phỏng tạm dừng và camera trở về góc khảo sát. Vào lại sân để tiếp tục từ vị trí cũ. Làng và ba vị trí nhà giam lấy từ map JSON chung F03.

## Kiểm tra

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run preview
```

E2E dùng **Google Chrome đã cài** (`channel: chrome`), mở Vite tạm trên cổng **5174**, không tái sử dụng server khác. Chrome phải có WebGL2; đây là browser test headless, chưa thay cho kiểm tra người chơi trên Chrome/Edge có giao diện. Kết quả/screenshot/trace nằm ở `test-results/` và được gitignore. Nếu máy chỉ có Edge, cần cấu hình Playwright channel phù hợp trước khi chạy.

Build xuất vào `dist/`. Hiện Vite cảnh báo JavaScript chunk lớn hơn 500kB do bundle có Three.js; số đo gzip thực tế và test evidence được ghi trong sổ tiến trình. Chưa đo FPS hay kiểm chứng performance budget toàn game.

## Tích hợp với A

- Bộ công cụ chỉ đặt trong `frontend/`; **F01 toàn repo chưa hoàn tất**. A vẫn sở hữu workspace gốc, server, shared và CI. Không có package.json hoặc workflow mới ở root trong bước này.
- Vite đã cấu hình proxy `/socket.io` và `/healthz` tới `http://127.0.0.1:3001`, đổi qua `DEV_SERVER_ORIGIN` nếu cần (xem `.env.example`). Chế độ thử backend dùng proxy Socket.IO cùng origin. Không đặt secret vào biến `VITE_*` vì chúng đi vào trình duyệt.
- Khi workspace gốc sẵn sàng, đưa package frontend vào workspace và thống nhất một lockfile ở root. Không giữ đồng thời hai client/lockfile cạnh tranh sau khi tích hợp; chuyển đổi trong ticket F01 của A.
- F03 cung cấp map schema/JSON để làm M04. M02 cung cấp simulation shared để làm M03. Transport thử nghiệm dùng protocol của backend. Lobby đầy đủ chờ N01.
- Tài nguyên web ở `public/`; `.blend` ở `assets/blender/`; nguồn/license ở [assets/LICENSES.md](assets/LICENSES.md). `public/favicon.svg` là SVG primitive tạo trong bước frontend, không có model/texture/audio tải ngoài.

Tham chiếu công cụ đã dùng khi bootstrap: [Vite](https://vite.dev/guide/), [Three.js](https://threejs.org/docs/), [Vitest](https://vitest.dev/guide/). Phiên bản thực tế pin trong `package.json`/`package-lock.json`; TypeScript 6.0.3 được chọn theo peer range của typescript-eslint 8.73.0, thay vì tự động lấy TypeScript mới nhất.

Cảnh làng trong dev và production dùng [village-v1.json](../packages/shared/maps/village-v1.json) và validateMap của shared. Trong dev, mở **Khảo sát làng village-v1** để xem ba vị trí nhà giam, bật lớp collider và chọn một trong 24 tuyến cứu. Có thể nhập JSON cục bộ để so sánh với map chung, rồi gỡ lớp đối chiếu để quay về bản mặc định. Nút Vào sân tập dùng spawn cướp đầu tiên và collider của village-v1.

## Mô hình nhà và cây

Nguồn chỉnh sửa nằm trong `assets/blender/`. Sau khi sửa một file Blender, xuất GLB cùng tên vào `public/models/`, dùng mét và tùy chọn glTF Y-up. Các mẫu nhà dùng kích thước cơ sở 8 × 8 m, cao 5 m. Client điều chỉnh chiều rộng và chiều sâu theo từng lô trong village-v1. Tán cây chỉ có chức năng hiển thị.

Để tái tạo cả năm mẫu gốc bằng Blender 5.2, chạy từ thư mục frontend. Lệnh này ghi lại cả năm file Blender và GLB.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python assets/blender/build_a01.py
```

## Chạy frontend với backend thử nghiệm

Từ thư mục gốc, mở hai terminal. Terminal thứ nhất chạy backend ở cổng 3001.

```powershell
cd backend
npm ci
npm run build
npm run dev:mock
```

Terminal thứ hai chạy frontend ở cổng 5173.

```powershell
cd frontend
npm ci
npm run dev
```

Mở http://127.0.0.1:5173 và chọn **Kết nối backend thử nghiệm**. Sau khi thấy MOCK01, bấm **Vào sân tập** để điều khiển bằng WASD. Có thể mở thêm một tab để xem nhân vật di chuyển. **Về sân offline** quay lại mô phỏng M02. Chế độ mock chỉ có trong Vite dev. Bài kiểm tra tự khởi động hai server trên cổng riêng: sau khi build backend, chạy `npm run test:backend` trong frontend (Chrome và cổng 3017, 5175 cần khả dụng).

## Mô hình A02 và bàn giao backend

Chọn J1, J2 hoặc J3 trong bảng khảo sát để xem mô hình nhà giam tre cùng các điểm cứu và thả. Trong phòng mock, vị trí nhà giam lấy từ jailId trong snapshot. Bụi cỏ, rơm và hàng rào dùng tọa độ của village-v1. Nguồn Blender ở assets/blender; có thể tái tạo bốn mẫu bằng lệnh Blender ở trên với script build_a02.py.

Quyết định dùng chung map/movement, các bước chuyển backend và tiêu chí mở lobby được ghi trong [bàn giao backend](../BACKEND_FE_HANDOFF.md).
