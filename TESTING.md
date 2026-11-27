# Test plan & balance

## Vietnam Village Kit — 27/11/2026

Map mặc định đã chuyển sang `packages/shared/maps/vietnam-village.json`. Các fixture v0 trong unit test art cũ vẫn dùng rõ ràng `village-v1.json`; không thay assertion gameplay bằng kết quả giả. Scene/integration dùng map mới thực tế và các đường đi cập nhật.

- `packages/shared/tests/village-kit.test.mjs`: đủ 35 model, grid terrain/height từng vertex, 10 lối vào nhà, cửa đóng/mở/LOS/chống kẹp, spawn với cửa đóng, cầu, dốc lên/xuống, bốn biên khi nhảy, metadata sai và ID cửa trùng.
- `backend/apps/server/tests/village_doors.test.mjs`: tương tác theo vị trí server, từ chối xa/jailed, tách world mỗi phòng, snapshot/collider động và reset hợp lệ.
- `frontend/tests/e2e/village-kit.spec.ts`: 35 GLB tải thành công, menu desktop/portrait mobile, đo renderer thật, touch joystick, tap cửa, vào/ra nhà có nội thất, pause/resume.
- Integration server thật: cửa mở/đóng thấy ở hai client, vị trí vào/ra nhà, ván đủ 5 phút/rematch, bắt/cứu/reload/reconnect với 6 người; không teleport hoặc thêm production test bypass.

Dùng Chrome có sẵn bằng `$env:PLAYWRIGHT_CHANNEL='chrome'` nếu Playwright bundled Chromium chưa cài. Chạy e2e và integration tuần tự vì config integration kế thừa Vite 5174 cùng backend 3017. Không chạy thêm nhiều browser/worker nặng khi đo FPS hoặc chờ action mạng. Việc chụp cửa sổ người chơi khác có thể nhả pointer lock; test phải đưa host về foreground trước khi click bắt.

Kết quả thực tế cuối phiên và giới hạn thiết bị ghi ở `frontend/docs/TIEN_TRINH.md`. Chưa lấy mẫu desktop làm chứng nhận FPS điện thoại hoặc kết luận cân bằng map mới.

## Cấu trúc kiểm thử chuẩn (Test Hierarchy)

Dự án áp dụng mô hình phân tầng kiểm thử rõ ràng, độc lập và đồng bộ trên toàn bộ Monorepo:

| Tầng kiểm thử | Vị trí thư mục | Runner / Framework | Lệnh thực thi từ Root |
| :--- | :--- | :--- | :--- |
| **Shared Unit** | `packages/shared/tests/` | Node Test Runner (`node --test`) | `npm run test:shared` |
| **Server Unit & FSM** | `backend/apps/server/tests/` | Node Test Runner (`node --test`) | `npm run test:server` |
| **Client Unit** | `frontend/tests/unit/` | Vitest (`vitest run`) | `npm run test:client` / `npm run test:unit` |
| **Client Scene E2E** | `frontend/tests/e2e/` | Playwright (`playwright test`) | `npm run test:e2e` |
| **Multiplayer Integration** | `frontend/tests/integration/` | Playwright (`playwright.integration.config.ts`) | `npm run test:integration` |
| **Load & Stress Test** | `backend/apps/server/src/scripts/` | tsx Node Script | `npm run test:load` |
| **Simulated Playtests** | `backend/apps/server/src/scripts/` | tsx Node Script | `npm run test:playtests` |
| **Toàn bộ hệ thống** | Tất cả thư mục trên | Tự động tuần tự | `npm run test:all` |

### Chi tiết các tầng

- **Unit Tests**:
  - `packages/shared/tests/`: Kiểm thử hàm toán học thuần túy, va chạm collider, quy tắc di chuyển 30Hz, stealth núp lùm rơm/bụi cây, logic tính bắt cướp `isRobberCapturable` & `validateCapture`.
  - `backend/apps/server/tests/`: Kiểm thử máy trạng thái phòng chơi (FSM), bảo mật rate limiter, lưu trữ SQLite DB, thuật toán AI bot tự động tìm đường né vật cản.
  - `frontend/tests/unit/`: Kiểm thử nạp 9 mô hình GLB, khởi tạo Three.js scene, camera, input state, viewmodel FPS, hệ thống âm thanh Web Audio và la bàn mini-map.
- **E2E Scene Tests (`tests/e2e/scene.spec.ts`)**:
  - Kiểm thử render WebGL trên trình duyệt thật (Chromium), thay đổi kích thước canvas, khóa chuột pointer lock, tổ hợp phím WASD, kiểm tra 24 tuyến khảo sát nhà giam.
- **Multiplayer Integration Tests (`tests/integration/`)**:
  - `capture.spec.ts`: Mô phỏng 6 người chơi thật kết nối qua Socket.IO, cảnh sát tiếp cận bắt cướp giam vào J1, đồng đội giải cứu, ngắt kết nối WebSocket và khôi phục phiên qua reload.
  - `mock.spec.ts`: Kiểm thử đồng bộ hóa vị trí tức thời qua snapshot và bắt cướp giam vào J1 trên mock server.

| ID | Scenario | Expected |
|---|---|---|
| L01 | 5/6 ready, nonhost start | rejected |
| L02 | 6 ready | 2 police/4 robbers, captain set |
| L03 | robber select jail or second selection | rejected |
| L04 | no selection after 20s | J1 active |
| L05 | 15s head start | police frozen, timer 300s after |
| M01 | diagonal sprint, jump repeated midair | speed cap, one jump |
| M02 | sprint till 0 | walk, recover, threshold 20 |
| M03 | sprint into wall and boundary | no clipping |
| M04 | jump fence .65m | cross with correct landing |
| M05 | stand under low ceiling | stays crouched |
| C01 | police tag at 1.59m, front, clear | captures |
| C02 | 1.61m or obstacle or behind | no capture, cooldown |
| C03 | capture ID duplicated/forged role | no duplicate capture |
| C04 | 4 robber jailed in same tick as rescue | police wins; no post-end rescue |
| R01 | hold E 1999ms vs >=2000ms on discrete ticks | no early rescue; then 1 freed |
| R02 | release E, walk out, get caught | reset progress |
| R03 | simultaneously 2 rescuers | one completes first, no duplicate |
| R04 | freed <3s / at expiry | immune / catchable |
| R05 | jailed moves/jumps/tries E | confined, no self escape |
| G01 | 2 police enter zone simultaneously | deterministic first token, second blocked |
| G02 | guard leaves/disconnects | token released |
| H01 | crouch within hay/bush 0.4s | hidden, no enemy position >2m |
| H02 | exits, stands or police within 2m | state visible as defined, no immunity |
| H03 | inspect socket payload as police | no hidden opponent pos/audio events |
| E01 | exactly 300s, one robber free | robber wins, no overtime |
| E02 | reconnect within 30s | same slot/state, full snapshot |
| E03 | absent >30s | aborted, no false win |
| E04 | finish then rematch | clear timer, role/state/input/guard reset |
| N01 | fake latency 100ms + jitter/loss | no permanent stale states |
| N02 | invalid NaN, huge packet, flood, spoof ID | reject, room unaffected |
| N03 | two rooms on one server | no cross-room snapshots |
| P01 | 5 rooms ×6 scripted clients | tick p95 <20ms goal; log actual |
| P02 | 1080p desktop, 5min play | measure FPS p50/p95 frame time, crashes |

Time-based tests use server fake monotonic clock/tick rather than sleeps; allow at most one fixed tick quantization (33.3ms) where appropriate. At deadline timeout takes priority. Check disconnect in each phase and guard disconnect. Test all 3 jail IDs.

## Playtest log

CSV columns: matchId,mapVersion,rulesVersion,jailId,teamAssignment,winner,durationSeconds,firstCaptureSec,numCaptures,numRescues,guardSeconds,avgStamina,disconnects,rttMs,notes. No IP/token logged. Collect anonymous feedback 1–5: chase fun, control, map clarity, rescue opportunity, fairness, nausea. Test 20–30 rounds split evenly across jails, swap roles; small sample directional only. Aim 45–55% after more matches, not proof of fairness. Compare median capture/rescue time per map. Watch jail camping and infinite loops; adjust only one group of rules per iteration.

## Release gate

- [ ] Pre-merge lint/typecheck/unit/integration green.
- [ ] Six humans can join, select jail, finish, rematch.
- [ ] No blocker: game freeze, wrong victory, impossible rescue, wall clip or state leak.
- [ ] Reconnect clean, all jail candidates reachable, guard limit enforced.
- [ ] Browser console clean; loading/low quality mode functional.
- [ ] Record build version, measured FPS/tick metrics, known limitations, deployment rollback tag.
