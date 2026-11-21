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
