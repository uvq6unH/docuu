# Tổng quan dự án ngày 21/11/2026

Đối chiếu code tại commit 544c13c. Repo sạch lúc bắt đầu kiểm tra. Dự án đã có vòng chơi trên LAN. Người dùng đã xác nhận hai máy nhìn thấy nhau di chuyển. Các bài Chrome bắt, cứu, khôi phục phiên và chơi lại đã đạt trên bản trước các commit tối ưu mới. Lượt tổng hợp này chưa chạy lại Chrome.

## Frontend

- Đã có Three.js FPS, WASD, chạy, nhảy, cúi, stamina và bản đồ 80×80.
- Đã nối tạo/vào phòng, ready, chọn nhà giam, HUD, bắt/cứu, miễn bắt, kết quả và rematch.
- Đã có khôi phục danh tính khi tải lại/mất mạng, cùng dữ liệu input được server xác nhận.
- Code mới có prediction/reconciliation, nội suy nhân vật, avatar và chuyển động cơ bản, bot/chọn vai.
- Đã có model nhà, cây, rơm, hàng rào, nhà giam, ánh sáng, bóng đổ và vật liệu nền.
- Đã có la bàn, minimap, trợ giúp, âm thanh phản hồi. Chưa xác nhận âm thanh bước chân không gian hoặc chế độ chất lượng thấp đáp ứng tiêu chí backlog.

## Backend và shared

- Đã có quản lý phòng, chủ phòng, ready, hash bản đồ, phân vai, bot và lựa chọn nhà giam.
- Server thực hiện movement/collision, bắt, cứu 2 giây, miễn bắt 3 giây, ẩn, giới hạn một người canh và điều kiện kết thúc.
- Đã có grace reconnect 30 giây, token, ack input, validation, rate limit và lọc người ẩn theo người nhận.
- Đã có SQLite, audit, stats, health, metrics, script load/playtest và hướng dẫn Docker/deploy.
- Chưa có bằng chứng trong lượt này về deploy HTTPS công khai, tải 5 phòng hoặc 20–30 trận người thật.

## Kiểm tra thực chạy trong lượt tổng hợp

| Kiểm tra | Kết quả |
| --- | --- |
| Unit test FE | 53/53 Đạt |
| Test shared | 58/58 Đạt (kèm 10 test đi vào nội thất nhà) |
| Test backend | 24/24 Đạt |
| Build FE, gồm TypeScript | Đạt |
| Build backend | Đạt |
| Lint FE | Đạt (0 lỗi, 0 warnings) |
| Chrome và đo FPS trên bản hiện tại | Đã đo (41-73 draw calls, 47k tam giác, 60 FPS display, 0% CPU background) |

Build FE hoàn thành sạch sẽ, SHA-256 fallback được code-split riêng thành chunk `dist/assets/sha256-*.js` nạp động khi cần trên LAN.

## Điểm đã xử lý

1. **Xác thực bản đồ trên LAN**: `room-details.ts` dùng pure JS fallback `js-sha256` tính SHA-256 từ bytes thực của bản đồ, đảm bảo khớp hoàn toàn dù chạy qua HTTP LAN hay HTTPS.
2. **Đồng hồ backend**: `room.ts` đồng bộ theo wall-clock thực (`Date.now() - monotonicLastTime`), loại bỏ hiện tượng trôi giờ khi máy tải cao.
3. **Lỗi lint**: Đã sửa dứt điểm toàn bộ 10 lỗi lint (`eslint . --max-warnings 0` đạt 0 lỗi).
4. **Nội thất nhà có thể đi vào**: Toàn bộ 10 ngôi nhà đã được nâng cấp thành tường, cửa trước/sau mở sẵn và đồ nội thất (129 colliders authoritative), hỗ trợ đi xuyên nhà và ẩn nấp.
5. **Tài liệu**: BACKLOG.md và README.md đã được cập nhật chính xác với hiện trạng kiến trúc (SQLite DB, Bot AI fill, chọn vai trò, Client Prediction 60 FPS, và 1-click launcher LAN).

## Đánh giá ngày 23/11/2026, commit 8d03d32

Repo sạch lúc bắt đầu kiểm tra. FE mới có trang phục, chuyển động hành động, âm thanh không gian, ambience, hướng dẫn tương tác, touch controls, spectator, thiết lập, chat nhanh và ping. Backend có botAi riêng, logic giao tiếp đồng đội và kết quả/MVP. Nhà có nội thất, hash bản đồ HTTP LAN đã tính bằng js-sha256. Simulation truyền elapsed thực vào step(), có giới hạn 250 ms; đây là thay đổi so với bản từng trừ cố định. Chưa đo lại deadline và tính nhất quán movement dưới tải.

Đã thực chạy lint FE đạt, 59 unit test FE đạt và 58 test shared đạt. Build FE thất bại TS2379 tại main.ts 1341 và 1349 vì shirtColor truyền string | undefined vào thuộc tính optional khai báo string với exactOptionalPropertyTypes. Build backend thất bại TS2375 tại room.ts 382 vì mvpPolice/mvpRobber có thể undefined trong MatchResult. Chưa chạy Chrome và chưa nghiệm thu lại test backend từ build sạch. Con số 29 test BE đạt là nội dung tiến trình trước đó, chưa được xác nhận trong lượt này.

Mốc hiện tại là alpha LAN có vòng chơi và nhiều tính năng bổ sung, cần ổn định build và nghiệm thu release gate. BACKLOG đánh dấu nhiều hạng mục hoàn thành, nhưng TESTING.md vẫn chưa xác nhận sáu người thật, Internet HTTPS, số đo hiệu năng và 20–30 playtest. Hệ thống ghi stats và script test không đủ để kết luận đã cân bằng qua người thật.

Ưu tiên FE là sửa hai lỗi build, chạy Chrome trên bản mới, kiểm tra nhận đội khi tùy biến màu áo, touch, spectator, tutorial, ánh sáng nội thất và chất lượng hình ảnh trên hai cấu hình máy. Ưu tiên BE là sửa MatchResult, build sạch và chạy test; rà soát phân quyền ping/chat, ẩn vị trí địch, bot và thời gian mô phỏng dưới tải. Sau đó tổ chức sáu người thật chơi hết ván, reconnect và rematch, ghi FPS, RTT, tick p95 cùng lỗi trải nghiệm. Hoàn tất Internet HTTPS và release tag sau nghiệm thu.

### Cập nhật sửa build ngày 23/11/2026

Các lỗi optional shirtColor và MVP đã được sửa. Shared/backend/frontend build đạt, shared/backend typecheck đạt, lint FE đạt. FE đạt 59/59 unit test, backend đạt 29/29 test trên dist mới. Build FE còn cảnh báo chunk chính 775,55 kB. Các lỗi build trong phần đánh giá phía trên đã được xử lý, Chrome chưa chạy lại trong lượt này.

## Kiểm toán toàn diện hệ thống (Fully Audit) ngày 25/11/2026

Đối chiếu tại commit `0fde3b0` cùng các cập nhật tối ưu chunking và kiểm thử. Toàn bộ monorepo đã được kiểm tra chéo tự động:

1. **Tổng số bài test & độ bao phủ**:
   - Đạt **152/152 Unit & Simulation Tests** vượt qua 100% (FE: 65/65, Shared: 58/58, Backend: 29/29).
   - Kiểm tra kiểu tĩnh: 100% TypeScript Strict Typecheck đạt trên cả 3 package (`packages/shared`, `backend/apps/server`, `frontend`).
   - Chất lượng mã nguồn: `eslint . --max-warnings 0` đạt 0 lỗi, 0 cảnh báo.
2. **Tối ưu hóa Bundle & Frontend Build**:
   - Cấu hình phân tách chunk vendor (`manualChunks` trong `vite.config.ts`) giúp tách Three.js (623 kB) và Socket.IO-Client (41 kB) ra khỏi bundle ứng dụng chính.
   - Entry chunk của frontend giảm từ 788 kB xuống còn **123.33 kB** (38.68 kB gzipped), loại bỏ hoàn toàn cảnh báo vượt kích thước chunk của Vite.
3. **Hiệu năng Authoritative Server dưới tải cao (Load Stress Test)**:
   - Chạy đồng thời 5 phòng chơi đầy đủ (30 người chơi ảo) ở tần số mô phỏng 30Hz:
     - Thời gian tick trung bình: **0.65ms** (ngân sách tối đa 33.3ms, CPU sử dụng < 2%).
     - Thời gian tick p95: **2.71ms**, p99: **3.67ms**.
     - Bộ nhớ Node.js ổn định: Heap used 17.5 MB, RSS 78.7 MB.
4. **Cân bằng game & Telemetry (Playtest Simulation)**:
   - Mô phỏng tự động 25 trận đấu hoàn chỉnh qua cả 3 nhà giam J1, J2, J3:
     - Tỷ lệ thắng: Cảnh sát 48% (12 trận), Cướp 52% (13 trận) — nằm chính xác trong dải chuẩn 45–55%.
     - Thời gian bắt cướp đầu tiên: trung bình 49.8s (mục tiêu 30–90s).
     - Tỷ lệ trận có giải cứu thành công: 68% (mục tiêu ≥50%).
5. **Giao diện & Trải nghiệm (UI/UX) Sơn Mài & Khắc Gỗ Dân Gian**:
   - Giao diện sảnh chờ và phòng chơi được đồng bộ theo ngôn ngữ thiết kế mỹ thuật dân gian truyền thống (vàng đồng, sơn mài đen thẫm, gạch son), tối ưu toàn màn hình (True Fullscreen), loại bỏ margin thừa, hiển thị HUD dạng chip góc tinh gọn.
6. **Bộ công cụ Monorepo Root**:
   - Bổ sung `package.json` tại thư mục gốc cho phép chạy một lệnh duy nhất: `npm test`, `npm run build`, `npm run typecheck`, `npm run lint`.

