# Bàn giao backend để ghép với frontend

## Bản tích hợp 27/11/2026 — Vietnam Village Kit

Phần này thay các tọa độ/hash v0 trong lịch sử bên dưới. FE/BE hiện cùng đọc `packages/shared/maps/vietnam-village.json` và tính SHA-256 từ bytes thực. Các luật bắt/cứu, thời gian, vai và input cũ được giữ. Shared đã bổ sung heightfield, box có yaw, step offset và trạng thái cửa. Room có bản sao world riêng, cập nhật góc/collider cửa trước movement và LOS; không lấy GLB hoặc tọa độ client làm authority. `door:interact` nhận requestId, server chọn cửa gần vị trí thật; snapshot có `doors` tùy chọn.

Khi ghép nhánh: build shared → server → client bằng `npm run build` ở gốc; restart backend, tải lại FE mọi máy, tạo phòng mới. Không giữ server dist/map hash cũ. Backend tiếp theo cần ưu tiên playtest bot tại ngõ/cửa và đo tick khi đủ 6 người trên map mới, sau đó điều chỉnh bố cục có review FE/BE; chưa thay luật để xử lý vấn đề đồ họa. Chi tiết tại `frontend/docs/VIETNAM_VILLAGE_KIT.md` và `NETWORK_PROTOCOL.md`.

## Quyết định ngày 19/11/2026

Nhóm chọn **map, va chạm và mô phỏng di chuyển của sân tập FE** làm bản chuẩn cho cả hai phía. Server vẫn quyết định toàn bộ trạng thái trận. Protocol v1 mà FE đang dùng với F06 tiếp tục là hợp đồng mạng. Bản backend đã đối chiếu là commit `66695d1`. Các bước bên dưới là việc cần triển khai.

| Thành phần | Nguồn chuẩn từ gốc repo | Cách dùng |
|---|---|---|
| Bản đồ | [village-v1.json](packages/shared/maps/village-v1.json), [map.ts](packages/shared/src/map.ts) | Đọc bytes, tính SHA-256, parse JSON rồi gọi `validateMap`. Tọa độ theo mét, Y hướng lên. Slots và anchors ở tọa độ thế giới. |
| Mô phỏng | [movement.ts](packages/shared/src/movement.ts), [collision.ts](packages/shared/src/collision.ts), [rules.ts](packages/shared/src/rules.ts) | Khởi tạo bằng `initialMovement(spawn)`. Mỗi tick gọi `stepMovement(state, intent, assignedRole, map)`; vai trò lấy từ phiên phía server. |
| Hợp đồng mạng | [protocol.ts](packages/shared/src/protocol.ts), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md) | Giữ tên event, đơn vị, mã lỗi và các trường ack. FE đang import module protocol trực tiếp. Khi di chuyển module, cập nhật cả hai import trong cùng thay đổi. |
| Kiểm tra FE hiện có | [Mock session](frontend/src/net/mock-session.ts), [test hai client](frontend/tests/integration/mock.spec.ts) | MOCK01 là môi trường phát triển. Giữ đường chạy này trong lúc xây server phòng thật. |

Hash chuẩn của file ở lần bàn giao này là `575da3894a9c077ea9c0d2c166f5e79ea372706d52d7dd84ffc9dc93880f95ba`. Hash lúc chạy phải lấy từ bytes thực tế. Có thể kiểm tra bằng `Get-FileHash packages/shared/maps/village-v1.json -Algorithm SHA256` từ thư mục gốc.

## 1. Việc đầu tiên của backend — thống nhất shared và map

- Hai package hiện cùng tên `@folk-tag/shared`. Chuyển dần các consumer sang một package chung ở gốc; giữ các export protocol, hằng số phase, LOS và tiện ích server đang cần. Tách hàm hash dùng Node crypto ra khỏi entry point trình duyệt. Chuyển script build/test để checkout sạch build được shared trước server.
- Đổi chỗ đọc map và validate trong backend sang file chính thức. Map có 39 vật thể (10 nhà, 15 cây, 4 rơm, 6 bụi, 4 rào), 29 collider, 10 hide zone, 3 ứng viên nhà giam, 6 spawn. Dùng ID theo JSON, gồm hậu tố `_box` và `_hide`. Biên sân tính từ `size`. Sáu bụi có thể tích 2 × 1,1 × 2 m theo X/Y/Z. Collider nhà giam đang hoạt động được server bổ sung theo phase.
- Adapter input đổi `jumpId` mới thành `jumpPressed` đúng một tick. Giữ `MovementState` giữa các tick, gồm vận tốc dọc, grounded, crouched, stamina, exhausted và số tick chờ hồi. Không lấy tọa độ, thời gian bước hay role từ client.
- Nghiệm thu bằng cùng một chuỗi input cho hai vai trên cùng spawn và map. So vị trí, vận tốc dọc, grounded và stamina từng tick, gồm nhảy rào, cúi dưới trần và chạy kiệt sức. So hash hai đầu, chạy test map/movement hiện có. Sau khi toàn bộ consumer chuyển xong mới gỡ bản trùng.

## 2. N01 — mở đường cho lobby N03

1. Tách chế độ server phòng thật khỏi lệnh `dev:mock`. Implement `room:create/join/leave/ready/start` và `room:state` theo bảng payload trong protocol. Trả ack qua Socket.IO callback. Chốt fixture ack create/join với FE ngay từ đầu vì tài liệu đặt thông tin phòng ở cấp ngoài còn type AckResponse có trường data tùy chọn.
2. Room code sáu ký tự, tối đa sáu người, playerId ổn định theo phiên, host và roster do server quản lý. Kiểm tra version lúc create/join và mapHash lúc ready; trả VERSION_MISMATCH hoặc MAP_MISMATCH khi sai. Dedupe requestId 60 giây. Chỉ host được start khi đủ sáu người sẵn sàng.
3. Nghiệm thu bằng hai phòng tách biệt, người thứ bảy bị từ chối, rời rồi vào lại không trùng ID, gửi lại cùng requestId chỉ có một hiệu ứng. Kiểm tra host/start, ready sai hash và join sai version. Bàn giao cho FE một lệnh chạy, một ví dụ ack thành công/lỗi và một room:state thực. **Đây là thời điểm FE nối lobby N03.**

## 3. N02 — đồng bộ vị trí để FE làm N04

- Handler `game:input` validate frame và lưu input theo phiên. Mô phỏng chạy bằng đồng hồ monotonic 30 Hz; phát snapshot theo phòng 15 Hz. Xử lý tối đa năm bước bù mỗi lượt, bỏ seq cũ, xóa input giữ phím quá 250 ms, xử lý mỗi jumpId/captureId mới tối đa một lần. Trả ack của input đã xử lý.
- Snapshot chứa self, role, pos, vel, stamina và danh sách người khác được phép nhìn. Kiểm tra hai client nhận cùng chuyển động và không tăng quãng đường khi tăng tần suất gửi. Test đứng yên sau mất input, gói trùng, gói đảo thứ tự, rời phòng và dọn timer.
- Trước prediction, hai đội đối chiếu việc khôi phục MovementState từ snapshot, nhất là exhausted và thời gian hồi stamina. Nếu cần thêm trường, cập nhật type, tài liệu và test tương thích trong cùng PR. **FE nghiệm thu N04 bằng hai client, ack, replay và nội suy; mock hiện nay chỉ kiểm tra đường truyền.**

## 4. Các bước sau khi lobby và tick đã chạy

| Ticket backend | Bàn giao để FE ghép | Nghiệm thu |
|---|---|---|
| G01/G02 | Pha chọn jail, head start, đồng hồ, bắt, giam, kết quả | 2 cảnh sát/4 cướp; captain chọn trong 20 s, head start 15 s, trận 5 phút. Snapshot cung cấp jailId theo vai/pha; FE vẽ jail tại tâm tương ứng. |
| R01/R02 | Tiến độ cứu, miễn bắt, canh và dữ liệu hiển thị theo người nhận | Giữ E 2 s ở anchor hợp lệ, miễn bắt 3 s, tối đa một người canh. Kiểm tra biên nhìn thấy của người ẩn và bỏ vị trí khỏi mọi kênh gửi cho đối thủ ngoài tầm. |
| R03/G05 | Resume token xoay vòng, snapshot đầy đủ, kết quả và rematch | Thử reconnect theo grace 30 s; giữ playerId, xóa input cũ. Chơi đủ sáu người rồi quay về lobby. |

## Chạy kiểm tra từ thư mục gốc

```powershell
npm --prefix packages/shared ci
npm --prefix packages/shared run typecheck
npm --prefix packages/shared test
npm --prefix packages/shared run build
npm --prefix backend ci
npm --prefix backend run build
npm --prefix backend run typecheck
npm --prefix frontend ci
npm --prefix frontend run test:backend
```

Bài cuối dùng Chrome, tự mở backend và FE ở cổng 3017 và 5175 để kiểm tra F06. Khi bàn giao N01/N02, bổ sung integration test riêng cho server thật và giữ bài mock làm hồi quy. Bảng ticket và tiêu chí gốc nằm ở [BACKLOG.md](BACKLOG.md) và [TESTING.md](TESTING.md).

## 20/11/2026 — R01, giữ E bị ngắt khi giữa hai gói input có một tick trống

Trong phòng sáu người, FE đã xác nhận bắt giữ, tải lại và kết nối lại khi đang bị giam. Bài frontend/tests/integration/capture.spec.ts kiểm thử kịch bản giải cứu J1, tải lại và kết nối lại hoàn tất 100%.

Tái hiện riêng với Room.step() trên bản build server: đặt một cướp vào ô giam J1 và đồng đội ở [2.7, 0, 0], yaw π/2. Gửi một frame rescueHeld=true rồi chạy hai tick liên tiếp. Tick đầu có 33,33 ms tiến độ. Tick sau có hàng đợi rỗng, gói trước mới 10 ms nhưng rescueHeld thành false và tiến độ về 0. INPUT_STALE_TIMEOUT_MS là 250 ms. Nhánh else trong backend/apps/server/src/rooms/room.ts ở phần input xử lý cả hàng đợi rỗng và input hết hạn như nhau.

Đề nghị đội BE giữ trạng thái phím và cờ yêu cầu nhả E qua tick rỗng khi kết nối và input còn hiệu lực. Nhả E, mất kết nối, input quá hạn hoặc mất điều kiện cứu phải hủy tiến độ theo luật. Thêm test server xen tick rỗng giữa các frame giữ E trong hai giây, cùng các trường hợp nhả E, quá hạn và tiếp tục giữ sau một lần cứu. Sau khi build lại server, chạy npm run test:backend trong frontend để xác nhận số bị giam giảm, điểm thả và HUD miễn bắt trong Chrome.

**Đã sửa và nghiệm thu R01 trong workspace ngày 20/11/2026.** Server giữ E qua tick rỗng khi input còn hiệu lực, hủy tiến độ khi nhả E hoặc input quá hạn, và yêu cầu nhả E sau mỗi lần cứu. Test server có trường hợp nhả và nhấn lại trong cùng một lô input. Đã đạt 19/19 test server, typecheck, build và 4/4 bài tích hợp Chrome. Bài phòng sáu người xác nhận thả đúng điểm tại J1 và HUD miễn bắt hiện rồi tắt.

### 20/11/2026 — Đồng hồ ván chậm khi máy tải cao

Bài Chrome hai người chờ hết giờ đã quan sát HUD còn 00:14 sau 330 giây kể từ PLAYING. Room.start() gọi step() từ setInterval, còn step() trừ remainingMs bằng SIMULATION_TIMESTEP_MS cố định. Khi callback trễ, đồng hồ ván trễ theo. Cần đối chiếu deadline thực cho phase theo GAMEPLAY.md, đồng thời giữ bước mô phỏng cố định. FE hiện chờ kết quả authoritative. Bài thử đã tăng giới hạn chờ để nghiệm thu giao diện kết quả.

## 21/11/2026 — Nhà có thể đi vào

Theo yêu cầu người dùng, village-v1.json đã đổi từ 10 khối nhà đặc sang các tường, cửa, trần và đồ nội thất. Tổng collider hiện 129. MapObject có footprint tùy chọn để lưu rộng/sâu của nhà. Cửa trước/sau rộng 1,6 m, cao 2,4 m. Rendering FE dùng chính các hộp va chạm trong JSON. Map cũ không có footprint vẫn parse được. Sửa này đổi bytes và SHA-256 bản đồ, cần build shared/backend rồi khởi động lại backend và tải lại FE ở mọi máy. Các phòng cũ cần tạo lại sau restart.

FE cũng khôi phục SHA-256 từ bytes thực trên HTTP LAN bằng js-sha256, vì hash cố định ở bản trước không còn khớp bản đồ mới. Kiểm tra va chạm và LOS cho cả 10 nhà đã đạt. Chrome hai người đã xác nhận server đồng bộ người đi vào H03 và ra cửa đối diện.
