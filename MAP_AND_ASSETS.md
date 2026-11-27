# Map & 3D asset pipeline

## Bản đang chạy: Vietnam Village Kit — 27/11/2026

Phần này thay thế bố cục phẳng v0 bên dưới theo yêu cầu nâng cấp của người dùng. Source of truth runtime: `packages/shared/maps/vietnam-village.json`. `village-v1.json` giữ làm fixture tương thích/lịch sử, không còn là map mặc định của client/server.

- 80×80m, Y-up, đơn vị mét; 268 placements, 239 collider tĩnh và 10 collider cửa động theo từng phòng.
- 10 nhà thuộc 5 mẫu: H01 (-19,16), H02 (0,20), H03 (19,16), H04 (-22,-2), H05 (20,-3), H06 (-17,-20), H07 (4,-22), H08 (22,-23), H09 (-7,-6), H10 (10,-8). H01–03 quay PI, các nhà còn lại quay 0. Nhà hai tầng dùng tầng trệt.
- 19 cây, 4 rơm + 6 bụi làm hideZones; cổng, giếng, ao sen, cầu, ruộng lúa, rào tre/gỗ và tường biên. Tất cả 35 asset được sử dụng.
- Police spawn (-2,-18), (0,-18); robber (-30,0), (30,0), (-20,29), (20,29). Y lấy từ terrain.
- J1 (0,0), J2 (-12,10), J3 (27,26). Slots ở mặt sàn tù, anchors theo cao độ đất; guardRadius vẫn 5m. Chỉ jail được chọn hoạt động.
- Heightfield 41×41 trích từ vertex terrain GLB trong bước import, dùng đúng đường chéo tam giác của mesh. Cao độ khoảng -0.907…0.902m. Mô phỏng FE/BE dùng chung `terrainHeight` và `moveCapsule`, bước nền tối đa 0.2m, dốc tối đa 0.7 rise/run. Không raycast GLB từ server.
- Collider tường/sàn/trần/nội thất riêng, cửa có collider xoay; hành lang vào nhà để trống. Hàng rào biên có 4 collider liên tục cao 8m, không nhảy qua cổng/góc được. Ao chặn hai bên, cầu giữ hành lang đi bộ.
- Import có chủ ý: từ `frontend` chạy `node scripts/import-village-kit.mjs`, sau đó review JSON diff, chạy kiểm thử/build. Không tự chạy import mỗi lần game khởi động. Script chỉ đọc GLB nguồn, không sửa binary.

Chi tiết, quyền nguồn và kiểm thử: `frontend/docs/VIETNAM_VILLAGE_KIT.md`.

## 1. Làng Bắc Bộ — bố cục v0 lưu tham khảo

80×80m, tâm (0,0,0), X đông, Z nam; Y cao (Three.js). Ground phẳng y=0. Biên [-40,40], hàng rào biên không vượt qua được. Nhà một tầng có nội thất và hai cửa đi xuyên được theo nâng cấp ngày 21/11/2026. Lối đi chính rộng ≥4m, ngõ ≥2.5m, không có ngõ cụt dài >8m. Sân trung tâm ~18×18m, hai lối tiếp cận mỗi jail. Không dùng random map.

| ID | tâm (x,z) | footprint W×D (m) | cao tường/mái |
|---|---|---|---|
| H01 | -27,-26 | 9×8 | 3/5 |
| H02 | -12,-27 | 8×8 | 3/5 |
| H03 | 12,-28 | 9×8 | 3/5 |
| H04 | 27,-26 | 9×8 | 3/5 |
| H05 | -28,-6 | 8×9 | 3/5 |
| H06 | 28,-5 | 8×9 | 3/5 |
| H07 | -28,17 | 9×8 | 3/5 |
| H08 | -13,27 | 8×8 | 3/5 |
| H09 | 13,27 | 8×8 | 3/5 |
| H10 | 28,17 | 9×8 | 3/5 |

15 cây tại X,Z: (-35,-35),(-20,-35),(0,-35),(20,-35),(35,-35),(-36,-15),(36,-15),(-19,-10),(19,-10),(-35,7),(35,7),(-20,12),(20,12),(-32,33),(32,33). Collider thân 0.7×0.7×2.5m; tán cây cao hơn đầu, không là collider.

| Hạng mục | X,Z | Kích thước/ghi chú |
|---|---|---|
| J1 | 0,0 | 4×4m |
| J2 | -12,10 | 4×4m |
| J3 | 12,-12 | 4×4m |
| Rơm 1–4 | (-16,-16),(16,10),(-6,19),(16,-21) | volume 2.4×2.4m, high 1.5m |
| Bụi 1–6 | (-33,0),(33,1),(-7,-12),(7,12),(-22,22),(23,32) | volume 2×2m; xuyên được |
| Fence 1–4 | (-16,0),(16,0),(-7,-20),(7,20) | mỗi đoạn dài 4m theo X, cao .65m, dày .15m |
| Police spawns | (-2,-18),(2,-18) | mặt hướng +Z |
| Robber spawns | (-23,0),(23,0),(-4,30),(4,30) | mặt hướng tâm |

Jail mỗi candidate: slots tâm ±0.8 x/z; rescue anchors x±2.5, z=0 (offset theo tâm); release anchors x±3.5, z=0; guard radius 5.0. Tù chỉ active có collider shell riêng cho người trong/ngoài, đủ cao để không jump qua; teleport release ngoài shell. Candidate inactive chỉ dấu nền. Không cho nhà giam chắn tuyến đường chính hoàn toàn. Tọa độ là layout v0; chạy validator + thử đường đi trước khi đóng map hash.

## 2. Metadata map (source of truth)

```json
{
  "id": "village-v1",
  "size": [80,80],
  "objects": [{"id":"H01","asset":"house_a","pos":[-27,0,-26],"yaw":0,"scale":[1,1,1]}],
  "colliders": [{"id":"H01_box","center":[-27,2.5,-26],"size":[9,5,8]}],
  "hideZones": [{"id":"hay01","center":[-16,0.75,-16],"size":[2.4,1.5,2.4]}],
  "jails": [{"id":"J1","center":[0,0,0],"size":[4,4],"guardRadius":5,"slots":[[-0.8,0,-0.8],[0.8,0,-0.8],[-0.8,0,0.8],[0.8,0,0.8]],"rescueAnchors":[[-2.5,0,0],[2.5,0,0]],"releaseAnchors":[[-3.5,0,0],[3.5,0,0]]}],
  "spawns":{"police":[[-2,0,-18],[2,0,-18]],"robber":[[-23,0,0],[23,0,0],[-4,0,30],[4,0,30]]}
}
```

Đây là ví dụ rút gọn, không phải map hoàn chỉnh. Tất cả tọa độ anchors là world coordinates khi lưu JSON. Validator check unique ID, bounds, finite numbers, spawn/anchor không đè collider, số jail=3, số spawn đúng, guard zone đủ 2 tuyến; kiểm tra thủ công reachability/jump. Hash SHA-256 trên file bytes lúc build, server/client dùng cùng bytes. Không sửa layout riêng ở Blender mà quên metadata.

## 3. Danh sách model Blender

| Model | Số loại | Triangle budget/model | Ghi chú |
|---|---:|---:|---|
| house_a/b/c | 3 | 1000–2000 | nhà mái ngói, tường vàng/trắng, cửa đơn giản |
| tree_a/b | 2 | 200–500 | thân trụ 6 cạnh, tán ico sphere |
| bush | 1 | 100–200 | cụm icosphere, lá không cần alpha |
| haystack | 1 | 150–350 | khối rơm vàng, hide volume riêng |
| fence_segment | 1 | 100–200 | tre/gỗ, cao .65m |
| jail | 1 | 500–1000 | tre, 2 mặt có điểm cứu, không dùng khóa thật |
| avatar | 1 rig | 1500–3500 | cùng mesh, đổi material xanh/cam, không súng |
| prop (chum, ghế, sọt) | 3 | 100–300 | ngoài MVP nếu cản tiến độ |

Tông màu: tường kem #E6D5A5, ngói #A84E35, cỏ #83A95A, đường #BCA588, police #2876C9, robber #EC8F32. Flat shading, chỉ 1–2 material mỗi asset; texture atlas 512/1024 nếu cần. Không sculpt/detail mái ngói từng viên, không tóc/áo vật lý, không PBR texture phức tạp. Model avatar chibi đơn giản để nhận đội qua màu áo, biểu tượng.

## 4. Workflow từng asset

1. Blender metric, 1 unit = 1m, Z-up trong Blender; exporter glTF chuyển sang Y-up. Kiểm thử hướng bằng một cube 1m và avatar nhìn -Z ở Three.js.
2. Model tại origin (pivot đáy giữa), object name lowercase snake_case, apply rotation/scale, xử lý normals, xóa mesh ẩn, kiểm triangles và UV. Character pivot ở chân; một armature chung, clip Idle/Walk/Run/Jump/Crouch.
3. Lưu assets/blender/<name>.blend; export selected .glb vào apps/client/public/models/<name>.glb (GLTFLoader). Không apply armature modifier khi cần animation. Texture/material embed; giữ source license.
4. Load sandbox scene; kiểm scale, hướng, màu, bounding box, animation, shadow, console. Dùng clone cho skinned avatars, InstancedMesh cho props tĩnh. Không dùng cùng skeleton cho các avatar độc lập.
5. Map JSON định vị GLB; collider đơn giản riêng, dùng debug toggle. Không bake whole map thành một mesh làm mất khả năng culling/instance.

## 5. Chất lượng và bản quyền

- Ưu tiên tự tạo từ primitive; asset bên ngoài phải có license cho phép phân phối web, lưu author/url/license/modifications vào assets/LICENSES.md.
- Lưu .blend lớn bằng Git LFS nếu cả nhóm cấu hình; không commit cache/temp. GLB nhỏ commit trực tiếp; mỗi file .blend một owner để tránh merge binary.
- Asset hoàn thành khi chạy trong browser, collider khớp, đúng budget, không lỗi texture và không che khuất tầm nhìn vô lý. Chỉ bắt đầu polish sau prototype 6 người hoạt động.

## Nhà có nội thất — 21/11/2026

Theo yêu cầu người dùng, 10 nhà có footprint [rộng, sâu], cao tường 3,2 m, cửa trước/sau rộng 1,6 m và cao 2,4 m. Collider Hxx_box nay là tường phía Tây. Mỗi nhà có 11 collider gồm hai tường bên, hai cặp trụ cửa, hai lintel, trần, tủ và ghế hộp. Tổng map có 129 collider. Vị trí và diện tích lô nhà theo bảng giữ vai trò footprint. Client dựng tường và nội thất từ đúng các hộp authoritative. Mái có ba kiểu chữ A, bốn phía và lệch. SHA-256 bản đồ đổi, cần build và khởi động lại backend cùng cập nhật FE.
