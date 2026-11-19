# Tiến trình frontend — Cảnh sát bắt cướp

> Đọc file này đầu mỗi phiên làm việc frontend, đối chiếu repo thực tế rồi cập nhật trước khi kết thúc. Đây là sổ bàn giao lâu dài; tài liệu gốc và shared contract vẫn là nguồn quy định kỹ thuật/gameplay.

## 1. Trạng thái hiện tại

- Cập nhật: 19/11/2026 (Asia/Bangkok).
- Người phụ trách: bạn — B, frontend/client và art; Đức — A, server/shared.
- Đã hoàn thành M01–M04. Đã kiểm tra đủ 24 tuyến bằng mô phỏng nhân vật. Sân tập FPS offline dùng collider village-v1 và mô phỏng shared 30 Hz.
- Code ở `frontend/src/`, test ở `frontend/tests/`, tài nguyên ở `frontend/public/` và `frontend/assets/`. Hướng dẫn chạy ở [README frontend](README.md).
- Node 24.21.0, npm 11.19.0. Đã có `frontend/package.json`, lockfile và scripts dev/lint/typecheck/test/build/test:e2e/preview. Backend commit 66695d1 có workspace riêng, shared và server mock F06.
- F01 toàn repo **chưa hoàn tất**: backend có workspace riêng, frontend và packages/shared offline vẫn độc lập. Kết nối mock dùng protocol v1 từ backend/packages/shared.
- A01 và A02 đã hoàn tất. Map và movement trong packages/shared ở gốc là chuẩn cho hai đội. Backend triển khai theo [bàn giao](../BACKEND_FE_HANDOFF.md); FE nối lobby N03 khi có N01. MOCK01 vẫn dùng để kiểm tra transport.

## 2. Yêu cầu làm việc đã ghi nhớ

1. Làm tuần tự từng ticket. Ngày 19/11/2026 người dùng cho phép tiếp tục một loạt bước trong phần frontend; có thể chuyển sang ticket frontend kế tiếp khi dependency đã đủ, vẫn ghi checkpoint từng bước. Không tự mở rộng sang server/shared.
2. Cuối mỗi câu trả lời luôn có **“Bước tiếp theo: …”** để người dùng biết việc sẽ làm. Nếu hữu ích, kèm câu nhắn có thể dùng cho lượt sau.
3. Sau mỗi bước cập nhật trạng thái, file đã đổi, kiểm tra thực sự đã chạy, blocker và bước kế tiếp vào file này. Không đánh dấu xong khi chưa có bằng chứng.
4. Code frontend và tài nguyên riêng của bạn đặt trong `frontend/` theo yêu cầu người dùng. Không đưa code server hoặc bản sao shared contract vào đây.
5. Đọc hướng dẫn repo và tài liệu liên quan trước khi sửa; giữ thay đổi của người dùng. Không thay gameplay/network contract riêng phía client.
6. Nếu thiếu server/shared, ghi dependency đang chờ; chỉ dùng mock/debug trong phạm vi ticket được giao, không tự triển khai phần của A.

## 3. Hiểu dự án

Game FPS multiplayer trên trình duyệt desktop, low-poly làng Bắc Bộ, không súng. MVP có 6 người (2 police/4 robber), map 80×80m, 10 nhà, 15 cây, 3 vị trí jail ứng viên và chỉ 1 jail active.

Vòng chơi: LOBBY → JAIL_SELECTION (20s) → HEAD_START (15s) → PLAYING (300s) → RESULT (15s) → LOBBY. Cứu cần giữ E 2s, miễn bắt sau cứu 3s, tối đa một police trong guard zone.

Stack dự kiến: Vite + Three.js + DOM/CSS, TypeScript strict, Socket.IO client; không cần React cho MVP. Server quyết định state, role, vị trí, timer, bắt/cứu và kết quả. Client lấy input, render, hiển thị UI, prediction từ mô phỏng shared và interpolation nhân vật khác.

### Ràng buộc frontend cần giữ

- WASD/chuột; Shift sprint; Space jump; Ctrl/C crouch; giữ E cứu; chuột trái gửi capture intent; Esc nhả pointer lock, trận vẫn chạy.
- Input/network theo protocol shared; không tự gửi tọa độ, thời lượng cứu, mục tiêu bắt hoặc kết quả để quyết định gameplay.
- Snapshot 15Hz, input 30Hz theo tài liệu; dùng simulation shared khi có, không viết bộ luật movement riêng cho client.
- Khi snapshot bỏ một đối thủ khỏi danh sách visible: xóa ngay mesh, âm thanh, nametag và buffer liên quan; không để lộ người đang nấp.
- Collider authoritative lấy từ map JSON chung, không suy ra từ GLB. Asset chỉ phục vụ hình ảnh.
- Không thêm account, shop, database, ranking, mobile hoặc framework ngoài phạm vi MVP.
- Mục tiêu render cần đo: compressed download ≤15MB, draw calls ≤150, visible triangles ≤150k, DPR cap 1.5. Đây là mục tiêu, chưa phải kết quả đã đạt.

## 4. Nơi đặt code và tài nguyên

Đã có scene/input và cấu hình chạy trong thư mục dưới đây; các thư mục tài nguyên chưa có model/texture/audio, `.gitkeep` chỉ giữ chỗ.

```text
frontend/
  AGENTS.md               # Quy tắc tiếp tục công việc frontend
  TIEN_TRINH.md            # Trạng thái, kế hoạch, nhật ký và bước tiếp
  README.md               # Cách chạy và kiểm tra frontend
  package.json            # Công cụ client độc lập; chưa là workspace toàn repo
  package-lock.json       # Khóa dependency đã kiểm tra bằng npm ci
  src/                    # main.ts, style.css, core/scene.ts, input/
  public/
    models/               # GLB xuất từ Blender
    textures/             # Texture/atlas dùng trên web
    audio/                # Âm thanh được phép sử dụng
  assets/
    blender/              # Nguồn .blend
    LICENSES.md            # Nguồn, tác giả, license, chỉnh sửa
  tests/                  # Unit và Chrome E2E
```

Đã có `src/core` và `src/input`; các module tiếp theo là `world`, `player`, `network`, `ui`, `audio`, chỉ tạo khi ticket cần dùng.

**Điểm phối hợp F01:** ARCHITECTURE/CONTRIBUTING và hướng dẫn F01 hiện dùng `apps/client`, `apps/server`, `packages/shared`; yêu cầu người dùng muốn phần frontend trong `frontend/`. Đã bootstrap package client độc lập tại `frontend/` theo yêu cầu đó, chưa đổi workspace/tài liệu chung/server/shared. Khi A hoàn tất F01, cần đưa package client này vào workspace và thống nhất lockfile chung, scripts, build/export/CI; không tạo client thứ hai. Không tự chuyển server/shared vào `frontend/`. F01 chưa được đánh dấu xong chỉ vì client đã chạy.

Asset tự làm ưu tiên primitive/graybox trước. Blender metric 1 unit = 1m; export GLB Y-up, pivot đáy giữa; ghi license trước khi thêm asset ngoài. Không tải model hoặc chỉnh binary sẵn có nếu chưa được yêu cầu.

## 5. Lộ trình frontend theo BACKLOG

Trạng thái: `CHỜ` = chưa triển khai, dependency chưa được xác minh xong; `TODO` = chưa triển khai. Thứ tự phải theo dependency thực tế, không chỉ theo bảng.

| Bước/ticket | Công việc của bạn | Điều kiện bắt đầu | Hoàn tất khi | Trạng thái |
|---|---|---|---|---|
| FE00 | Đọc tài liệu, tổ chức thư mục và sổ tiến trình | Không | Có sổ bàn giao và bước tiếp rõ ràng | XONG |
| F01 — phần client | Bootstrap Vite/TS strict/lint/test/build độc lập | Node/npm | npm ci và kiểm tra client chạy; workspace/CI chung do A làm | XONG PHẦN CLIENT; F01 CHUNG CÒN CHỜ |
| F04 | Three scene, ground 80×80, lights, FPS camera, resize | Công cụ client từ F01 | Canvas resize, scene chạy không lỗi | XONG LOCAL; CHỜ GHÉP WORKSPACE |
| F05 | Pointer lock, WASD/input abstraction, yaw/pitch | F04 | Chuột/phím đúng, clear on blur/unlock, cleanup | XONG LOCAL; CHỜ GHÉP WORKSPACE |
| M03 | FPS controller tích hợp movement shared | F05, M02 | Jump/sprint/crouch đúng luật shared | ĐẠT · Chrome E2E |
| M04 | Graybox map và debug collider overlay | F03, F04 | Layout 80m đi được, đúng metadata chung | ĐẠT · 24/24 TUYẾN ĐI BỘ |
| N03 | Lobby và Socket.IO transport | N01 | Create/join/ready, thông báo lỗi | ĐÃ NỐI MOCK F06 · LOBBY CHỜ N01 |
| N04 | Prediction và remote interpolation | N02, M03 | Hai client đồng bộ, reconcile và reset buffer đúng | CHỜ N02 |
| G03 | HUD, phase UI và chọn jail cho captain | G01, N03 | Timer/role/count/selection đúng server | CHỜ G01, N03 |
| G04 | Capture intent và jail render | G02 | Teleport authoritative hiển thị đúng | CHỜ G02 |
| G05 (AB) | Full match và restart | G02, G03, G04 | Không còn state/input/UI cũ sau rematch | TODO |
| R04 | Rescue bar, hide/crouch và guard feedback | R01, R02 | Prompt/progress reset đúng, không leak vị trí | CHỜ R01, R02 |
| R05 | Spatial footsteps | N04 | Âm lượng theo movement; không leak hidden | TODO, P1 |
| A01 | Blender houses, trees | M04 | GLB đúng scale và budget | ĐẠT · 5 GLB đã kiểm tra trong Chrome |
| A02 | Jail, bush, haystack, fence | M04 | Art khớp metadata/collider | ĐẠT · 4 GLB |
| A03 | Avatar và basic animations | N04 | Nhận diện đội, skeleton độc lập | TODO, P1 |
| D03 | Loading/options, tối ưu render/asset | A01, A02, A03 | Có số đo FPS và tải thực tế | TODO, P1 |
| D04 (AB) | Alpha 6 người qua Internet | D01 | Full match/reconnect chạy được | TODO |
| T01 (AB) | 20–30 playtests và feedback | D04 | Có log/feedback thực tế | TODO |
| T03 | Sửa UX/map/camera blockers | T01 | Feedback được xử lý và kiểm chứng | TODO |
| T04 (AB) | Release docs/tag | T02, T03 | Hướng dẫn release tái lập được | TODO |

F03 là ticket chung AB: B cùng review layout/map schema khi A triển khai; không tự tạo schema riêng. Các ticket server/shared khác do A phụ trách; chỉ cập nhật dependency ở đây khi đã kiểm tra mã thực tế.

## 6. Quy trình kiểm tra mỗi ticket

1. Kiểm tra file hiện có, hướng dẫn và script npm thực tế; xác nhận dependency.
2. Chỉ triển khai phạm vi ticket hiện tại; thêm test phù hợp với logic/biên và acceptance.
3. Chạy script có sẵn: lint, typecheck, test, build. Ghi nguyên tên lệnh và kết quả; thiếu script/tool thì ghi blocker.
4. Với canvas/UI/input: kiểm tra browser desktop, resize, pointer lock, blur/unlock, cleanup và console tùy phạm vi. Online kiểm tra nhiều tab và không leak hidden state.
5. Cập nhật nhật ký dưới đây, trạng thái bảng và mục “Trạng thái hiện tại”; trả lời ngắn gọn kết quả + bước tiếp theo.

## 7. Nhật ký làm việc

### 19/11/2026 — FE00: tổ chức công việc frontend

- Đã đọc: README, AGENTS, GAMEPLAY, ARCHITECTURE, NETWORK_PROTOCOL, MAP_AND_ASSETS, BACKLOG, TESTING, ROADMAP, CONTRIBUTING ở root.
- Đã tạo: `frontend/TIEN_TRINH.md`, `frontend/AGENTS.md`, `frontend/assets/LICENSES.md` và thư mục giữ chỗ cho code/tài nguyên/test.
- Không thay tài liệu gốc, backend hoặc file người dùng đang có. Chưa triển khai F01/F04/F05.
- Kiểm tra: liệt kê file/script và Git status. Git ban đầu báo dubious ownership; dùng `git -c safe.directory=D:/Projects/docuu ...` cho riêng lệnh kiểm tra, không đổi global config.
- Kiểm tra sau khi tạo: Git status chỉ có các file mới trong frontend; `git diff --check` không báo lỗi với diff tracked (file mới còn untracked). Kiểm tra đường dẫn tài liệu nguồn và 6 thư mục dự kiến bằng PowerShell đều OK.
- Lint/typecheck/test/build: chưa chạy vì repo chưa có package.json hay script. Chưa có browser test vì chưa có ứng dụng.
- Blocker: F01 chưa triển khai; đường dẫn workspace cần phối hợp với A như mục 4.
- Bước tiếp theo: kiểm tra môi trường Node/npm và điều kiện F01, chốt cách dùng `frontend/`; chỉ làm F04 sau khi scaffold sẵn sàng.

### 19/11/2026 — Đợt tiếp tục: bootstrap client → F04 → F05

- Người dùng yêu cầu “tiếp tục 1 loạt các bước”. Thực hiện tuần tự trong frontend; không đổi server/shared/gameplay/network contract.
- Checkpoint công cụ client: Node `v24.21.0`, npm `11.19.0`. Xác minh npm registry metadata và tài liệu Vite/Vitest/Three trước khi pin dependency; TypeScript `6.0.3` tương thích peer range typescript-eslint `8.73.0`. Không dùng TypeScript latest `7.0.2` vì nằm ngoài range đó.
- Tạo `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `.env.example`, TS strict, ESLint, Vite/Vitest, Playwright configs và README hướng dẫn chạy. Chưa làm root workspace hoặc CI/server/shared của A; không đánh dấu F01 chung hoàn tất.
- Checkpoint F04: scene ground 80×80, hemisphere/directional light, FPS camera cố định, ResizeObserver, DPR cap 1.5, zero-size guard, animation loop và dispose GPU tài nguyên. Lint/typecheck/2 unit test đầu tiên pass trước khi sang F05. Ground và chiều cao camera là render sandbox, không phải map/rules authoritative.
- Checkpoint F05: Pointer Lock API, mouse yaw/pitch clamp/wrap, WASD, Shift, crouch Ctrl/C, E held, jump/capture local edges. Reset input trên blur/unlock/tab hidden; không giữ lại action pending; xử lý lỗi/retry, late lock sau blur và teardown lặp an toàn. Chưa gửi InputFrame; khi có F02/M02 phải tích hợp shared, không tạo wire DTO riêng.
- UI có nút nhìn quanh, hướng dẫn điều khiển, trạng thái/lỗi WebGL; Escape thả chuột và trả focus. Input debug chỉ bật trong dev. HMR cleanup; không hủy renderer khi pagehide đi vào bfcache.
- Thêm `public/favicon.svg` primitive nội bộ và ghi vào LICENSES. Không tải model/texture/audio, không sửa binary hay file placeholder của người dùng.
- `npm install --no-fund --fetch-retries=0 --fetch-timeout=30000`: exit 0, added 169 packages, audited 170, 0 vulnerabilities.
- `npm ci --no-fund --fetch-retries=0 --fetch-timeout=30000`: exit 0, tái lập cài đặt từ lockfile; added 169 packages, audited 170, 0 vulnerabilities tại thời điểm chạy.
- Kiểm tra cuối sau npm ci: `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` exit 0, **3 test files / 16 tests pass** (scene/dispose/resize/DPR, input/edges, pointer lock/reset/retry/late completion/cleanup).
- `npm run build`: exit 0. Bundle JS `540.00 kB`, gzip `134.33 kB`; HTML `1.84 kB`, CSS `2.33 kB`. **Còn cảnh báo chunk >500 kB** từ Vite; chưa tối ưu code splitting của renderer trong đợt F04/F05, không nâng ngưỡng để che cảnh báo. Đây không phải phép đo FPS hoặc chứng minh đạt performance budget MVP.
- `npm run test:e2e`: **2 tests pass trên Chrome headless**, WebGL2 thật, viewport 1440×900 → 1024×768; canvas resize đúng, console không lỗi; click khóa chuột thật, giữ WASD/E, đổi hướng bằng chuột, Escape unlock và reset/focus đúng. Đã xem ảnh desktop/compact trong `test-results/` (gitignored); chưa kiểm tra Edge hoặc thủ công trên 6 máy.
- Trong quá trình kiểm tra: sửa type canvas trong E2E, favicon 404 và bổ sung handler Escape. Browser test lần đầu trong sandbox bị treo; xác minh rồi dừng đúng Vite PID do test tạo, chạy lại ngoài sandbox trên cổng test riêng 5174. Không dừng process khác. Cảnh báo `NO_COLOR/FORCE_COLOR` đến từ môi trường test launcher, không phải browser console.
- Quyền/network: npm registry trong sandbox báo ENOTFOUND; truy cập registry/cài dependency và chạy Chrome đã thực hiện qua cơ chế escalation được chấp thuận. Impeccable context launcher không chạy được vì không ghi cache ngoài workspace; dùng tài liệu dự án hiện có, không tạo thêm quy trình duyệt thiết kế.
- Bước tiếp theo: nhận/review F03 từ A để làm M04 (render graybox từ map JSON chung); M03 phải chờ M02. Không tự dựng một map JSON authoritative hoặc bộ movement riêng.

### 19/11/2026 — F03, review bố cục phía B

Tạo sơ đồ trong `assets/so-do-lang-v0.svg` từ các bảng tọa độ của MAP_AND_ASSETS.md. Sơ đồ dùng để review trước khi nhận JSON chung. Đã đối chiếu đủ 10 nhà, 15 cây, 3 vị trí nhà giam, 4 hàng rào, 4 đống rơm, 6 bụi và 6 điểm xuất phát.

Đã chạy kiểm tra hình học bằng Node trên tọa độ tài liệu. Với từng nhà giam được kích hoạt, hình tròn bán kính 0,35 m tại cả 6 điểm xuất phát và 4 điểm cứu/thả đều nằm trong biên và không đè nhà, thân cây, hàng rào hay footprint nhà giam. Cả 30 trường hợp đạt. Kiểm tra này chỉ xét khoảng trống tại điểm. Độ rộng đường và khả năng đi đến các điểm còn phải thử với map và collision shared.

M04 chờ JSON F03 của nhóm. Lượt này chỉ thêm tài liệu trực quan, chưa thay mã ứng dụng.

### 19/11/2026 — M04, bản xem trước trong dev

- Vite đọc bảng bố cục từ MAP_AND_ASSETS.md khi khởi động. Các primitive Three.js thể hiện nhà, cây, hàng rào, rơm, bụi và nền đánh dấu ba vị trí nhà giam.
- Trong mục **Khảo sát làng v0**, chọn Toàn cảnh hoặc J1/J2/J3 và bật khung vật cản dự kiến. Camera kiểm tra bố cục độc lập với vị trí nhân vật.
- Mã xem trước ở src/world/. Đã chạy lint, typecheck, build, 17 unit test và 3 Chrome E2E thành công. Ảnh kiểm tra ở test-results/village-overview.png. Build còn cảnh báo chunk Three.js 540 kB.
- M04 còn chờ map JSON và collider F03 để so sánh kích thước thật. Khả năng đi, nhảy và tiếp cận nhà giam cần simulation shared.

### 19/11/2026 — M04, khảo sát hai mặt của J1/J2/J3

Chọn một nhà giam trong mục Khảo sát làng v0 để hiện hai điểm cứu cách tâm 2,5 m, hai điểm thả cách tâm 3,5 m và đường biên canh 5 m theo thiết kế v0. Trở về góc sân hoặc toàn cảnh sẽ ẩn các mốc. Đã cập nhật village.ts, mount-preview.ts, unit test và Chrome E2E.

Lint, typecheck và build thành công. 18 unit test và 3 Chrome E2E đạt. Ảnh J2 ở test-results/jail-survey.png. M04 còn chờ map JSON F03 để kiểm chứng với collider chung. Thử đi tới điểm cứu cần mô phỏng M02.

### 19/11/2026 — M04, kiểm tra đường đến hai mặt nhà giam

Bổ sung tests/unit/jail-routes.test.ts. Tìm đường trên lưới 0,5 m với khoảng trống 0,35 m quanh nhân vật. Đường đi tránh nhà, cây, hàng rào và nhà giam, giữ khoảng cách ngoài vùng canh đến điểm cách tâm 6 m rồi tiến thẳng tới điểm cứu cùng phía. Cả 4 điểm xuất phát × 3 nhà giam × 2 phía đều có đường trên mặt đất của bố cục v0. Có test chặn trường hợp bước qua vật cản mỏng giữa hai đầu đoạn trống.

Lint, TypeScript và build đạt, 22 unit test đạt. Bundle Three.js vẫn báo vượt 500 kB. Bước tiếp theo là kiểm tra lại với collider F03 và thử đi bằng mô phỏng shared M02 khi có trong repo.

### 19/11/2026 — M04, xem từng tuyến cứu trong cảnh 3D

Trong mục Khảo sát làng v0, chọn J1/J2/J3, sau đó chọn điểm xuất phát và mặt Đông/Tây ở ô Tuyến cứu. Camera hướng về tuyến. Đường màu đỏ và độ dài tính theo mét hiển thị cho lựa chọn hiện tại. Ví dụ tuyến từ xuất phát 4 đến mặt Đông J2 dài 33,5 m trên lưới khảo sát 0,5 m.

Tách phép tìm đường từ bài test sang src/world/survey-route.ts cho preview dev và test dùng chung. Đã kiểm tra điểm đầu, cuối và khoảng trống dọc 24 tuyến. Lint, typecheck, build, 22 unit test và 4 Chrome E2E đạt. Ảnh: test-results/rescue-route.png. Vite còn cảnh báo chunk JS 540 kB. Khoảng cách thực tế trong trận cần đối chiếu với dữ liệu F03 và movement M02.

### 19/11/2026 — M04, đối chiếu vật cản từ JSON

Trong chế độ dev, dùng mục Đối chiếu vật cản từ JSON để nạp file cục bộ và xem các hộp xanh ngọc theo center/size của từng collider. Có thể gỡ lớp phủ và nạp lại. Dữ liệu tuyến đường vẫn lấy từ bố cục v0. Repo chưa có map F03 chính thức.

Đã kiểm tra dữ liệu mẫu, ID trùng, kích thước sai và chu trình nạp/lỗi/nạp lại/gỡ trong Chrome. Lint, TypeScript, build, 24 unit test và 5 Chrome E2E đạt. Build còn cảnh báo chunk JS 540 kB. Bước kế tiếp là đối chiếu bằng JSON thật và xác minh 24 tuyến trên collider F03.

### 19/11/2026 — M04, so sánh 24 tuyến khi nạp JSON

Bộ khảo sát chạy tìm đường ở worker, giữ spawn, nhà giam và lưới của v0 để đo riêng ảnh hưởng của vật cản mới. Bảng ghi chiều dài trước/sau, số tuyến bị chặn và số tuyến còn đi được nhưng đổi độ dài. Góc nhìn tuyến vẽ kết quả theo JSON. Gỡ file để trở lại v0.

Repo chưa có JSON F03 thật. Đã thử bằng file mẫu chặn toàn bản đồ và xác minh cả 24 tuyến bị chặn, sau đó gỡ file và khôi phục tuyến đang chọn. Lint, typecheck, build, 24 unit test và 6 Chrome E2E đạt. Bundle JS vẫn có cảnh báo 540 kB. Bước tiếp theo là chạy đối chiếu bằng file F03 thật và kiểm tra cả tọa độ spawn/anchor nếu bố cục thay đổi.

### 19/11/2026 — M04, đối chiếu tọa độ JSON

Báo cáo trong mục Tọa độ so với v0 so sánh điểm xuất phát theo thứ tự từng đội, tâm nhà giam theo ID, điểm cứu/thả theo tọa độ thế giới từ Tây sang Đông. File chỉ có colliders vẫn xem được, kèm thông báo thiếu tọa độ. Tính 24 tuyến vẫn giữ điểm đầu/cuối v0 để đo ảnh hưởng riêng của vật cản.

Đã kiểm tra bằng dữ liệu mẫu, gồm thay đổi chiều cao, đảo thứ tự anchor, trùng ID và thay file lỗi. Lint, TypeScript, build, 26 unit test và 6 Chrome E2E đạt. Build cảnh báo chunk JS 540 kB. M04 chờ JSON F03 chính thức để xác minh dữ liệu thật.

### 19/11/2026 — M04, khảo sát theo tọa độ JSON

Map phẳng 80×80 đủ 4 spawn cướp, J1/J2/J3, kích thước jail, bán kính canh và hai rescue anchor Tây/Đông sẽ dùng các giá trị này cho tuyến JSON. Dữ liệu thiếu hoặc ngoài phạm vi hỗ trợ dùng chế độ đối chiếu collider với mốc v0. Phía v0 của bảng vẫn giữ bố cục ban đầu. Kết quả là khảo sát đường đi 2D.

Đã kiểm tra spawn lệch lưới, nhà giam dịch chuyển, anchor đảo thứ tự, dữ liệu thiếu và ID trùng. Mẫu minh họa trong Chrome cho kết quả 8,8 m. Lint, typecheck, build, 28 unit test và 7 Chrome E2E đạt. Vite vẫn cảnh báo chunk JS 540 kB. Chưa có map chính thức trong repo. Tiếp theo chạy nghiệm thu với F03 thật, sau đó kiểm chứng đường đi bằng M02.

### 19/11/2026 — M04, đồng bộ mốc 3D với tuyến JSON

Nạp bố cục hợp lệ sẽ dời và đổi kích thước cả ba nền nhà giam theo file. Khi chọn một nhà giam, vòng canh dùng bán kính nhập, các điểm cứu và điểm thả dùng tọa độ thế giới. Chỉ vẽ điểm thả khi có đủ cặp hợp lệ. Gỡ file sẽ khôi phục nền, mốc và bán kính v0. Phép so sánh tuyến luôn dùng bản lưu footprint v0 làm chuẩn.

Đã kiểm tra bằng dữ liệu mẫu với nhà giam dời tâm, thay kích thước và bán kính, có hoặc thiếu điểm thả. Lint, typecheck, build, 29 unit test và 7 Chrome E2E đạt. Build còn cảnh báo chunk JS 540 kB. Chưa có map F03 chính thức trong repo để nghiệm thu M04.

### 19/11/2026 — M04, giảm thời gian tính lại 24 tuyến

Bốn điểm xuất phát dùng chung một lần duyệt lưới cho mỗi mặt nhà giam. Cả phép so sánh hai bố cục cần 12 lượt tìm đường thay cho 48 lượt. Các ô và ô cha dùng chỉ số nguyên trong mảng. File đổi: src/world/survey-route.ts, src/world/compare-routes.ts và tests/unit/survey-layout.test.ts.

Đo riêng compareRoutes trong Node trên cùng máy, dùng vật cản v0 ở cả hai vế, sau một lượt làm nóng. Năm lượt trước: 357, 427, 503, 354, 469 ms. Sau: 102, 44, 42, 38, 40 ms. Trung vị 427 → 42 ms. SHA-256 của JSON kết quả giống nhau, gồm thứ tự, tọa độ và độ dài của 24 tuyến. Chưa đo thời gian toàn bộ thao tác nạp file hay FPS.

Lint, typecheck, build, 30 unit test và 7 Chrome E2E đạt. Đã kiểm tra trường hợp spawn trùng và một spawn bị chặn trong cùng lượt. Vite còn cảnh báo chunk JS 540 kB. Repo chưa có JSON F03 để nghiệm thu M04.

### 19/11/2026 — F03, schema và map shared

Đã tạo [village-v1.json](../packages/shared/maps/village-v1.json) và [map.ts](../packages/shared/src/map.ts). JSON có 39 vật thể, 29 collider tĩnh, 10 vùng nấp, 3 jail và 6 spawn. Anchor và slot là tọa độ thế giới. Chọn chiều cao vùng nấp bụi 1,1 m vì tài liệu chỉ cố định footprint 2×2 m.

Shared đạt typecheck, 19 unit test và build. Frontend đạt lint/typecheck, 30 unit test và build (cảnh báo chunk JS 540 kB). Dùng công cụ khảo sát hiện có trên JSON thật: 24/24 tuyến tới được điểm cứu, độ dài khớp v0 trên lưới khảo sát. Bước sau là tích hợp nguồn JSON này vào cảnh M04.

### 19/11/2026 — M04, tích hợp nguồn map F03

Cảnh dev và bản build dùng village-v1.json qua validateMap. Mesh theo asset, pos, yaw, scale của object. Khung va chạm theo center/size của collider shared. Các điểm xuất phát và mốc nhà giam lấy từ cùng map. Đã bỏ phần đọc bảng Markdown khi chạy Vite.

Lint, typecheck, 31 unit test và 7 Chrome E2E đạt. Các test đường đi bao phủ 24 tổ hợp. Đã mở bản production trên Chrome, thấy nhà và cây, console không lỗi, không có bảng khảo sát dev. Build có cảnh báo chunk JS 557,62 kB (gzip 140,35 kB). Ảnh ở test-results/village-production.png. Di chuyển và thử va chạm thực tế chờ M02.

### Mẫu ghi nhật ký

- Ngày / ticket:
- Mục tiêu và phạm vi:
- File đã thay đổi:
- Kết quả đã đạt:
- Lệnh/test thực chạy và kết quả:
- Chưa làm / blocker / quyết định cần phối hợp:
- Bước tiếp theo:

## 8. Tài liệu nguồn

- [README](../README.md), [hướng dẫn agent](../AGENTS.md), [quy ước nhóm](../CONTRIBUTING.md).
- [Gameplay](../GAMEPLAY.md), [kiến trúc](../ARCHITECTURE.md), [protocol](../NETWORK_PROTOCOL.md), [map và assets](../MAP_AND_ASSETS.md).
- [Backlog](../BACKLOG.md), [roadmap](../ROADMAP.md), [test plan](../TESTING.md).













### 19/11/2026 — M01, M02 và M03

M01 xử lý va chạm capsule với collider JSON và biên sân. M02 cập nhật di chuyển, nhảy, cúi và thể lực theo vai ở 30 Hz. M03 nối bàn phím và camera FPS với cùng mô phỏng trong sân tập offline. Chọn spawn cướp đầu tiên để thử điều khiển.

Shared đạt typecheck, build và 24 unit test, gồm replay, hồi thể lực, trượt dọc tường và nhảy hàng rào F01 trên map thật. Frontend đạt lint, typecheck, build, 31 unit test và 8 Chrome E2E. Bài M03 kiểm tra thay đổi vị trí, tiêu thể lực, hạ camera khi cúi và đáp đất sau khi nhảy. Vite cảnh báo chunk JS trên 500 kB. Nghiệm thu M04 còn phần đi hết 24 tuyến bằng capsule.

### 19/11/2026 — Sửa góc nhìn khi lia nhanh và nghiệm thu M04

Điều khiển FPS gom chuyển động chuột theo khung hình, giới hạn tín hiệu đột biến và xóa phần chờ khi thả chuột. Camera giữ độ nhạy cũ với chuyển động nhỏ. Đã kiểm tra tín hiệu lớn liên tiếp trên Chrome bằng sự kiện mô phỏng khi con trỏ thực sự bị khóa.

Bài test đường đi dùng stepMovement đưa nhân vật từ bốn spawn cướp đến hai điểm cứu của cả ba nhà giam. Đạt 24/24 tuyến bằng cách đi bộ. Frontend đạt lint, typecheck, 32 unit test, 9 Chrome E2E và build. Vite cảnh báo gói JS 560,95 kB. Bước kế tiếp là A01, làm mẫu nhà và cây.

### 19/11/2026 — A01, nhà và cây Blender

Đã lưu 3 nhà mái ngói và 2 cây ở assets/blender, bản GLB ở public/models. Nguồn và quyền sử dụng ghi ở assets/LICENSES.md. load-village-models.ts đặt các mẫu theo village-v1, dùng instancing cho 10 căn nhà và 15 cây. Mỗi nhà có 1.284 tam giác, mỗi cây có 500, hai vật liệu mỗi mẫu. Lint, typecheck, 37 unit test, 10 Chrome E2E và build đạt. Ảnh toàn cảnh ở test-results/a01-village.png. Vite cảnh báo chunk JS 644,08 kB (gzip 164,30 kB). Bước tiếp theo là A02.

### 19/11/2026 — Đánh giá backend 66695d1 và nối F06

Commit local trùng HEAD trên origin khi kiểm tra. Backend có workspace TypeScript strict, Express /healthz và Socket.IO. F01 còn thiếu CI chung, lint và test backend. F02 có types, tên sự kiện và constants, thiếu kiểm tra payload runtime đầy đủ và schema tests. F03 có map và validator chạy đạt trên JSON của backend. M01/M02 có hàm collision, LOS, movement và stamina nhưng mock không gọi stepMovement. Chưa có bộ test nghiệm thu riêng cho các hàm đó trong backend.

F06 hoạt động với sáu danh tính mẫu, room:state, game:input, game:snapshot 15 Hz và ackSeq. FE đọc protocol từ backend, render các nhân vật khác từ snapshot, gửi intent và lấy vị trí bản thân từ server. Vào bằng liên kết thử nghiệm trong dev. Hướng dẫn chạy hai terminal ở README.md.

N01 còn thiếu quản lý/phân lập phòng, cấp slot duy nhất, ready, host/start và resume. Mock gán ID theo số socket đang mở nên có thể trùng sau khi người chơi rời phòng hoặc khi đông client. N02 còn thiếu tick mô phỏng 30 Hz độc lập với tần suất gửi input, kiểm tra thứ tự/giới hạn input và xử lý input cũ. Các tốc độ trong handler mock dùng profile cảnh sát cho cả hai vai. G01/G02, R01–R03 chưa có luồng chơi thật: chọn jail, head start, bắt, cứu, ẩn, canh, kết quả và khôi phục phiên. dev và dev:mock cùng chạy mock.

Hai bản village-v1 có cùng spawn, jail và hình học của 29 collider nhưng hash khác nhau. Backend có 25 objects, bản offline có 39, sáu hide zone bụi cỏ có hình học khác. A04 có hàm hash nhưng mock gửi mock-map-hash. Để chuyển sang trận thật cần chốt map và mô phỏng dùng chung, sau đó làm N01/N02. Chế độ dev chỉ nhận phòng mock v1 đã định danh.

Kiểm chứng: backend npm ci/build/typecheck đạt, validator trả valid=true. Test hai phiên Chrome qua proxy thật đạt: /healthz trả ok, hai client nhận danh tính riêng, ack tăng, phiên thứ hai nhận vị trí mới của phiên thứ nhất. Lệnh tái hiện trong frontend là npm run test:backend.
Frontend đạt lint, typecheck, 37 unit test, 10 Chrome E2E offline và build. Vite tiếp tục cảnh báo chunk chính 644,09 kB.

### 19/11/2026 — Chốt chuẩn FE và hoàn thành A02

Đã ghi quyết định cùng kế hoạch backend ở BACKEND_FE_HANDOFF.md tại gốc repo và liên kết từ README chung. File map được cố định LF để hai hệ điều hành tính cùng hash. Backend cần chuyển sang package shared gốc rồi bàn giao N01 cho FE nối lobby N03.

Đã dựng và xuất bốn mẫu Blender trong frontend/assets/blender và frontend/public/models. Bụi cỏ 160 tam giác, rơm 280, rào 120, nhà giam 880. Cảnh đọc 14 vật thể rơm/bụi/rào từ map; mô hình nhà giam theo vị trí khảo sát offline hoặc jailId của server mock. Test xác nhận kích thước, ngân sách và ưu tiên snapshot khi chọn jail.

Shared đạt typecheck, 24 test và build. Frontend đạt lint, typecheck, 42 unit test, 10 Chrome E2E, test tích hợp hai phiên với backend mock và build. Đã xem ảnh test-results/a02-jail.png. Build còn cảnh báo chunk JS 644,35 kB. Các thay đổi bàn giao mới có trong workspace local.
