# Sổ nguồn và giấy phép tài nguyên frontend

Danh mục dưới ghi nguồn tài nguyên đang có; không coi thư mục giữ chỗ là asset đã hoàn thành.

Mỗi model, texture, audio hoặc font được thêm vào phải có một dòng bên dưới. Tài nguyên tự làm ghi tác giả thực tế; không tự nhận quyền sở hữu hoặc gán license thay tác giả. Với nguồn ngoài, kiểm tra quyền phân phối trên web và giữ bản license/attribution đi kèm nếu được yêu cầu.

| File / tài nguyên | Tác giả | URL nguồn | License / quyền sử dụng | Chỉnh sửa | Bằng chứng / attribution |
|---|---|---|---|---|---|
| `public/assets/village/*.glb` (35 model) và `manifest.json` | Không được ghi tên trong kit; người dùng cung cấp 27/11/2026 | `frontend/vietnam-village-kit/assets`, `manifest.json`, `README.md` | Người dùng yêu cầu tích hợp vào dự án; kit không kèm LICENSE riêng, không tự gán CC0/MIT | Copy nguyên binary; runtime instance/scale/vertex color; không chỉnh mesh nguồn | Kit gốc giữ nguyên; importer `scripts/import-village-kit.mjs`; ảnh reference chỉ để tham khảo |
| `public/favicon.svg` | Codex tạo cho dự án, 19/11/2026 | Nội bộ, primitive SVG | Chưa gán license phân phối riêng; theo quyết định license của chủ repo | Hình vuông và tròn, không dùng nguồn ngoài | Source SVG trong repo |
| house_a (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a01.py |
| house_b (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a01.py |
| house_c (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a01.py |
| tree_a (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a01.py |
| tree_b (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a01.py |
| bush (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a02.py |
| haystack (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a02.py |
| fence_segment (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a02.py |
| jail (.blend, .glb) | Codex tạo cho dự án | Primitive Blender nội bộ | Chủ repo quyết định license phân phối | Dựng mesh và vật liệu, xuất glTF | blender/build_a02.py |
| avatar_police (.blend, .glb) | Antigravity tạo cho dự án, 20/11/2026 | Primitive nội bộ Three.js/Blender | Chủ repo quyết định license phân phối | Dựng mesh cảnh sát low-poly, mũ kê-pi, huy hiệu, xuất glTF | blender/build_a03.py, export_avatar_glb.mjs |
| avatar_robber (.blend, .glb) | Antigravity tạo cho dự án, 20/11/2026 | Primitive nội bộ Three.js/Blender | Chủ repo quyết định license phân phối | Dựng mesh cướp low-poly, khăn rằn, áo bà ba, xuất glTF | blender/build_a03.py, export_avatar_glb.mjs |
| avatar (.blend, .glb) | Antigravity tạo cho dự án, 20/11/2026 | Primitive nội bộ Three.js/Blender | Chủ repo quyết định license phân phối | Model tổng hợp 2 vai, đổi material theo phe | blender/build_a03.py, export_avatar_glb.mjs |

Nguồn Blender đặt ở `blender/`; GLB dùng trên web đặt ở `../public/models/`. Asset chỉ phục vụ hình ảnh, không thay thế map JSON/collider shared.

| src/world/surface-detail.ts | Codex tạo cho dự án, 21/11/2026 | Nội bộ, texture sinh bằng code | Chủ repo quyết định license phân phối | Vân ngói, vữa, gỗ và rơm | Không dùng nguồn ngoài |
| src/world/landscape-detail.ts | Codex tạo cho dự án, 21/11/2026 | Nội bộ, primitive Three.js | Chủ repo quyết định license phân phối | Cỏ thấp và mây được instance | Không dùng nguồn ngoài |
| src/world/object-detail.ts | Codex tạo cho dự án, 21/11/2026 | Nội bộ, primitive Three.js | Chủ repo quyết định license phân phối | Khung cửa, chân tường, giằng rào, quả và bó rơm | Không dùng nguồn ngoài |
| src/world/enterable-houses.ts | Codex tạo cho dự án, 21/11/2026 | Nội bộ, primitive Three.js và map JSON dự án | Chủ repo quyết định license phân phối | Nhà có cửa trước/sau, ba kiểu mái, sàn và nội thất | Không dùng nguồn ngoài |
