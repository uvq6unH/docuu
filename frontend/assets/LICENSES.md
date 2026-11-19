# Sổ nguồn và giấy phép tài nguyên frontend

Chưa thêm model/texture/audio bên ngoài. Không coi thư mục giữ chỗ là asset đã hoàn thành.

Mỗi model, texture, audio hoặc font được thêm vào phải có một dòng bên dưới. Tài nguyên tự làm ghi tác giả thực tế; không tự nhận quyền sở hữu hoặc gán license thay tác giả. Với nguồn ngoài, kiểm tra quyền phân phối trên web và giữ bản license/attribution đi kèm nếu được yêu cầu.

| File / tài nguyên | Tác giả | URL nguồn | License / quyền sử dụng | Chỉnh sửa | Bằng chứng / attribution |
|---|---|---|---|---|---|
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

Nguồn Blender đặt ở `blender/`; GLB dùng trên web đặt ở `../public/models/`. Asset chỉ phục vụ hình ảnh, không thay thế map JSON/collider shared.
