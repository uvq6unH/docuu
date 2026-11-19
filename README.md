# CẢNH SÁT BẮT CƯỚP — Kế hoạch MVP v0.1

Game dân gian Việt Nam, multiplayer FPS trên trình duyệt, đồ họa low-poly. Không súng, không sát thương, không cướp tiền. Trọng tâm: chạy đuổi, cắt đuôi, nấp và giải cứu bạn.

## Mục tiêu

- 6 người: 2 cảnh sát + 4 cướp; 5 phút thi đấu, chưa tính chuẩn bị.
- 1 map làng Bắc Bộ 80×80m: 10 nhà, 15 cây, rơm, bụi cỏ, tường thấp, ngõ và 3 vị trí nhà giam ứng viên (chỉ 1 được kích hoạt).
- PC browser, chuột + bàn phím; phiên bản đầu ưu tiên Chrome/Edge desktop.
- Private room code, không cần đăng ký; một server đơn, không database trong MVP.

## Tài liệu (đọc theo thứ tự)

| File | Nội dung |
|---|---|
| [GAMEPLAY.md](GAMEPLAY.md) | Luật, thông số, state machine, cân bằng |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, client/server, cấu trúc code, đồng bộ |
| [BACKEND_FE_HANDOFF.md](BACKEND_FE_HANDOFF.md) | Chuẩn map/movement đã chốt và thứ tự bàn giao backend cho FE |
| [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md) | Hợp đồng API/event để hai người code độc lập |
| [MAP_AND_ASSETS.md](MAP_AND_ASSETS.md) | Tọa độ map, Blender, asset, collider |
| [ROADMAP.md](ROADMAP.md) | 8 tuần, chia việc, tiêu chí nghiệm thu |
| [BACKLOG.md](BACKLOG.md) | Ticket cụ thể và phụ thuộc |
| [TESTING.md](TESTING.md) | Test case và playtest |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Git, review, dự án, quy ước |
| [AGENTS.md](AGENTS.md) | Hướng dẫn cho công cụ AI coding |

## Quyết định ban đầu

Đức (A): server, gameplay authority, networking, deploy; bạn (B): Three.js FPS, map, Blender, UI. Cả hai cùng test và review giao diện shared. Có thể đổi vai trước sprint 1.

Ưu tiên: graybox chạy được → multiplayer 2 người → vòng chơi đầy đủ 6 người → thay asset → cân bằng. Không chờ model hoàn thiện mới code.

## Phạm vi không làm trong MVP

Mobile, voice chat, matchmaking công khai, shop, rank, xe, vũ khí, phá hủy môi trường, NPC có AI đầy đủ, map procedural, tài khoản/database, nhiều mode. Chỉ bổ sung sau khi 6 người thực chơi thấy vui.

Các số liệu là giả thuyết thiết kế, phải chỉnh qua playtest. Không phải cam kết FPS hay tỷ lệ thắng đã đo.
