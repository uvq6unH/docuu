# Hướng dẫn làm việc frontend

Áp dụng cùng hướng dẫn ở `../AGENTS.md`; đọc các tài liệu gốc theo yêu cầu trước khi sửa code.

- Đầu mỗi phiên, đọc `TIEN_TRINH.md` trong thư mục này và kiểm tra repo thực tế để tiếp tục đúng bước. Không coi bảng kế hoạch là bằng chứng đã có implementation.
- Người dùng phụ trách B: client/Three.js/FPS/map/art/UI. Làm một ticket mỗi bước; không tự triển khai backend/shared hoặc đổi gameplay/network contract.
- Theo yêu cầu người dùng, code và tài nguyên frontend đặt trong thư mục này. Trước F01 cần phối hợp đường dẫn workspace với A vì tài liệu chung còn dùng `apps/client`; xem mục 4 trong `TIEN_TRINH.md`.
- Giữ tài nguyên hình ảnh/âm thanh độc lập với authoritative map/collision; import shared thay vì sao chép protocol/rules/simulation. Ghi license tại `assets/LICENSES.md`.
- Trước khi kết thúc bước, cập nhật `TIEN_TRINH.md`: trạng thái, file đổi, kiểm tra thực chạy, blocker và việc tiếp theo. Không ghi kiểm tra thành công khi chưa chạy.
- Cuối mỗi câu trả lời cho người dùng luôn thêm **“Bước tiếp theo: …”**, nêu rõ một việc kế tiếp và điều kiện đang chờ nếu có.
