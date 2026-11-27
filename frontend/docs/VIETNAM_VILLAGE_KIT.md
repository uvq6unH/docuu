# Tích hợp Vietnam Village Kit

Cập nhật 27/11/2026. Nhánh `codex/vietnam-village-kit`. Phạm vi theo yêu cầu người dùng: thay môi trường, UI desktop/mobile, địa hình thực và cửa đồng bộ; giữ luật và điều khiển hiện có.

## Dữ liệu và đường dẫn

| Thành phần | Nguồn |
|---|---|
| Kit gốc, yêu cầu, 2 ảnh concept | `frontend/vietnam-village-kit/` |
| 35 GLB phục vụ web | `frontend/public/assets/village/` |
| Script import có thể tái tạo | `frontend/scripts/import-village-kit.mjs` |
| Map chung đang chạy | `packages/shared/maps/vietnam-village.json` |
| Types/validator, collision, cao độ, cửa | `packages/shared/src/{map,collision,terrain,doors}.ts` |
| Cache/merge/instance GLB | `frontend/src/world/kit-models.ts` |
| UI và tương tác | `frontend/{index.html,src/main.ts,src/style.css}` |
| Authority cửa/movement | `backend/apps/server/src/rooms/room.ts` |

Kit nguồn không bị sửa. Các GLB là prototype low-poly thủ tục của bộ kit, không phải bản tái dựng chi tiết y hệt ảnh concept. Không dùng ảnh concept làm texture. Không tải asset ngoài. Nguồn/quyền ghi trong `frontend/assets/LICENSES.md`; kit không có LICENSE riêng.

Map dùng bố cục `map.json` khởi điểm, thêm landmark và đồ đạc: 10 nhà/5 kiểu, 19 cây, 4 đống rơm, 6 bụi, cổng, giếng, ao sen có cầu, ruộng lúa và tường/rào biên. Tổng 268 placements, 239 box tĩnh + 10 collider cửa động. Cả 35 model đều được load và sử dụng. Ba jail vẫn là candidate, chỉ jail được chọn hiện và hoạt động.

## Nhà, cửa và mặt đất

Nhà có collider riêng cho từng node tường/sàn/trần. Bàn, ghế, giường, tủ, ghế băng, bàn thờ, bếp và chum được bố trí hai bên, chừa hành lang vào. GLB có một lỗ cửa mỗi nhà; cụm nhà có lối vòng hai bên. Nhà hai tầng chỉ đi tầng trệt, chưa có cầu thang trong kit.

Cửa đặt tại `doorSocket`, quay bản lề 0–95° trong 400ms. Door mesh được scale theo lỗ cửa thật để không xuyên dầm. E hoặc nút cửa cảm ứng trong 1.5m gửi intent; server chọn cửa dựa vị trí thật, giới hạn phase/state, chống gửi lặp theo requestId. Cửa quét capsule từng bước, dừng trước khi kẹp người. Mỗi phòng có trạng thái riêng; restart hợp lệ đóng cửa. Không gửi tọa độ hoặc thời lượng từ client.

Terrain GLB giữ nguyên hình học; importer xuất heightfield 41×41 đúng vertex và đường chia tam giác. Cao độ khoảng -0.907…0.902m. Nhân vật dùng cùng hàm lấy mặt đất trên FE/BE, gravity/jump hiện có, step 0.2m và giới hạn dốc 0.7. Cỏ/hoa cũng đặt theo cao độ. Bốn box biên liên tục cao 8m đóng cả cổng/góc; nhảy và sprint vẫn giữ ở trong map. Ao không có cơ chế bơi mới, bank chặn vùng nước và cầu là lối đi qua.

## Render và UI

GLTFLoader có Promise cache cho mỗi asset; các node hợp nhất geometry với vertex color, một InstancedMesh cho mỗi loại prop tĩnh. Cửa và jail đang chọn là dynamic mesh riêng. Giữ frustum culling, DPR cap và shadow throttle cũ; ruộng lúa không cast shadow. Có tiến trình tải 35 asset và báo tải thiếu; không âm thầm dùng graybox khi kit lỗi.

Menu, HUD, pause và cửa dùng kem/vữa, xanh lá, nâu gỗ, đỏ ngói. Touch mode không cần pointer lock; có joystick, nhìn, hành động, nhảy, cúi, chạy và Menu/tiếp tục. Desktop giữ WASD/chuột, Shift, Space, C/Ctrl, E và Esc. E ưu tiên cửa gần; ngoài cửa giữ bắt/cứu. Pause chỉ nhả điều khiển, ván multiplayer vẫn chạy.

## Chạy và tái tạo

Từ `D:\Projects\docuu`:

```powershell
npm run build
npm run dev:server
```

Terminal thứ hai: `npm run dev:client`, hoặc `npm --prefix frontend run dev:lan` khi chơi LAN. Sau thay đổi map, restart backend, tải lại FE mọi máy và tạo phòng mới vì map hash đã đổi.

Chỉ khi cần cập nhật nguồn kit/bố cục, từ `frontend` chạy `node scripts/import-village-kit.mjs`. Review JSON diff rồi chạy lại typecheck/lint/unit/build và Playwright. Runtime chỉ đọc JSON, server không parse GLB. Không xóa asset cũ trước nghiệm thu.

## Kiểm chứng và giới hạn

- Shared test: metadata và toàn bộ asset, cao độ vertex, cả 10 lối vào, cửa đóng/mở/chống kẹp, LOS, đi dốc, cầu và bốn biên khi nhảy; thêm dữ liệu sai/ID trùng.
- Backend test: từ chối tương tác xa/jailed, authority vị trí, room isolation, collider động, reset; giữ suite bắt/cứu/bot/security cũ.
- Playwright: desktop/mobile menu, 35 HTTP GLB thành công, WebGL, walk/sprint/crouch/jump, mobile vào/ra nhà và tap cửa/pause; integration thật kiểm tra cửa ở hai client, bắt/cứu, reconnect và rematch.
- Chạy với Chrome cài sẵn trên máy: `$env:PLAYWRIGHT_CHANNEL='chrome'`, rồi `npm run test:e2e` / `npm run test:integration`. Chạy tuần tự vì integration config kế thừa cả Vite 5174 và server test 3017.
- Ảnh và đo mẫu nằm trong `frontend/test-results/` (gitignored). Đây là kiểm tra Chromium touch emulation; chưa xác nhận Safari/iOS hoặc GPU điện thoại thật. Chưa playtest cân bằng bố cục mới với 6 người thật qua LAN.

Nghiệm thu cuối: typecheck/lint/build đạt, unit 165/165, scene/e2e 12/12, integration ngắn 6/6 và kịch bản ván đủ 5 phút/rematch đạt ở lượt trước. Load 5 phòng/30 client đạt, p95 tick 2.26ms. Mẫu render cuối Intel UHD/Chrome 158, 1440×900: 120 frames trong 1.4363s, 101 draw calls, 126.984 triangles; không phải benchmark dài hoặc chứng nhận mobile. Đã đối chiếu 35 binary public với nguồn: giống hoàn toàn, tổng GLB 361.028 bytes.

Kết quả lệnh cuối cùng và bước tiếp theo được ghi trong `TIEN_TRINH.md`; số liệu nghiệm thu v0 trong tài liệu cũ không áp dụng tự động cho map mới.
