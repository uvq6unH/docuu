# Tiến trình frontend — Cảnh sát bắt cướp

> Đọc file này đầu mỗi phiên làm việc frontend, đối chiếu repo thực tế rồi cập nhật trước khi kết thúc. Đây là sổ bàn giao lâu dài; tài liệu gốc và shared contract vẫn là nguồn quy định kỹ thuật/gameplay.

## 1. Trạng thái hiện tại

- Cập nhật: 20/11/2026 (Asia/Bangkok).
- Người phụ trách: bạn — B, frontend/client và art; Đức — A, server/shared.
- Đã hoàn thành M01–M04. Đã kiểm tra đủ 24 tuyến bằng mô phỏng nhân vật. Sân tập FPS offline dùng collider village-v1 và mô phỏng shared 30 Hz.
- Code ở `frontend/src/`, test ở `frontend/tests/`, tài nguyên ở `frontend/public/` và `frontend/assets/`. Hướng dẫn chạy ở [README frontend](README.md).
- Node 24.21.0, npm 11.19.0. Đã có `frontend/package.json`, lockfile và scripts dev/lint/typecheck/test/build/test:e2e/preview. Tại commit 679d578, backend có phòng thật, mô phỏng, bắt/cứu, resume, rematch và SQLite.
- F01 toàn repo **chưa hoàn tất**: backend có workspace riêng, frontend và packages/shared offline vẫn độc lập. Cả hai phía dùng protocol v1 ở packages/shared.
- A01 và A02 đã hoàn tất. Map và movement trong packages/shared ở gốc là chuẩn cho hai đội. Lobby N03 đã có create/join/ready/start và chọn jail. FE còn cần gọi room:resume khi mất mạng và hoàn thiện N04. MOCK01 vẫn dùng để kiểm tra transport.

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
| N03 | Lobby và Socket.IO transport | N01 | Create/join/ready, thông báo lỗi | ĐÃ NỐI PHÒNG THẬT |
| N04 | Prediction và remote interpolation | N02, M03 | Hai client đồng bộ, reconcile và reset buffer đúng | CÓ SNAPSHOT · CÒN PREDICTION/INTERPOLATION |
| G03 | HUD, phase UI và chọn jail cho captain | G01, N03 | Timer/role/count/selection đúng server | ĐÃ KIỂM TRA CHỌN JAIL, HEAD_START, PLAYING |
| G04 | Capture intent và jail render | G02 | Teleport authoritative hiển thị đúng | ĐÃ NỐI CAPTURE VÀ SNAPSHOT JAILED |
| G05 (AB) | Full match và restart | G02, G03, G04 | Không còn state/input/UI cũ sau rematch | TODO |
| R04 | Rescue bar, hide/crouch và guard feedback | R01, R02 | Prompt/progress reset đúng, không leak vị trí | ĐÃ CÓ HUD CƠ BẢN · CẦN E2E CỨU/GUARD |
| R05 | Spatial footsteps | N04 | Âm lượng theo movement; không leak hidden | TODO, P1 |
| A01 | Blender houses, trees | M04 | GLB đúng scale và budget | ĐẠT · 5 GLB đã kiểm tra trong Chrome |
| A02 | Jail, bush, haystack, fence | M04 | Art khớp metadata/collider | ĐẠT · 4 GLB |
| A03 | Avatar và basic animations | N04 | Nhận diện đội, skeleton độc lập | ĐẠT · Model Low-Poly Cảnh sát/Cướp, Animation đi/chạy/ngồi/ngồi tù |
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

### 19/11/2026 — N03, danh sách phòng từ F06

Bộ bàn giao và package chuẩn đã có trong commit 68d1899 trên origin/main. Khi kiểm tra, main là nhánh duy nhất trên origin; backend vẫn là F06. Ở chế độ dev, chọn Kết nối backend thử nghiệm rồi mở Phòng MOCK01 để xem tên, vai, chủ phòng và ready do server phát qua room:state. Danh sách sáu nhân vật bao gồm bot. FE đọc bytes bản đồ đang phục vụ và tính SHA-256; mock-map-hash được ghi rõ là giá trị thử nghiệm. Khi mất kết nối, FE xóa thông tin phòng cũ.

Phần hiển thị nằm ở src/net/room-details.ts. Test tích hợp hai phiên Chrome đã đối chiếu roster từ backend và hash trình duyệt với hash tính độc lập từ file. Bước tiếp theo là nối create/join và xử lý ack khi backend bàn giao N01 theo tài liệu ở gốc.
Kiểm tra đạt lint, typecheck, 43 unit test, 10 Chrome E2E, một bài tích hợp hai phiên Chrome và build. Vite cảnh báo chunk JS chính 644,35 kB.

### 20/11/2026 — Đánh giá bản 679d578 và nghiệm thu bắt giữ trong phòng thật

Bản main trên GitHub đã có lobby FE, HUD và backend cho tạo/join/ready/start, chọn nhà giam, capture, rescue, ẩn/canh, kết quả, rematch và resume. Đã build bản mới và chạy 48 test shared cùng 19 test server. Bản này cho phép thử với 2–5 người; phòng đủ sáu dùng 2 cảnh sát và 4 cướp.

Sửa FE nhận nhầm snapshot MOCK01 trên cùng socket với phòng thật, cập nhật danh tính sau ack tạo/vào phòng, chuyển HUD theo phase của snapshot, hiện trạng thái JAILED và lấy tổng cướp từ roster. Chế độ offline và công cụ khảo sát dev đã được kiểm tra lại.

Test phòng thật dùng hai Chrome và bốn peer Socket.IO. Host tạo phòng, các client join/ready, host start và chọn J1. Sau head start, cảnh sát dùng điều khiển FPS, đi bộ đến sát cướp và nhấn chuột trái. Chrome của cảnh sát thấy 1 / 4 bị giam; Chrome của cướp thấy trạng thái JAILED và vị trí X/Z -0,8/-0,8. Hai bài tích hợp phòng mock cũng đạt. Chạy lại bằng npm run test:backend trong frontend.

Thứ tự phát triển FE để chơi trọn ván:
1. Nối room:resume với resumeToken và roomCode; khôi phục danh tính sau mất mạng/tải lại trong cửa sổ 30 giây, xóa input và marker cũ, đặt lại seq theo contract. Kiểm tra người chơi trở lại đúng vai, vị trí và trạng thái bị giam.
2. Nghiệm thu bằng trình duyệt phần còn lại của vòng chơi: người thứ ba giữ E ở điểm cứu, cả hai thấy hồi sinh/miễn bắt, HUD tiến độ tự xóa, bắt đủ bốn hoặc hết giờ có kết quả, rematch trả đủ sáu người về lobby. Test backend đã phủ luật; chưa có bằng chứng E2E xuyên suốt cho chuỗi này.
3. N04 — dự đoán di chuyển local, reconcile bằng ackSeq, nội suy nhân vật khác và xóa buffer khi teleport/ẩn/đổi trận. Đo trên mạng có độ trễ rồi chơi thử sáu người trên sáu thiết bị.
Frontend đạt lint, typecheck, 43 unit test, 10 Chrome E2E sân tập, 3 bài tích hợp backend và build. Vite cảnh báo chunk JS chính 703,59 kB (gzip 182,97 kB). Chưa chạy playtest sáu người trên mạng thực.

### 20/11/2026 — Khôi phục phiên đang chơi

Đã nối room:resume trong src/net/game-session.ts và src/main.ts. FE lưu phiên theo tab, nhận token mới từ server, khôi phục bộ đếm input theo snapshot, xóa phím đang giữ và marker cũ khi mất mạng. Phiên hết hạn trả về menu. Hướng dẫn chơi đã cập nhật trong README.md.

Bài tests/backend/capture.spec.ts dùng ba trình duyệt và ba peer Socket.IO trong cùng phòng. Đã xác nhận người chơi trở về đúng phòng, đúng danh tính và đúng ô giam sau tải lại, rồi sau ngắt WebSocket. Cả hai lần server đổi token và sau kết nối lại server tiếp tục xác nhận input. Bài phiên hết hạn và hai bài mock đạt. Bài phòng thật dừng ở bước giữ E, HUD vẫn báo 1/4 bị giam sau 12 giây. Chưa nghiệm thu điểm thả, miễn bắt và rời phòng sau giải cứu.

FE đạt lint, typecheck, 43 unit test, 10 Chrome E2E sân tập và build. Build cảnh báo chunk chính 705,66 kB. Bộ tích hợp đạt 3/4. Đã tái hiện riêng trên server việc một tick rỗng xóa giữ E khi input mới 10 ms. Đã ghi cách tái hiện và tiêu chí sửa trong ../BACKEND_FE_HANDOFF.md.

Bước tiếp theo là chạy lại bài phòng sáu người khi BE sửa xử lý tick rỗng và kiểm tra HUD miễn bắt trong 3 giây sau giải cứu. Sau đó kiểm tra kết quả trận và rematch.

### 20/11/2026 — Đã nghiệm thu cứu người sau kết nối lại

Đã sửa R01 tại backend/apps/server/src/rooms/room.ts và bổ sung kiểm tra tick thiếu gói, nhả E, input hết hạn và khóa lần cứu tiếp theo tại backend/apps/server/tests/rescue_and_guard.test.mjs. Trong frontend/tests/backend/capture.spec.ts, Chrome xác nhận người vừa kết nối lại được cứu tại J1, số bị giam giảm từ 1/4 về 0/4, điểm thả X/Z là 3,5/0, HUD miễn bắt hiện rồi tắt và rời phòng xóa phiên trong tab.

Backend đạt typecheck, build và 19/19 test. Bộ tích hợp FE–BE đạt 4/4. Bước tiếp theo là kiểm tra kết quả trận và rematch trong phòng sáu người, gồm trở về lobby và xóa trạng thái ván cũ.

### Kiểm tra commit merge d4a3f92

Git đã giải quyết hết conflict. FE còn dấu đóng dư trong listener connect của src/net/game-session.ts và thiếu khai báo Credentials, sessionKey. Lint, typecheck, build FE thất bại. Đã mở bài Chrome phòng thật rồi dừng khi Vite báo lỗi cú pháp trước khi tạo phòng. 43/43 unit test FE, 48/48 test shared và 19/19 test backend đạt. Shared và backend build đạt, backend typecheck đạt.

Qua đọc code còn thấy rời MOCK01 giữ socket /mock khi tạo phòng thật, bộ test mock đọc prefix của namespace gốc, gợi ý bắt/cứu dùng ngưỡng rộng hơn server và server trừ dần tiến độ khi ra ngoài điểm cứu dù luật yêu cầu reset. Chưa nghiệm thu các tính năng mới trên Chrome. Bước kế tiếp là khôi phục khai báo phiên và sửa lỗi cú pháp trước khi chạy lại bài phòng sáu người.

### 20/11/2026 — Khôi phục luồng chơi sau merge d4a3f92

Đã sửa listener kết nối và khôi phục dữ liệu phiên trong game-session.ts. Sau khi rời MOCK01, người chơi có thể tạo phòng thật trong cùng tab. Lượt kiểm tra đầu phát hiện FE gửi thiếu mapHash khi bấm Sẵn sàng. FE hiện gửi lại SHA-256 của bản đồ đang phục vụ và phòng đủ sáu người đã bắt đầu được.

HUD dùng snapshot và hàm capture/rescue trong shared để kiểm tra cự ly, hướng nhìn, vật cản và trạng thái. Server xóa tiến độ ngay khi người cứu rời điểm hợp lệ. Test server kiểm tra ra khỏi phạm vi khi vẫn giữ E. Bộ test mock đọc snapshot từ namespace /mock. Kiểu sự kiện chung đã khai báo CAPTURE_MISS mà server đang phát.

Kiểm tra đạt lint FE, typecheck và build của FE/shared/backend, 43 unit test FE, 48 test shared, 19 test backend, 10 Chrome E2E sân tập và 4 Chrome E2E tích hợp. Trong phòng sáu người, Chrome xác nhận HUD bắt/cứu, tải lại và ngắt WebSocket khi bị giam, được cứu đúng điểm thả, HUD miễn bắt hiện rồi tắt và xóa phiên khi rời phòng. Vite cảnh báo gói JS chính 717,19 kB (gzip 187,66 kB). Bước tiếp theo là nghiệm thu màn hình kết quả và rematch sáu người trên Chrome.

### 20/11/2026 — Chơi qua IP LAN

Đã thêm dev:lan và hướng dẫn chạy trong README.md. Khi truy cập HTTP trên LAN, FE tự tính SHA-256 trên bytes bản đồ bằng js-sha256 nếu trình duyệt thiếu SubtleCrypto. Nút sao chép mã phòng hỗ trợ chọn mã thủ công khi Clipboard API không khả dụng.

FE đạt lint, typecheck qua build và 44 unit test. Backend build đạt. Đã chạy 4/4 bài tích hợp Chrome qua IP Wi-Fi 172.20.10.5 bằng PLAYWRIGHT_LAN_HOST, gồm phòng sáu người bắt, kết nối lại và cứu người. Các trình duyệt đều chạy trên máy chủ. Trang game cổng 5173 trả HTTP 200 và /healthz trả ok. Build FE có cảnh báo chunk chính 719,76 kB.

Bước tiếp theo là mở địa chỉ Network từ máy vật lý thứ hai cùng Wi-Fi, vào phòng bằng mã, bấm Sẵn sàng và xác nhận hai máy nhìn thấy nhau di chuyển.

### 20/11/2026 — Kết quả và chơi lại trong cùng phòng

Người dùng đã xác nhận hai máy qua LAN nhìn thấy nhau di chuyển. FE hiện hiển thị kết quả từ snapshot trong bảng phòng, tự thả chuột và ngừng gửi input ở pha RESULT. Chủ phòng thấy nút Chơi lại, khách thấy hướng dẫn chờ. Khi server đưa phòng về lobby, FE ẩn kết quả và HUD ván cũ. Hướng dẫn đã cập nhật trong README.md.

Bài Chrome mới ở tests/backend/capture.spec.ts dùng hai người và backend thật. Cảnh sát bắt cướp tại J1, cả hai thấy Cảnh sát thắng với lý do toàn bộ cướp đã bị bắt. Sau khi chủ phòng bấm Chơi lại, hai người giữ nguyên mã phòng, sẵn sàng lại, chọn J2 và cùng tới PLAYING với số bị giam 0/1. Đã đạt lint, typecheck qua build, 44 unit test FE, 5 bài tích hợp Chrome và 10 bài sân tập. Build cảnh báo chunk chính 720,50 kB. Ca hết giờ và hủy do mất kết nối chưa được nghiệm thu qua trình duyệt.

Bước tiếp theo là kiểm tra một ván hết giờ với cướp còn tự do, cả hai máy cùng thấy Cướp thắng và có thể chơi lại.

### 20/11/2026 — Nghiệm thu Cướp thắng khi hết giờ

Đã thêm bài Chrome hai người chờ ván hết 300 giây mô phỏng. Cả hai thấy Cướp thắng và lý do hết giờ, HUD hành động ẩn, chuột được thả. Chủ phòng bấm Chơi lại, hai người giữ mã phòng, sẵn sàng lại và vào PLAYING tại J3 với số bị giam 0/1. Đã xem ảnh timeout-host.png. Bài đạt trong 7,1 phút, lint FE đạt.

Lượt đầu chờ 330 giây nhưng HUD còn 14 giây nên bài hết thời gian chờ. Server dùng tick cố định để trừ đồng hồ, callback bị trễ khiến thời gian thực dài hơn luật 5 phút. Đã ghi bằng chứng trong ../BACKEND_FE_HANDOFF.md. Giới hạn chờ E2E hiện là 480 giây cho kết quả. Bước tiếp theo là sửa deadline thời gian thực ở backend theo luật, rồi chạy lại bài hết giờ để đo lại thời lượng.

### 21/11/2026 — Chi tiết vật liệu và cảnh làng

Theo yêu cầu tập trung đồ họa FE, đã thêm texture sinh bằng code cho mái ngói, tường vữa, khung tre/gỗ và rơm tại world/surface-detail.ts. Tải GLB sẽ áp vật liệu trong bộ nhớ. Đã thêm cỏ thấp quanh 15 cây và 6 cụm mây ở xa bằng hai InstancedMesh tại world/landscape-detail.ts. main.ts yêu cầu cập nhật shadow map sau khi toàn bộ mô hình tải xong. Đã xem ảnh toàn cảnh và ảnh a02-jail.png, làm nhẹ vân tường và xác nhận bóng nhà/cây hiện trên mặt đất.

Build gồm typecheck đạt. 52/52 unit test đạt. Bộ Chrome sân tập đạt 9/10, bài đi/chạy/cúi thất bại vì chờ data-eye nhưng main hiện không xuất thuộc tính đó. Kiểm tra riêng tải đủ chín model, không có lỗi trình duyệt, đạt sau chỉnh hình ảnh cuối. Lint vẫn có 10 lỗi từ trước tại audio, controls, main và script/test. Chưa đo FPS sau thay đổi. Build vẫn cảnh báo node:crypto và chunk JS lớn.

Bước tiếp theo là nghiệm thu góc nhìn FPS trên hai máy LAN, đo FPS rồi nâng tiếp chi tiết avatar và chuyển động theo phản hồi hình ảnh.

### 21/11/2026 — Biến thể nhà, cây, rào và rơm

Đã tăng scale hiển thị của bốn đống rơm lên 1,12 theo X/Z và 1,3 theo Y, tương đương cao khoảng 1,95 m. Hide zone authoritative vẫn cao 1,5 m nên phần đỉnh và viền lớn hơn là trang trí. Nhà được thêm chân tường, khung cửa, chốt cửa, kiểu chấn song, cửa chia ô hoặc giằng chéo, sống mái và ô thoáng đầu hồi. Màu tường/ngói thay đổi nhẹ theo ID nhà. Cây xoay tán theo ID, đổi sắc lá và có biến thể cây có quả. Rào có mối buộc và kiểu giằng khác nhau.

Chi tiết thêm được batch thành hai InstancedMesh ở world/object-detail.ts. Build gồm typecheck đạt, 52 unit test cũ đạt, hai Chrome test khảo sát cảnh và tải đủ chín GLB đạt. Đã xem ảnh a02-jail.png. Build còn cảnh báo node:crypto và chunk chính 738,62 kB. Chưa đo FPS trên hai máy sau khi thêm chi tiết.

Bước tiếp theo là chơi thử gần từng mẫu nhà/rơm/rào trên LAN và đo FPS để quyết định mức chi tiết phù hợp.

### 21/11/2026 — Nhà có nội thất và ba hình dáng mái

Theo yêu cầu mới của người dùng, đã chuyển 10 nhà thành nhà có cửa trước/sau rộng 1,6 m, cao 2,4 m. FE dựng tường, trần, tủ và ghế hộp từ các collider authoritative. Nhà có sàn ván, xà trần, khung cửa, cửa chớp hai mặt, chân tường, mái ngói chữ A/bốn phía/mái lệch và màu riêng. Renderer tại world/enterable-houses.ts. Mô hình Blender binary được giữ trong kho, hình ảnh nhà mới được sinh từ code. MapObject thêm footprint tùy chọn để duy trì hỗ trợ map cũ.

Map JSON hiện có 129 collider. Cần build shared/backend và khởi động lại backend, tải lại FE tất cả máy và tạo phòng mới. Đã cập nhật MAP_AND_ASSETS.md, GAMEPLAY.md và BACKEND_FE_HANDOFF.md. Hash LAN đã được sửa về tính SHA-256 từ bytes thực vì bản đồ đã đổi.

Kiểm tra đạt 58 test shared, 53 unit test FE, 24 test backend, typecheck/build FE và backend. ESLint các module world mới/được sửa đạt, toàn dự án còn 10 lỗi lint cũ. Bài bot test có thêm cleanup stop timer để không để simulation chạy sau test. Đã khôi phục dữ liệu debug trong DEV và điều chỉnh helper lái của E2E theo nhịp telemetry 10Hz.

Chrome đạt ba bài phòng thật gồm đi xuyên H03 trong hai phiên, bắt/cứu/reload trong phòng sáu người, và kết thúc/rematch. Hai bài đồ họa/đi-chạy-cúi-nhảy đạt. Đã xem house-interior.png và a02-jail.png. Những lượt thử đầu có lỗi điều khiển test/trace và tải lại lúc chỉnh source, các lượt cuối chạy ổn định đã đạt. Build cảnh báo chunk chính khoảng 748 kB. Chưa đo FPS với 129 collider và nội thất trên hai máy vật lý.

Bước tiếp theo là playtest qua LAN để kiểm tra độ sáng nội thất, các lối thoát và FPS khi đuổi bắt qua nhà.

### 22/11/2026 — Nâng cấp Bot AI định tuyến, Âm thanh không gian 3D, Điều khiển cảm ứng & Chế độ Khán giả

Theo yêu cầu phát triển tiếp tục (/goal) bám sát các yêu cầu chung có sẵn trong repo, đã hoàn thành đồng bộ 5 hạng mục nâng cấp toàn diện:
1. **Trí tuệ nhân tạo (Bot AI) & Né vật cản**: Tách module `backend/apps/server/src/rooms/botAi.ts`. Sử dụng dò tia cảm ứng (radial feelers) và truy vấn `fitsAt` để bot tự động né 129 collider nhà và phát hiện chướng ngại vật thấp để tự động nhảy qua. Bot Cảnh sát tuân thủ nghiêm ngặt luật stealth (`canPoliceSeeRobber`), không thể gian lận truy đuổi cướp đang nấp ngoài 2m; Bot Cướp biết chiến thuật đánh lạc hướng và bọc lót, tự động chọn điểm cứu (rescue anchor) đối diện với hướng Cảnh sát canh gác, và biết tìm bụi rơm/cỏ để nấp khi không có đồng đội bị giam.
2. **Âm thanh Không gian 3D (Spatial Audio) & Nhịp tim Hồi hộp**: Nâng cấp `frontend/src/core/audio.ts` hỗ trợ định vị tiếng bước chân 3D dựa trên góc phương vị và khoảng cách (`StereoPannerNode`), tự động suy giảm âm lượng và lọc tần số theo khoảng cách thực; bổ sung hiệu ứng nhịp tim dồn dập (dynamic heartbeat "lub-dub") khi cướp đang ẩn nấp hoặc bị cảnh sát tiếp cận trong bán kính 8m; bổ sung âm thanh môi trường gió thoảng và tiếng dế đồng quê Bắc Bộ bằng thuật toán tổng hợp Web Audio (0 KB tải ngoài).
3. **Hoạt ảnh Nhân vật (Action Animations)**: Mở rộng `CharacterAvatar` tại `frontend/src/player/character-avatar.ts` với trạng thái `action`: vươn hai tay về phía trước khi Cảnh sát ra tay bắt, và khom người hai tay mở chốt/cởi trói khi Cướp giải cứu đồng đội.
4. **Hỗ trợ Thiết bị Di động (Mobile Touch Controls & LAN)**: Thêm `frontend/src/input/touch.ts` với cần gạt ảo (Virtual Joystick) điều khiển hướng đi, vuốt nửa phải màn hình để xoay góc nhìn, và 4 nút cảm ứng nổi (Chạy nhanh, Nhảy, Cúi/Nấp, Bắt/Cứu) phục vụ bạn bè kết nối qua điện thoại trên mạng LAN.
5. **Chế độ Khán giả (POV Spectator Mode) & Bảng Cài đặt In-Game**: Cho phép cướp khi bị giam bấm phím mũi tên hoặc chạm màn hình để chuyển góc nhìn theo dõi đồng đội cướp còn tự do (`#spectator-hud`), không phá vỡ luật cấm Free-Cam. Thêm modal cài đặt ⚙️ tùy chỉnh độ nhạy chuột, FOV (60-100 độ), âm lượng và bật/tắt phím cảm ứng, tự động lưu `localStorage`.

Nghiệm thu kỹ thuật:
- Toàn bộ 142/142 bài kiểm thử tự động vượt qua (Shared: 58/58, Backend: 28/28, Frontend: 56/56).
- Chất lượng mã nguồn: 0 lỗi lint (`eslint . --max-warnings 0`).
- Build production TypeScript và Vite thành công 100%.

Bước tiếp theo: Khởi động server LAN (`node scripts/start-lan.mjs` hoặc `CHAY_GAME_LAN.bat`) và mời người chơi kết nối từ PC và điện thoại di động để playtest thực tế các tính năng mới.

### 22/11/2026 — Tích hợp Tương tác Đồng đội & Chiến thuật, Khí quyển & Trang phục Dân gian

Theo yêu cầu tích hợp toàn diện (/goal) tất cả các hạng mục cải tiến (ngoài mục 4 DevOps/Docker):
1. **Nhóm 1 (Gameplay & Tương tác đồng đội)**:
   - **Radio / Quick Chat (`1, 2, 3, 4`)**: Phím số nhanh gửi thông điệp chiến thuật có lồng vai trò ("Cứu tôi với!", "Bao vây đình làng!", "Phát hiện mục tiêu!", "Đang tới hỗ trợ!") kèm âm thanh Web Audio chime và feed tin nổi.
   - **Đánh dấu chiến thuật Tactical Ping (`Q` / Chuột giữa)**: Tạo vòng sóng radar 3D mở rộng tại mặt đất cùng beacon phát sáng trên minimap radar 2D chia sẻ cho đồng đội.
   - **Ném sỏi đánh lạc hướng Distraction Pebble (`F` / Chuột phải)**: Cướp ném viên sỏi tạo âm thanh va chạm lách cách và bụi đất; bot Cảnh sát trong phạm vi 12m tự động chuyển hướng tuần tra tới vị trí rơi để kiểm tra.
   - **Vinh danh MVP & Bảng số liệu cuối trận (`#match-result`)**: Server tự động tính toán authoritative danh hiệu MVP Cảnh sát (nhiều vụ bắt nhất) và MVP Cướp (nhiều lần cứu nhất / thời gian sống tự do lâu nhất), hiển thị thẻ vàng danh dự kèm bảng phân tích bắt, cứu, thời gian bị giam và quãng đường di chuyển.
2. **Nhóm 2 (Bản đồ & Môi trường)**:
   - **Động lực Khí quyển & Thời tiết (`setAtmosphere`)**: Tùy chỉnh ba trạng thái không gian làng quê: Ban trưa (`midday`), Hoàng hôn Bắc Bộ (`sunset` tông cam ấm, bóng đổ dài) và Sương sớm (`mist` tông xanh lạnh mờ ảo).
   - **Bộ chọn biến thể bản đồ phòng chờ**: Hỗ trợ chọn map layout biến thể (`village-v1` vs `market-v1`).
3. **Nhóm 3 (Trải nghiệm, Tân thủ & Cá nhân hóa)**:
   - **Chế độ Hướng dẫn 1 người chơi tương tác (Interactive Tutorial Mode)**: Trải nghiệm 3 bước hướng dẫn thực tế kèm checkpoint và thanh tiến trình: 1) Chạy vượt rào, 2) Cúi nấp trong đống rơm kiểm tra stealth, 3) Tiếp cận giải cứu hình nộm đồng đội bị giam.
   - **Trình duyệt phòng công khai (Public Room Browser)**: Hiển thị danh sách các phòng đang chờ trong sảnh với số người, tên chủ phòng và nút vào phòng 1-click.
   - **Tùy biến trang phục dân gian Low-poly**: Chọn phụ kiện đầu dân gian (Nón lá hình chóp, Khăn rằn Nam Bộ, Mũ nan) và 5 bảng màu áo bà ba truyền thống (nâu gụ, chàm, xanh rêu, vàng nhạt, xám tro) hiển thị đồng bộ 3D lên nhân vật.

Nghiệm thu kỹ thuật:
- Kiểm thử tự động: Đạt **146/146 tests** (Shared: 58/58, Backend: 29/29, Frontend: 59/59).
- Chất lượng mã nguồn: **0 lỗi, 0 cảnh báo lint** (`eslint . --max-warnings 0`).
- Build toàn bộ monorepo (`packages/shared`, `backend`, `frontend`) hoàn tất thành công 100%.

Bước tiếp theo: Triển khai playtest trải nghiệm thực tế cùng bạn bè qua LAN hoặc môi trường trực tuyến.
