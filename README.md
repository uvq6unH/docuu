# CẢNH SÁT BẮT CƯỚP — Phiên bản Alpha v0.1

Game dân gian Việt Nam, multiplayer FPS 3D trên trình duyệt, đồ họa low-poly. Không súng, không sát thương, không cướp tiền. Trọng tâm: chạy đuổi, cắt đuôi, nấp rơm/bụi cỏ và giải cứu đồng đội khỏi nhà giam.

## Tổng quan tính năng đã hoàn thiện

- **Quy mô ván chơi**: 6 người (2 Cảnh sát + 4 Cướp) hoặc linh hoạt từ 2–6 người với hệ thống **Bot AI tự động bù slot**.
- **Chọn vai & cân bằng đội**: Người chơi tự do chọn vai Cảnh sát / Cướp hoặc để hệ thống Tự động (Auto) cân bằng theo tỷ lệ chuẩn.
- **Bản đồ làng quê Bắc Bộ 80×80m**: 10 ngôi nhà, 15 rặng cây, đụn rơm, bụi cỏ rậm nấp tàng hình, hàng rào, tường thấp và 3 vị trí nhà giam ứng viên (J1, J2, J3) do Cảnh sát trưởng chọn.
- **Điều khiển FPS & Di chuyển mượt 60 FPS**: Client Prediction + Server Reconciliation loại bỏ độ trễ; nội suy chuyển động người chơi từ xa (Remote Lerp).
- **Cơ chế bắt & giải cứu chuẩn luật**: Bắt authoritative trong tầm 1.6m–2.0m, giải cứu cần giữ phím E liên tục 2.0s, miễn bắt 3.0s sau giải cứu, vùng cấm 5m quanh nhà giam (chỉ 1 Cảnh sát canh gác).
- **Hệ thống Database & Thống kê**: Tích hợp SQLite lưu trữ lịch sử trận đấu, sự kiện, thời lượng, chỉ số bắt/cứu và phân tích cân bằng tỷ lệ thắng (telemetry).
- **Đồng hồ thời gian thực (Authoritative Clock)**: Backend mô phỏng đồng bộ thời gian thực theo tick wall-clock, đảm bảo ván chơi không bị kéo dài khi server chịu tải cao.
- **Xác thực bản đồ trên LAN & Web**: Tính toán SHA-256 bản đồ thực bằng SubtleCrypto (HTTPS) và Pure JS SHA-256 fallback (LAN HTTP).
- **Khởi động 1-Click LAN**: File `CHAY_GAME_LAN.bat` tự động phát hiện IP Wi-Fi/LAN, mở backend và frontend, hiển thị link mời bạn bè qua mạng nội bộ.

## Hướng dẫn chạy nhanh (Quick Start)

### Cách 1: Chơi nhanh qua LAN (Khuyên dùng)
Chỉ cần nhấp đúp vào file:
```
CHAY_GAME_LAN.bat
```
Script sẽ tự động:
1. Phát hiện IP mạng nội bộ của bạn (ví dụ: `192.168.1.x`).
2. Khởi động Backend Server (`http://0.0.0.0:3001`).
3. Khởi động Frontend Vite (`http://0.0.0.0:5173`).
4. Tự động mở trình duyệt web và in sẵn đường link để gửi cho bạn bè trong cùng mạng Wi-Fi.

### Cách 2: Chạy qua dòng lệnh (Root Monorepo)
```bash
# Kiểm tra toàn bộ hệ thống (152 Unit & Simulation Tests)
npm test

# Build toàn bộ các packages (Shared, Server, Frontend)
npm run build

# Kiểm tra kiểu TypeScript toàn dự án
npm run typecheck

# Kiểm tra chất lượng mã nguồn Frontend
npm run lint

# Chạy stress test tải 5 phòng & mô phỏng 25 trận cân bằng
npm run test:all
```

## Tài liệu chi tiết

| File | Nội dung |
|---|---|
| [GAMEPLAY.md](GAMEPLAY.md) | Luật, thông số di chuyển, FSM trạng thái trận, quy tắc bắt & giải cứu |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc Client/Server, Client Prediction, Database SQLite, Telemetry |
| [BACKEND_FE_HANDOFF.md](BACKEND_FE_HANDOFF.md) | Chuẩn map/movement đã chốt và thứ tự bàn giao backend cho FE |
| [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md) | Hợp đồng API Socket.IO, cấu trúc snapshot 30Hz, GameEvent |
| [MAP_AND_ASSETS.md](MAP_AND_ASSETS.md) | Tọa độ map, asset Three.js, vị trí nhà giam, collider và vùng nấp |
| [BACKLOG.md](BACKLOG.md) | Tiến độ chi tiết từng ticket P0/P1/P2 và trạng thái hoàn thành |
| [TESTING.md](TESTING.md) | Quy trình kiểm thử Playwright, Unit Tests và kịch bản playtest |

## Kết quả nghiệm thu kỹ thuật

- **Kiểm thử tự động**: 152/152 bài test vượt qua (FE: 65/65, Shared: 58/58, Backend: 29/29).
- **Chất lượng mã nguồn**: 0 lỗi lint (`eslint . --max-warnings 0`), 100% TypeScript strict typecheck passed trên cả 3 package.
- **Tối ưu bundle & đồ họa**: Main chunk client giảm từ 788 kB xuống **123 kB** (Three.js tách riêng vendor chunk cacheable 623 kB), 41–73 draw calls, ~47K tam giác, shadow map throttled 30Hz, Page Visibility API tự động giảm tải xuống 0% CPU khi chuyển tab.
- **Authoritative Server**: Chu kỳ tick mô phỏng 0.65ms trung bình (p95 = 2.71ms trên tải 5 phòng 30 người chơi cùng lúc, ngân sách 33.3ms), bộ nhớ heap chỉ 17.5 MB.
- **Cân bằng game (Telemetry)**: 25 trận mô phỏng tự động đạt tỷ lệ thắng 48% Cảnh sát / 52% Cướp (mục tiêu 45–55%), 68% trận có giải cứu (mục tiêu ≥50%).
