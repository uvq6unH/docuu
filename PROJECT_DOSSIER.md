# HỒ SƠ KỸ THUẬT DỰ ÁN: CẢNH SÁT BẮT CƯỚP (FOLK TAG 3D)
> **Tài liệu bàn giao & phân tích kỹ thuật toàn diện phục vụ việc kiểm toán (Audit & Code Review) bởi Claude và Codex**
> *Phiên bản: Alpha v0.1.0 · Cập nhật: 25/11/2026 · Nhánh: main*

---

## 1. TỔNG QUAN DỰ ÁN & TẦM NHÌN THIẾT KẾ (EXECUTIVE OVERVIEW)

### 1.1. Giới thiệu trò chơi
**Cảnh Sát Bắt Cướp (Folk Tag 3D)** là trò chơi hành động FPS góc nhìn thứ nhất, nhiều người chơi thời gian thực (Real-time Multiplayer Browser FPS) lấy cảm hứng từ trò chơi dân gian đuổi bắt truyền thống Việt Nam.
- **Phong cách nghệ thuật**: Đồ họa Low-poly kết hợp ngôn ngữ thiết kế giao diện **Sơn Mài & Khắc Gỗ Dân Gian Đông Hồ**.
- **Không bạo lực**: Trò chơi hoàn toàn không có súng đạn, không có vũ khí sát thương, không thanh máu (HP), không cướp tiền. 
- **Gameplay cốt lõi**: Đuổi bắt, ẩn nấp tàng hình trong bụi rơm/bụi cây, phối hợp nhóm giải cứu đồng đội khỏi nhà giam và tính toán chiến thuật di chuyển/thể lực.

### 1.2. Quy tắc trò chơi & Vòng đời trận đấu (Game Rules & FSM)
- **Quy mô ván chơi chuẩn**: 6 người chơi gồm **2 Cảnh sát (Police)** và **4 Cướp (Robbers)**. Hỗ trợ từ 2 đến 6 người chơi, có hệ thống **Bot AI tự động bù slot** khi thiếu người.
- **Vòng tuần hoàn trạng thái (Match Lifecycle FSM)**:
  ```mermaid
  stateDiagram-v2
      [*] --> LOBBY: Tạo hoặc vào phòng
      LOBBY --> JAIL_SELECTION: Chủ phòng bấm Bắt đầu (đủ người / bot)
      JAIL_SELECTION --> HEAD_START: Cảnh sát trưởng chọn Nhà giam (J1/J2/J3) hoặc hết 20s
      HEAD_START --> PLAYING: Hết 15s đếm ngược thả cướp chạy trước
      PLAYING --> RESULT: Toàn bộ cướp bị bắt HOẶC hết 300s
      RESULT --> LOBBY: Chủ phòng bấm Chơi lại (Rematch) giữ nguyên phòng
  ```

| Trạng thái | Thời lượng | Đặc tả kỹ thuật |
| :--- | :---: | :--- |
| **`LOBBY`** | Vô hạn | Người chơi sẵn sàng, đổi vai (Police/Robber/Auto), thêm/bớt bot, chọn trang phục mũ dân gian. |
| **`JAIL_SELECTION`** | 20s | Cảnh sát trưởng (Police Captain) chọn 1 trong 3 nhà giam `J1`, `J2`, `J3`. Nếu bot làm Captain hoặc hết giờ, tự động kích hoạt `J1`. |
| **`HEAD_START`** | 15s | Cảnh sát bị đóng băng (freeze) tại điểm xuất phát; Cướp được thả tự do chạy trốn tìm nơi ẩn nấp. |
| **`PLAYING`** | 300s (5 phút) | Di chuyển thời gian thực. Bắt cướp, giam giữ, giải cứu, canh gác, ném sỏi đánh lạc hướng, ping chiến thuật. |
| **`RESULT`** | 15s | Tổng kết ván đấu, vinh danh MVP Cảnh sát (nhiều lần bắt nhất) & MVP Cướp (nhiều lần cứu nhất), bảng thống kê chi tiết. |

### 1.3. Cơ chế tương tác & Luật chơi vật lý
1. **Bắt cướp (Capture)**:
   - Chỉ Cảnh sát mới có quyền bắt cướp.
   - **Điều kiện bắt giữ chuẩn**: Khoảng cách tâm $\le 1.6\text{m}$ (`CAPTURE_MAX_DISTANCE_M`), góc nhìn camera $\le 55^\circ$ (`CAPTURE_MAX_ANGLE_DEG`), chênh lệch độ cao $\le 1.0\text{m}$, không bị tường/vật cản che khuất tầm nhìn (Line-of-Sight).
   - **Dung sai mạng (Network Tolerance)**: Server tự động cộng biên độ dung sai $\Delta d = +0.4\text{m}$ và $\Delta \theta = +10.0^\circ$ (dựa trên cấu hình `CAPTURE_NETWORK_TOLERANCE_DISTANCE_M: 2.0` và `CAPTURE_NETWORK_TOLERANCE_ANGLE_DEG: 65.0` trong [rules.ts](file:///d:/docuu/packages/shared/src/rules.ts)) để bù trừ độ trễ mạng (RTT) và packet jitter. Khi quản trị viên tinh chỉnh luật (`/api/rules/tune`), ngưỡng bắt giữ sẽ tự động co giãn tịnh tiến cùng luật mới.
   - Cooldown sau mỗi lần bấm bắt: $1.1\text{s}$ (kể cả bắt trượt).
   - Cướp bị bắt lập tức dịch chuyển tức thời vào ô trống đầu tiên (slot 0..3) của nhà giam đang kích hoạt và chuyển trạng thái thành `JAILED`.
2. **Ẩn nấp (Stealth & Hiding)**:
   - Bản đồ có 10 đụn rơm (`haystack`) và 14 bụi cây (`bush`).
   - Khi cướp cúi người (`crouch`) hoàn toàn bên trong vùng nấp, trạng thái chuyển thành `HIDDEN`.
   - Cảnh sát ở khoảng cách xa $> 2.0\text{m}$ sẽ **hoàn toàn không nhìn thấy** cướp (server chủ động lọc bỏ cướp khỏi snapshot gửi về cho cảnh sát để chống wallhack). Cảnh sát chỉ phát hiện khi tiến lại gần $\le 2.0\text{m}$.
3. **Nhà giam & Vùng cấm (Jail Guard Zone)**:
   - Mỗi nhà giam có bán kính bảo vệ $5.0\text{m}$.
   - **Luật chống cắm trại (Anti-camping rule)**: Tối đa chỉ **1 Cảnh sát** được phép đứng trong vòng $5\text{m}$ quanh nhà giam. Cảnh sát thứ hai đi vào sẽ bị thuật toán phân cách đẩy lùi (boundary clamp) ra ngoài bán kính $5.005\text{m}$.
4. **Giải cứu (Rescue Mechanic)**:
   - Cướp tự do tiếp cận 1 trong 2 điểm neo giải cứu (`rescueAnchors`) của nhà giam và giữ phím `E` liên tục trong **$2.0\text{s}$** ($2000\text{ms}$).
   - Nếu nhả phím trước $2.0\text{s}$, tiến trình lập tức reset về 0.
   - Giải cứu thành công sẽ giải thoát cho 1 cướp đang bị giam lâu nhất, cướp được thả ra tại điểm neo thả (`releaseAnchor`) và nhận **$3.0\text{s}$ miễn nhiễm bắt giữ (`IMMUNE`)**.

---

## 2. KIẾN TRÚC HỆ THỐNG & NGĂN XẾP CÔNG NGHỆ (ARCHITECTURE & TECH STACK)

### 2.1. Cấu trúc Monorepo
Dự án được tổ chức theo kiến trúc Monorepo dạng module hóa cao:
```
docuu/
├── packages/
│   └── shared/                 # Core logic toán học, physics, rules dùng chung cho cả Client & Server
├── backend/
│   ├── package.json            # Quản trị workspace apps/*
│   └── apps/server/            # Authoritative Server (Node.js, Socket.IO, SQLite)
├── frontend/                   # Client 3D WebGL (Three.js, Pointer Lock, DOM UI)
├── nginx/                      # Cấu hình reverse proxy & static cache
└── docker-compose.yml          # Container hóa đồng bộ production
```

### 2.2. Chi tiết công nghệ từng tầng

```mermaid
graph TD
    subgraph Client["Frontend Client (Browser)"]
        UI["DOM HUD (Son Mai & Woodcut Theme)"]
        Three["Three.js 0.187 WebGL2 Engine"]
        Audio["Web Audio API (Spatial audio & procedural sfx)"]
        CSP["Client-Side Prediction (30Hz local step)"]
        Interpolation["Remote Entity Lerp & Smoothing"]
    end

    subgraph Shared["@folk-tag/shared (Isomorphic Library)"]
        Math["Vector3 & Collision AABB Math"]
        Rules["GAME_RULES & MOVEMENT_RULES"]
        Simulation["stepMovement() & initialMovement()"]
        CaptureLogic["validateCapture() & checkLineOfSight()"]
        MapSchema["VillageMap validation & SHA-256 Hashing"]
    end

    subgraph Server["Backend Server (Node.js)"]
        SocketIO["Socket.IO Server (Native & Mock namespaces)"]
        RoomManager["RoomManager & Lifecycle FSM"]
        TickLoop["30Hz Authoritative Tick / 15Hz Snapshot Broadcaster"]
        BotAI["Bot Navigation & Obstacle Avoidance"]
        Sec["RateLimiter, InputSanitizer & Session Tokens"]
        DB["DatabaseManager (SQLite / better-sqlite3)"]
    end

    Client -->|import| Shared
    Server -->|import| Shared
    Client <-->|Socket.IO: InputFrame @30Hz| Server
    Server <-->|Socket.IO: Snapshot @15Hz, GameEvent| Client
```

1. **`@folk-tag/shared`**:
   - Viết bằng TypeScript strict, biên dịch ra ES Modules (`dist/`).
   - Chứa toàn bộ hằng số game (`rules.ts`), định dạng gói tin wire contract (`protocol.ts`), thuật toán va chạm AABB 3D (`collision.ts`), hàm mô phỏng chuyển động `stepMovement()` đẳng hướng, bộ kiểm tra tầm nhìn `checkLineOfSight()`.
   - Đảm bảo logic vật lý hoàn toàn giống nhau giữa máy khách dự đoán và máy chủ thẩm quyền.

2. **`@folk-tag/server` (Authoritative Server)**:
   - **Engine**: Node.js v24+, TypeScript, Socket.IO 4.8.4.
   - **Vòng lặp mô phỏng**: Chạy độc lập ở tần số **30 Hz** (chu kỳ $33.3\text{ms}$). Đo đạc thực tế chỉ tiêu tốn trung bình **$0.65\text{ms}$** CPU time mỗi tick.
   - **Snapshot Broadcaster**: Phát gói tin đồng bộ thế giới game ở tần số **15 Hz** (chu kỳ $66.67\text{ms}$).
   - **Lưu trữ dữ liệu**: SQLite 3 (thư viện `better-sqlite3`), hỗ trợ chế độ persistent file trên disk hoặc in-memory `:memory:` khi chạy test suite. Lưu trữ toàn bộ bảng đấu, người chơi, chỉ số bắt/cứu, sự kiện ván đấu và báo cáo cân bằng game (Telemetry).
   - **Bảo mật & Phục hồi phiên (Reconnect)**:
     - Rate limiter chống spam gói tin (giới hạn 45 packets/s cho input, 5 packets/s cho action).
     - Token phục hồi phiên (`resumeToken`) xoay vòng (rotating token), cho phép người chơi bị mất mạng hoặc F5 tải lại trang có **$30\text{s}$ grace period** để kết nối lại đúng vị trí, ô giam và vai trò cũ.

3. **`@folk-tag/frontend` (Client)**:
   - **Engine đồ họa**: Three.js v0.187.0 trên nền WebGL2. Không dùng framework nặng (No React/Vue) để đạt hiệu năng tối đa và thời gian khởi động tức thì.
   - **Viewmodel & First-Person Camera**: Hệ thống tay góc nhìn thứ nhất mô phỏng chuyển động vung tay chân thực (idle sway, sprint swing, jump dip, land recoil, swipe capture animation).
   - **Client-Side Prediction (CSP) & Server Reconciliation**:
     - Client tính toán vật lý ngay lập tức ở 30Hz khi người chơi nhấn phím.
     - Lưu lại lịch sử 60 frames dự đoán gần nhất (`predictionHistory`).
     - Khi nhận snapshot từ server có `ackSeq`, đối chiếu vị trí thực của server và vị trí dự đoán; tự động bù trừ sai số mềm (visual error lerp) nếu sai số $<2.0\text{m}$, hoặc hard snap nếu bị server cưỡng bức dịch chuyển (teleport vào tù).
   - **Tối ưu hóa GPU & CPU**:
     - Main chunk được nén gọn còn **$124\text{ kB}$** (Three.js tách riêng vendor chunk cacheable $623\text{ kB}$).
     - Số lệnh vẽ (Draw calls) được tối ưu chỉ từ 41–73 calls, ~47K tam giác.
     - Shadow Map tính toán giới hạn ở 30Hz; tự động kích hoạt Page Visibility API đưa mức sử dụng CPU về **$0\%$** khi người dùng chuyển sang tab khác.

---

## 3. GIAO THỨC MẠNG & HỢP ĐỒNG DỮ LIỆU (NETWORK CONTRACT)

### 3.1. Gói tin từ Client lên Server (`game:input`)
Mỗi frame điều khiển client gửi lên server có cấu trúc tối giản:
```typescript
interface InputFrame {
  seq: number;           // Số thứ tự frame đơn điệu tăng dần (uint32)
  moveX: -1 | 0 | 1;     // Phím A (-1) / D (+1)
  moveZ: -1 | 0 | 1;     // Phím S (-1) / W (+1)
  yaw: number;           // Góc quay camera ngang (radians [-PI, PI])
  pitch: number;         // Góc ngẩng camera dọc (radians [-PI/2, PI/2])
  sprint: boolean;       // Đang giữ Shift chạy nước rút
  crouch: boolean;       // Đang giữ C cúi người
  rescueHeld: boolean;   // Đang giữ E giải cứu đồng đội
  jumpId: number;        // ID nhảy (tăng dần mỗi lần bấm Space)
  captureId: number;     // ID bắt (tăng dần mỗi lần click chuột trái)
}
```

### 3.2. Gói tin từ Server xuống Client (`game:snapshot`)
Server phát sóng trạng thái thế giới 15 lần/giây, được tùy biến riêng theo từng người nhận:
```typescript
interface Snapshot {
  protocolVersion: 1;
  matchId: string;
  tick: number;          // Số tick hiện tại của server
  phase: Phase;          // Trạng thái FSM ván đấu
  remainingMs: number;   // Thời gian còn lại của phase
  jailId: string | null; // Nhà giam đang kích hoạt ('J1', 'J2', 'J3')
  guardId: string | null;// ID cảnh sát đang trong vùng cấm 5m
  self: SelfPlayerView;  // Thông tin đầy đủ của bản thân (stamina, ackSeq, ackJumpId, v.v.)
  players: PlayerView[]; // Danh sách người chơi khác (ĐÃ LỌC BỎ người tàng hình theo role)
  jailedCount: number;   // Số cướp đang bị giam (0..4)
  result: MatchResult | null;
}
```

---

## 4. CHI TIẾT MÔI TRƯỜNG & TÀI NGUYÊN ĐỒ HỌA (MAP & ASSETS)

- **Kích thước bản đồ**: $80\text{m} \times 80\text{m}$ (tọa độ từ $-40$ đến $+40$ trên hai trục X và Z).
- **Tính toàn vẹn bản đồ**: Bản đồ được định nghĩa chuẩn trong file [village-v1.json](file:///d:/docuu/packages/shared/maps/village-v1.json). Cả Client và Server đều kiểm tra tính toàn vẹn qua mã băm **SHA-256**.
- **Danh mục 9 mô hình 3D GLB chuẩn**:
  1. `house_a.glb`, `house_b.glb`, `house_c.glb`: Nhà truyền thống Bắc Bộ, có nội thất bước vào được (`enterable`), 2 cửa thông trước sau không bị kẹt va chạm.
  2. `jail.glb`: Nhà giam kiên cố với 4 ô giam (`slots`) và 2 điểm neo cứu (`rescueAnchors`).
  3. `tree_a.glb`, `tree_b.glb`: Cây xanh bóng mát quanh làng.
  4. `bush.glb`, `haystack.glb`: Bụi cây rậm rạp và cây rơm làng quê (vùng nấp tàng hình).
  5. `fence_segment.glb`: Hàng rào gỗ thấp có thể nhảy qua được ($0.65\text{m}$).

---

## 5. HỆ THỐNG KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN (TEST SUITE VERIFICATION)

Dự án đạt tỷ lệ vượt qua **100% Pass** trên tất cả các tầng kiểm thử:

```
========================================================================================
MONOREPO QUALITY GATE VERIFICATION: 100% PASS (0 ERRORS, 0 WARNINGS)
========================================================================================
1. Typecheck:      TSC strict typecheck passed trên cả 3 package (Shared, Server, Client)
2. Lint:           ESLint . --max-warnings 0 (0 errors, 0 warnings)
3. Shared Tests:   58 / 58 passed (Toán học, va chạm, nội thất nhà, luật di chuyển 30Hz)
4. Server Tests:   29 / 29 passed (FSM, SQLite, AI Bot Navigation, Security, Telemetry)
5. Client Tests:   65 / 65 passed (16 test files: Models, Audio, Controls, Viewmodel, Scene)
6. E2E Scene:      10 / 10 passed (WebGL rendering, 9 models GLB, Pointer Lock, Routes)
7. Integration:     7 /  7 passed (capture.spec.ts: 5 tests, mock.spec.ts: 2 tests)
========================================================================================
TỔNG SỐ BÀI TEST TỰ ĐỘNG: 169 BÀI TEST — TẤT CẢ ĐỀU ĐẠT
========================================================================================
```

### Bảng phân tầng chi tiết:

| Tầng kiểm thử | Vị trí thư mục | Framework / Runner | Mục tiêu kiểm tra |
| :--- | :--- | :--- | :--- |
| **Shared Unit** | `packages/shared/tests/` | Node Test Runner | Quy tắc di chuyển, kiểm tra va chạm, logic bắt cướp, stealth, tính toán đường đi. |
| **Server Unit** | `backend/apps/server/tests/` | Node Test Runner | Máy trạng thái phòng, cơ sở dữ liệu SQLite, thuật toán né vật cản của AI bot, rate limiter. |
| **Client Unit** | `frontend/tests/unit/` | Vitest | Nạp 9 mô hình GLB, khởi tạo Three.js WebGL, hệ thống âm thanh, viewmodel FPS, la bàn mini-map. |
| **Client E2E** | `frontend/tests/e2e/` | Playwright (`chromium`) | Render canvas WebGL trên trình duyệt thật, resize, khóa chuột, di chuyển WASD, 24 tuyến cứu. |
| **Multiplayer Integration** | `frontend/tests/integration/` | Playwright (`chromium`) | 6 người chơi thật kết nối qua Socket.IO: Cảnh sát bắt cướp, vào tù J1, cướp cứu đồng đội, reload tab khôi phục phiên, chơi ván mới (rematch). |
| **Load & Playtest** | `backend/apps/server/src/scripts/` | tsx Script | Chịu tải 5 phòng cùng lúc (30 bot), mô phỏng 25 trận đấu liên tiếp để đo đạc chỉ số cân bằng. |

---

## 6. HƯỚNG DẪN VẬN HÀNH & PHÁT TRIỂN (DEVELOPER GUIDE)

### 6.1. Khởi động nhanh
```bash
# 1. Chạy 1-Click chế độ nhiều máy qua mạng LAN (Windows)
./CHAY_GAME_LAN.bat

# 2. Hoặc khởi động qua lệnh monorepo:
npm run dev           # Khởi chạy Authoritative Backend Server (Port 3001)
npm run dev:client    # Khởi chạy Frontend Vite (Port 5174)
```

### 6.2. Các lệnh kiểm thử chính từ thư mục gốc
```bash
# Chạy 152 bài Unit Tests (Shared, Server, Client)
npm test

# Chạy kiểm thử giao diện Client WebGL E2E
npm run test:e2e

# Chạy kiểm thử tích hợp nhiều trình duyệt thời gian thực
npm run test:integration

# Kiểm tra chất lượng mã nguồn & kiểu dữ liệu
npm run typecheck
npm run lint

# Đóng gói sản phẩm (Build toàn bộ 3 packages)
npm run build
```

---

## 7. CÁC ĐIỂM TRỌNG YẾU DÀNH CHO CLAUDE & CODEX KIỂM TOÁN (AUDIT FOCUS AREAS)

Khi Claude và Codex tiến hành kiểm toán mã nguồn, nên tập trung vào các chủ đề cốt lõi sau:

1. **Tính thẩm quyền và đồng bộ của Server (Authoritative State & Desync Prevention)**:
   - File trọng tâm: [room.ts](file:///d:/docuu/backend/apps/server/src/rooms/room.ts), [movement.ts](file:///d:/docuu/packages/shared/src/movement.ts), [game-session.ts](file:///d:/docuu/frontend/src/net/game-session.ts).
   - Kiểm tra cách client reconciliation xử lý khi độ trễ mạng (jitter/RTT) tăng đột biến. Kiểm tra tính chặt chẽ của `INPUT_STALE_TIMEOUT_MS: 600` và `ackSeq`.

2. **Cơ chế chống gian lận & Tàng hình (Anti-Cheat & Line-of-Sight Stealth)**:
   - File trọng tâm: [stealth.ts](file:///d:/docuu/packages/shared/src/stealth.ts), [capture.ts](file:///d:/docuu/packages/shared/src/capture.ts).
   - Xác nhận rằng server **không bao giờ** leak vị trí của cướp đang `HIDDEN` trong gói snapshot gửi cho cảnh sát khi khoảng cách $>2\text{m}$.

3. **Thuật toán điều hướng Bot AI (Pathfinding & Navigation)**:
   - File trọng tâm: [botAi.ts](file:///d:/docuu/backend/apps/server/src/rooms/botAi.ts).
   - Đánh giá khả năng né vật cản, phát hiện chướng ngại vật thấp để tự động nhảy (`jumpable obstacle detection`) và chiến thuật lạng lách đảo cánh khi tiếp cận nhà giam.

4. **Hiệu năng Render & Quản lý bộ nhớ (Memory Leaks & GPU Draw Calls)**:
   - File trọng tâm: [scene.ts](file:///d:/docuu/frontend/src/core/scene.ts), [main.ts](file:///d:/docuu/frontend/src/main.ts), [viewmodel.ts](file:///d:/docuu/frontend/src/player/viewmodel.ts).
   - Kiểm tra việc giải phóng bộ nhớ (`geometry.dispose()`, `material.dispose()`) khi teardown scene, cơ chế throttle tính toán shadow map ở 30Hz và xử lý Page Visibility API.

5. **Tính mở rộng của Backend (Scalability & Concurrency)**:
   - File trọng tâm: [roomManager.ts](file:///d:/docuu/backend/apps/server/src/rooms/roomManager.ts), [database.ts](file:///d:/docuu/backend/apps/server/src/db/database.ts).
   - Đánh giá khả năng scale theo chiều ngang (horizontal scaling qua Redis adapter cho Socket.IO trong tương lai) và độ an toàn của SQLite WAL mode khi chịu tải đồng thời nhiều phòng.

---

## 8. KẾT QUẢ KIỂM TOÁN TỪ CLAUDE & CODEX VÀ CÁC BẢN VÁ ĐÃ HOÀN TẤT (AUDIT REMEDIATION)

Sau đợt review chuyên sâu từ Claude và Codex, toàn bộ các phát hiện và những điểm còn tồn tại đã được khắc phục hoàn chỉnh, chuẩn xác giữa tài liệu và mã nguồn, kèm kiểm thử tự động toàn diện:

| STT | Vấn đề phát hiện | Mức độ | Trạng thái | Giải pháp kỹ thuật đã triển khai chuẩn xác |
| :--- | :--- | :---: | :---: | :--- |
| **1** | Endpoint tinh chỉnh luật & metrics mở công khai không xác thực | **Nghiêm trọng** | ✅ **Đã vá** | Middleware `verifyAdmin` hỗ trợ cả `Authorization: Bearer <token>` lẫn header `X-Admin-Token`. Tuyệt đối không chấp nhận token qua URL Query param để chống rò rỉ vào log. So sánh token bằng `crypto.timingSafeEqual` qua băm SHA-256. Nếu `ADMIN_TOKEN` chưa đặt, server tự động sinh token ngẫu nhiên bảo mật 48-hex ký tự và in ra console khi khởi động, đảm bảo endpoint không bao giờ bị hở kể cả khi chạy LAN. |
| **2** | Rò rỉ thông tin người chơi qua `GET /api/rooms/:code` và mã phòng đoán được | **Nghiêm trọng** | ✅ **Đã vá** | Dữ liệu trả về từ `GET /api/rooms/:code` được lọc tường minh (whitelist), chỉ trả về đúng 4 trường công khai: `{ id, name, ready, isHost }`. Triệt tiêu hoàn toàn `resume_token` và các metadata DB khác. Mã phòng 6 ký tự sinh bằng `crypto.randomInt`. |
| **3** | Khai thác Speedhack 1.5x do nạp 45 input frames/s | **Nghiêm trọng** | ✅ **Đã vá** | Triển khai ngân sách mô phỏng thời gian thực (`simulationStepBudget` 30Hz): mỗi tick 33.3ms tích lũy 1 bước, trần burst tối đa 2 bước để hấp thụ jitter. Frame vượt quota bị loại bỏ, tốc độ di chuyển bị khóa chặt ở 30 bước/s (sai số thực tế đo được $< 1.7\%$). Cấu hình cũ `MAX_CATCHUP_STEPS` đã được thanh lý dứt điểm. |
| **4** | Sự kiện ném sỏi làm lộ vị trí cướp nấp & Spam sỏi điều khiển bot | **Trung bình** | ✅ **Đã vá** | Server ẩn hoàn toàn `fromPos` và `senderId` khi phát sự kiện `GAME_PEBBLE_EVENT` cho Cảnh sát (chỉ nhận âm thanh va chạm tại `landingPos`). Vị trí ném lấy từ tọa độ server của người chơi, kẹp khoảng cách $\le 16\text{m}$. Bổ sung cooldown ném sỏi **6.0 giây** cho mỗi cướp (`PEBBLE_COOLDOWN_MS: 6000`), ngăn chặn triệt để hành vi spam sỏi để dắt mũi Bot cảnh sát. |
| **5** | Dung sai mạng bắt cướp & Tách bạch luật chơi cấu hình | **Trung bình** | ✅ **Đã vá** | Quy chuẩn luật cơ sở trong [rules.ts](file:///d:/docuu/packages/shared/src/rules.ts) là $1.6\text{m}$ và $55^\circ$. Server tính toán động ngưỡng dung sai mạng dựa trên biên độ: `CAPTURE_MAX_DISTANCE_M + Math.max(0, CAPTURE_NETWORK_TOLERANCE_DISTANCE_M - 1.6)` và `CAPTURE_MAX_ANGLE_DEG + Math.max(0, CAPTURE_NETWORK_TOLERANCE_ANGLE_DEG - 55.0)`. Giúp việc tinh chỉnh luật (`/api/rules/tune`) luôn có hiệu lực trực tiếp và co giãn cùng dung sai mạng. |
| **6** | Xử lý bước vật lý nhàn rỗi (Tránh double-gravity khi mạng jitter) | **Trung bình** | ✅ **Đã vá** | Bước vật lý nhàn rỗi (`idle step`) chỉ được kích hoạt khi người chơi thực sự bị **stale** (`isStale === true`, không gửi input $>600\text{ms}$ hoặc ngắt kết nối socket) để trọng lực kéo người chơi tiếp đất. Khi kết nối bình thường nhưng gặp jitter ngắn, server **không** chạy bước giả lập nhàn rỗi, loại bỏ triệt để hiện tượng thừa bước gia tốc trọng lực (double-gravity desync). |
| **7** | Bảo vệ Endpoint & Mock Server trên Production | **Trung bình** | ✅ **Đã vá** | Chuẩn hóa biến môi trường `ENABLE_MOCK_SERVER` (đồng thời tương thích với `ENABLE_MOCK`). Khi `NODE_ENV === 'production'`, Mock server bị tắt mặc định. Toàn bộ các endpoint nội bộ và thống kê: `/api/metrics`, `/api/stats/balance`, `/api/matches`, `/api/matches/:id` đều được bảo vệ bởi middleware `verifyAdmin`. |

