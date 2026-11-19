# Roadmap — 8 tuần (2 người part-time)

Giả định mỗi người 8–12h/tuần, tổng 128–192 giờ; nếu chưa biết Three.js/Blender có thể cần 10–12 tuần. Không coi deadline là cam kết. Mỗi tuần kết thúc bằng bản chạy được, review 30 phút, test ít nhất 1 lần cùng nhau.

| Tuần | A — Đức (server/shared) | B — bạn (client/art) | Gate nghiệm thu |
|---|---|---|---|
| 1 Foundation | Repo, workspace, CI, types/map/rules, mock snapshot | Vite/Three scene, camera, pointer lock, ground, debug HUD | npm ci; dev, test, build chạy; cả hai render cùng map/schema |
| 2 Graybox | Shared collision, fixed step movement, stamina, jump unit tests | FPS, controls, walls/fences/10 houses, debug collision | Đi/chạy/nhảy đúng, không xuyên tường, 80×80 |
| 3 Multiplayer | Room, ready, role, input validation, authoritative snapshot | Socket.IO client, remote avatars, prediction/interpolation, lobby | 2 tab thấy nhau; 6 tab vào/ready, room isolation |
| 4 Core loop | Phases, jail selection/timeout, capture, win, timer | Jail UI/HUD, capture animation, result/reset | 6 người hoàn thành vòng chơi, 4 jailed → police win, timeout → robber win |
| 5 Rescue & stealth | Guard limit, rescue, immunity, hide filtering, reconnect | Rescue bar, crouch/hide, jail visual, sound/UI feedback | 2s cứu, 3s miễn, chỉ 1 guard, không leak vị trí nấp |
| 6 Art pass | Stabilize network, metrics, map validator | Model 3 nhà, 2 cây, rơm/bụi, hàng rào, jail, avatar Blender | GLB đúng scale, FPS đạt mục tiêu thử nghiệm, art không ảnh hưởng collision |
| 7 Alpha | Server deploy HTTPS, logs, load test, security | Loading, options, asset optimization, browser test | 6 bạn chơi qua internet, 5 room load test, reconnect pass |
| 8 Balance | Phân tích stats, sửa P0/P1, tune rules | Playtest map, camera accessibility, feedback, polish | 20–30 trận thử, bug blocker=0, release tag v0.1.0 |

## Milestone

- M0 cuối tuần 1: scaffold chạy tại hai máy, merge protocol và map contract.
- M1 cuối tuần 2: offline graybox vui và không xuyên tường. Nếu không đạt, hoãn multiplayer/asset.
- M2 cuối tuần 3: online movement với 6 connections, chưa cần art.
- M3 cuối tuần 5: vertical slice full match, gồm cứu/nấp/canh tù. Đây là MVP gameplay.
- M4 cuối tuần 6: low-poly art pass và profiling.
- M5 cuối tuần 8: private alpha, build triển khai được.

## Ngày đầu tiên (2–3h)

1. Cùng đọc GAMEPLAY/ARCHITECTURE/NETWORK_PROTOCOL; thống nhất luật và owner.
2. A tạo repo riêng và bootstrap workspace, B xác nhận Node/npm và trình duyệt. A commit shared protocol/map stub. B tạo Three scene ở branch riêng sau khi bootstrap merge.
3. Tạo issues từ BACKLOG, gắn milestone và assignee, đặt họp review cuối tuần. Không bắt đầu làm toàn bộ cùng lúc.
4. Mỗi người chạy game local, mock server hoặc mock client trước khi tích hợp. Thử git PR nhỏ và CI.

## Cắt scope nếu trễ

Bỏ props/trang trí, tay FPS, animation phức tạp, texture, âm thanh ambient, phòng công khai. Giữ bắt/cứu/nấp, 2/4, 3 lựa chọn jail, 1 guard, 5 phút và authority. Nếu prediction quá khó, giữ interpolation remote + movement server, ghi rõ độ trễ và bổ sung prediction trước alpha Internet.

## Sau MVP

Thêm tutorial, map trường học, phòng bạn bè, bot training, mobile controls, cosmetics, account, matchmaking, persistence. Chỉ làm khi playtest chứng minh giữ chân người chơi.
