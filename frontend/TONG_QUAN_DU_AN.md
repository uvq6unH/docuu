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
| Unit test FE | 52/52 |
| Test shared | 48/48 |
| Test backend | 24/24 |
| Build FE, gồm TypeScript | Đạt |
| Build backend | Đạt |
| Lint FE | Thất bại, 10 lỗi |
| Chrome và đo FPS trên bản hiện tại | Chưa chạy |

Build FE cảnh báo node:crypto bị externalize cho trình duyệt và chunk chính 733,65 kB. Tên commit có nhắc 60+ FPS, nhưng cần số đo trên cấu hình máy cụ thể để nghiệm thu.

## Điểm cần xử lý

1. room-details.ts hiện thử import node:crypto khi không có SubtleCrypto, sau đó trả hash cố định nếu lỗi. Trên HTTP LAN, phải tính lại SHA-256 từ bytes bản đồ thực.
2. Đồng hồ room.ts vẫn trừ theo timestep ở mỗi tick. Khi tick trễ, thời gian thực có thể vượt 5 phút như lượt thử trước.
3. Sửa 10 lỗi lint tại audio, controls, main, script kiểm tra và capture.spec.ts.
4. Chạy lại Chrome sau các thay đổi prediction, bot, avatar, tối ưu CPU. Đo FPS/frame time và tick p95.
5. Nghiệm thu sáu người thật, kết nối lại, chơi hết ván và rematch. Sau đó thử Internet HTTPS, kiểm tra tải và cân bằng qua nhiều trận.

BACKLOG.md vẫn ghi tất cả TODO và README còn mô tả kiến trúc ban đầu không có DB, trong khi implementation đã có SQLite và bot. Cần cập nhật tài liệu theo tiến độ thực.
