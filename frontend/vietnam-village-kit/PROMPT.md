# Prompt cập nhật game hiện tại
Bạn là senior game developer và technical artist. Hãy đọc code hiện tại trước khi sửa. Tích hợp thư mục vietnam-village-kit vào game hiện tại (ưu tiên Three.js nếu dự án đang dùng Three.js). Không viết lại game từ đầu, không thay đổi luật chơi, networking, điều khiển, trạng thái người chơi hoặc API hiện có trừ khi cần để tích hợp. Tạo branch riêng nếu có Git.

## 1. Asset và bố cục
- Đọc manifest.json, map.json và ảnh reference/. Dùng GLTFLoader tải GLB thật, cache model; clone mỗi instance. Nếu Vite, đặt bộ kit trong public/assets/village hoặc theo convention dự án. Không dùng hình concept làm texture thay cho mesh.
- Bản đồ 80 x 80 m, Y-up, 1 unit = 1 m. Dùng terrain_80m.glb, map.json làm bố cục khởi điểm. Điều chỉnh đường, vị trí nhà, cây để khớp concept; ưu tiên ngõ vòng, ít nhất hai lối thoát mỗi cụm nhà, sân trung tâm, rìa có ruộng/ao. Bổ sung cổng làng, cầu, giếng, đống rơm, bụi cây, ruộng lúa. Ao chỉ bố trí ở vùng phù hợp, không cắt lối đi; thêm collider hoặc cơ chế nước nếu cần.
- Giữ phong cách flat-shaded low poly, màu đất vàng, mái đỏ, tường kem, cây xanh, ánh sáng ấm. Hạn chế texture lớn, không chuyển sang realistic.

## 2. Nhà có thể đi vào
- Dùng nhà có lỗ cửa thực, floor, wall riêng. Dựa vào doorSocket trong manifest, gắn door_wood làm child của nhà, pivot tại bản lề, xoay local Y 0–95 độ trong 0.3–0.5s. Kiểm tra hướng mở và chỉnh offset nếu cần. Tương tác E hoặc nút cảm ứng khi trong khoảng 1.5m; không cho cửa kẹp người. Collider cửa cập nhật theo góc, không dùng bounding box của toàn bộ nhà vì sẽ chặn cửa. Collider tường, sàn và đồ nội thất tách riêng. Nếu game multiplayer đồng bộ trạng thái cửa theo ID với cơ chế hiện hữu.
- Bố trí bàn, ghế, giường, tủ, bếp, bàn thờ, chum; để lối đi rộng tối thiểu 1m, kiểm tra capsule của người chơi. Nhà hai tầng hiện chỉ có tầng trệt sử dụng; không mở tầng trên cho đến khi bổ sung cầu thang/collider. Roof có node riêng; chỉ ẩn mái nếu camera từ trên xuống, góc nhìn thứ nhất giữ mái.

## 3. Địa hình và ranh giới
- Dùng mesh địa hình có cao độ thật, không thay bằng mặt phẳng. Đường làng uốn cong, gợn nhẹ, có dốc thoải; tránh bậc bất ngờ. Terrain collider dùng trimesh hoặc heightfield tương ứng chính xác mesh. Raycast xuống terrain để đặt cây/props; sàn nhà nằm trên nền đã san hoặc thêm móng/bậc. Ground snapping, gravity, step offset khoảng 0.2m, giới hạn độ dốc hợp lý theo controller hiện hữu; test chạy, nhảy, leo dốc.
- Hàng rào tre/tường bao toàn chu vi, căn các đoạn theo cao độ hoặc thêm chân trụ; đặt cổng làng mang tính trang trí hoặc đóng ở rìa. Thêm collider ranh giới liên tục, cao hơn khả năng nhảy (invisible barrier nếu cần), không có khe thoát ở góc/cổng. Kiểm tra cả bốn cạnh và việc respawn nếu lọt ra ngoài. Không áp dụng ranh giới vô hình cho hàng rào thấp bên trong làng nếu luật cho phép nhảy qua.

## 4. Gameplay và UI
- Giữ gameplay hiện tại. Nếu là cảnh sát bắt cướp, giữ số người, thời gian, bắt/giải cứu và luật nhà giam hiện có. Tận dụng prison, haystack, bush; không tự thêm cơ chế làm thay đổi cân bằng. Bố trí spawn an toàn, không kẹt trong collider.
- Làm mới menu, HUD, pause, nút tương tác theo màu nâu gỗ, xanh lá, vàng kem. HUD gọn, hiển thị đúng trạng thái hiện có; minimap nếu có thì cập nhật theo bản đồ. Mobile dùng vùng chạm lớn, safe area, không che tầm nhìn; desktop giữ phím hiện hành. Không đưa logo hoặc text của ảnh concept vào game.

## 5. Hiệu năng và nghiệm thu
- Instance cây, hàng rào và vật lặp nếu phù hợp; không tải GLB lại mỗi lần spawn. Tách static/dynamic collider; frustum culling, hạn chế shadow và draw call; tái sử dụng geometry/material. Có loading state và xử lý lỗi asset. Đo FPS trên thiết bị mục tiêu, không tuyên bố đạt FPS khi chưa test.
- Chạy build/lint/test hiện có. Test cửa mở đóng, đi vào/ra nhà, nội thất không chặn lối, địa hình mấp mô không xuyên đất, hàng rào không thoát map, AI/navmesh (nếu có), gameplay và UI desktop/mobile. Báo file đã sửa, cách chạy, kết quả test thực tế và phần chưa hoàn thành. Không xóa asset cũ trước khi xác nhận bản mới hoạt động.
