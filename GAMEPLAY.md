# Gameplay & Game Design Document

## 1. Vòng chơi

LOBBY → JAIL_SELECTION (20s) → HEAD_START (15s) → PLAYING (300s) → RESULT → LOBBY.

1. Host tạo phòng, 6 người vào, ready; server chia ngẫu nhiên đúng 2/4. Host không được tự áp đội. Chỉ bắt đầu khi đủ 6 người ready.
2. Cảnh sát captain (người có joinOrder nhỏ nhất trong đội) chọn một trong J1/J2/J3. Cả hai cảnh sát biết vị trí; hết 20s mặc định J1. Chốt một lần. Cướp thấy nhà giam khi head start bắt đầu để có cơ hội lập kế hoạch. Không di chuyển ở giai đoạn chọn.
3. Cướp xuất phát trước 15s; cảnh sát khóa di chuyển; không bắt/cứu. Đồng hồ 5 phút bắt đầu sau head start.
4. Cảnh sát thắng ngay khi cả 4 cướp bị giam. Cướp thắng nếu hết 300s còn ít nhất 1 cướp tự do (kể cả đang miễn bắt). Không xét điểm để đổi thắng thua.
5. Kết quả 15s, hiển thị số bắt/cứu và thời gian, trở lại lobby, đội random lại; không giữ điểm liên trận.

## 2. Điều khiển desktop

| Phím | Tác dụng |
|---|---|
| WASD, mouse | Di chuyển, nhìn |
| Shift | Chạy nhanh nếu còn stamina |
| Space | Nhảy, chỉ khi grounded |
| Ctrl/C | Cúi người, vào vùng nấp |
| E (giữ) | Cướp cứu; cảnh sát đăng ký canh tù khi đứng gần vùng |
| Chuột trái | Cảnh sát chạm bắt; không có vũ khí |
| Esc | Nhả pointer lock, menu; trận online vẫn chạy |

Nhân vật bị giam chỉ được di chuyển trong vùng jail hoặc nhìn xung quanh; không nhảy ra, không tự cứu; không spectator tự do để tránh cung cấp thông tin.

## 3. Thông số khởi điểm (meter, second)

| Biến | Cảnh sát | Cướp |
|---|---:|---:|
| Walk speed | 5.2 | 4.8 |
| Sprint | 7.0 | 7.5 |
| Stamina max | 100 | 100 |
| Hao khi sprint/s | 20 | 16 |
| Hồi/s | 16 | 16 |
| Delay hồi sau sprint | 1.2s | 1.2s |
| Tốc độ crouch | 2.5 | 2.5 |

Capsule radius 0.35m, height 1.7m, crouch height 1.1m, camera 1.55m/0.95m. Gravity 18m/s², jump velocity 5.8m/s (đỉnh khoảng 0.93m); hàng rào nhảy được cao 0.65m, có 1.5m trống hai bên. Không double jump. Normalize input chéo, không tăng tốc khi nhảy, không sprint lúc crouch; stamina hết phải hồi tối thiểu 20 mới sprint lại.

## 4. Bắt giữ

- Chỉ police trong PLAYING, chuột trái (edge-trigger) gửi intent. Server kiểm tra role, cooldown 1.1s kể cả hụt, khoảng cách ≤1.6m giữa capsule center ngang, độ cao chênh ≤1m, hướng nhìn ±55 độ ngang và line-of-sight không qua tường.
- Chọn cướp hợp lệ gần nhất; nếu hòa chọn ID nhỏ nhất. Không bắt người JAILED hoặc IMMUNE. Cướp nấp vẫn bị bắt nếu đủ điều kiện.
- Thành công: chuyển cướp vào ô giam trống, clear velocity/input/rescue progress, lưu stat, phát event cho phòng. Không cần áp giải. Cảnh sát tiếp tục chơi, không teleport.
- Không tự động bắt bằng va chạm; cần bấm. Client chỉ render tay/animation, không quyết định kết quả.

## 5. Nhà giam và cứu

Chỉ một jail active; điểm ứng viên còn lại là khu trang trí, không guard zone/collider giam. Jail active có 4 slot, 2 điểm cứu ở hai mặt đối diện và 2 điểm thả bên ngoài; không phụ thuộc mở cửa hình ảnh.

- Cướp tự do đứng trong bán kính 1.25m của rescue anchor, giữ E liên tục 2s, nhìn về jail và có LOS tới anchor. Di chuyển khỏi phạm vi, thả E, bị bắt hoặc hết giờ sẽ reset tiến độ. Server tính bằng tick; không tin thời lượng client.
- Cứu 1 người bị giam lâu nhất; nếu hòa chọn ID nhỏ nhất. Chỉ 1 lượt cứu hoàn tất mỗi tick, các lượt giữ E còn lại reset; phải nhả E và giữ lại. Nếu không còn người giam, hủy progress.
- Người được cứu xuất hiện ở release anchor cùng phía người cứu, nếu bị vật cản dùng anchor đối diện; miễn bắt 3s tính theo server tick, vẫn di chuyển, không cứu trong 3s. Hết immunity chuyển FREE. Không miễn cho người cứu.
- Guard zone là bán kính 5m từ tâm jail; tại bất kỳ thời điểm chỉ 1 police được ở trong. Guard token do server cấp khi police đầu tiên bước vào; người thứ hai bị chặn ở mép bằng collider động. Token tự nhả ngay khi ra vùng hoặc mất kết nối. E gần vùng chỉ là intent nhận vai trò (UI), việc chiếm vùng tự động. Police không được nhảy vượt ràng buộc này. Guard có thể rời tự do đi săn. Hiển thị guard icon cho đội police.
- Không cho police chặn vật lý lối thả; player-player collision tắt (chỉ bắt qua action). Bên ngoài guard zone phải có ≥2 tuyến tiếp cận.

## 6. Nấp và truy đuổi

- Rơm/bụi cỏ có hide volume, không xuyên tường. Crouch trong volume liên tục 0.4s → HIDDEN; đứng, sprint, nhảy, thoát volume → FREE ngay. Đây là trạng thái hiển thị, không phải miễn bắt.
- Model cướp nằm thấp trong foliage; không nametag cho đối thủ; server không phát vị trí HIDDEN tới police ngoài 2m. Trong 2m gửi lại vị trí để có thể kiểm tra bụi. Đồng đội được nhận đủ thông tin. Không có radar đối thủ.
- Tiếng chân khi sprint lớn hơn walk; crouch nhỏ. Web Audio spatial audio; không âm thanh xuyên toàn map. Khuyến khích tai nghe, âm lượng tùy chỉnh.
- Fence 0.65m ai cũng nhảy qua được; cướp lợi thế bứt tốc, police lợi thế walk. Không route vòng vô hạn: có ngã rẽ, đường tắt, cụm nhà và sân trống.
- Một người giả vờ lao vào phía A để kéo guard, người khác vòng phía B giữ E 2s. Police còn lại phải đoán hướng cứu thay vì camp chung.

## 7. Trạng thái và ưu tiên tick

Robber: FREE / HIDDEN / JAILED / IMMUNE. Police: PATROL hoặc GUARD (derived). Connection là trạng thái riêng.

Thứ tự tick: timeout nếu deadline đã đến → cập nhật input/movement/guard → hết immunity → bắt giữ (theo police ID) → nếu đủ 4 JAILED kết thúc police thắng → cập nhật cứu (theo robber ID) → phát snapshot. Khi tick bắt đủ 4, không xử lý cứu sau đó. Sau RESULT không nhận gameplay action.

## 8. Mất kết nối

Reconnect token riêng, giữ slot 30s; input neutral ngay, cướp FREE/HIDDEN đứng tại vị trí và có thể bị bắt, người giam vẫn giam, immunity vẫn hết theo thời gian. Police offline không được guard. Không join người mới giữa trận. Quá 30s kết thúc ABORTED (không tính thắng thua), nếu kết quả hợp lệ đã kết thúc thì giữ kết quả. Lobby rời phòng thì nhả slot ngay, captain/host chuyển theo joinOrder.

## 9. Cân bằng

Mục tiêu tham khảo: thắng 45–55% sau đủ mẫu; thời gian bắt đầu tiên 30–90s; ít nhất 1 lần cứu/trận ở đa số trận; không jail nào quá chênh lệch. Thử mỗi vị trí jail, đổi phe, ghi dữ liệu. Nếu police thắng nhiều: giảm range 0.15m hoặc tăng cooldown; nếu robber thắng nhiều: giảm sprint robber 0.3m/s hoặc giảm thời gian đầu 5s. Mỗi vòng test chỉ đổi 1 nhóm biến. Không thay luật tùy ý giữa trận.

## Nhà có thể đi vào — 21/11/2026

Theo yêu cầu nâng cấp, người chơi đi vào nhà bằng cửa trước hoặc sau mở sẵn. Tường và nội thất có va chạm authoritative, chặn bắt xuyên tường. Trong nhà áp dụng cùng luật bắt, cứu, di chuyển và ẩn như ngoài sân. Nhà không tự tạo thêm vùng HIDDEN.
