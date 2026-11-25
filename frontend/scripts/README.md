# Frontend Scripts & Benchmarking Tools

Thư mục chứa các kịch bản tự động hóa phục vụ đo kiểm hiệu năng đồ họa (FPS, CPU, bộ nhớ) và ghi lại hình ảnh minh họa cho các tính năng trò chơi.

## Danh mục kịch bản

### 1. Đo kiểm hiệu năng & Tối ưu hóa (Benchmarks)
- **`measure-fps.mjs`**: Đo tốc độ khung hình thực tế (FPS), thời gian dựng frame (frame time p50/p95) và số lệnh vẽ (draw calls / geometries / textures) qua 120 frames liên tiếp.
- **`compare-hardware-accel.mjs`**: So sánh hiệu năng khi bật/tắt tăng tốc phần cứng GPU trên trình duyệt.
- **`test-cpu-optimization.mjs`**: Đo mức tiêu thụ CPU và hiệu quả của các cơ chế sleep / pause khi cửa sổ trình duyệt bị ẩn hoặc không hoạt động.
- **`test-smooth-movement.mjs`**: Kiểm tra độ mượt của thuật toán nội suy chuyển động (interpolation) và bù trừ sai số dự đoán (reconciliation).

### 2. Ghi hình & Kiểm tra trực quan (Showcase & Demos)
- **`demo-viewmodel-and-spectator.mjs`**: Tự động ghi lại hoạt họa vung tay, chuyển động camera FPS và góc nhìn khán giả (spectator mode).
- **`capture-showcase.mjs`**: Chụp lại các góc cảnh quan làng quê, ánh sáng đổ bóng và các công trình kiến trúc.
- **`capture-bots-and-roles.mjs`**: Chụp lại giao diện chọn vai, danh sách bot và phòng chờ trận đấu.
- **`capture-closeup.mjs`**: Chụp cận cảnh mô hình nhân vật, trang phục dân gian và chi tiết môi trường.
- **`run-demo-capture.mjs`**: Kịch bản tự động chạy một tình huống cảnh sát tiếp cận và bắt cướp.
- **`test-spectator-capture.mjs`**: Kiểm tra hoạt động của camera theo dõi góc nhìn thứ nhất và thứ ba khi người chơi bị bắt giam.
- **`verify-overhaul.mjs`**: Kịch bản kiểm tra khói (smoke test) sau các đợt nâng cấp giao diện và đồ họa lớn.

## Cách chạy
```bash
# Đảm bảo server/client đang chạy, sau đó thực thi qua Node.js:
node frontend/scripts/measure-fps.mjs
```
