# Cùng code — quy ước nhóm

## Git và repo

Private GitHub/GitLab repo do nhóm tạo; không tự động push tài liệu lên repo chưa được cung cấp. Copy README.md và AGENTS.md ở root, các tài liệu khác vào docs/ (cập nhật đường link README nếu di chuyển). A maintain server/shared, B maintain client/assets. Shared contract changes require both approvals. Protect main: CI green and one peer review. Không commit trực tiếp main.

```bash
git clone <repo-url>
cd folk-tag
npm ci
npm run dev
npm run test
npm run lint
npm run typecheck
npm run build
git switch -c feat/N01-rooms
```

Các script là contract cần tạo ở F01, chưa tồn tại trong bộ tài liệu này. dev chạy server 3001 + client 5173, proxy /socket.io và /healthz tới server. Production server serve built client same origin. .env.example có PORT=3001, CLIENT_ORIGIN=http://localhost:5173; không commit .env thật. npm ci dùng lockfile đã commit, nếu thay deps phải cập nhật cả lockfile.

## Quy trình hàng ngày

1. Assign issue, lấy main mới trước khi tách branch.
2. Implement, thêm test; tránh sửa ngoài phạm vi. Nếu cần thay shared contract, mở PR nhỏ trước, người kia review.
3. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`. Manual nếu UI/map.
4. PR ghi issue, lý do, test evidence, ảnh nếu visual, breaking change, giới hạn. Squash merge sau review. Không force push branch người khác.
5. Rebase/merge main vào branch mới; ping nhau khi thay map/hash. Không giữ PR quá lớn (>500 dòng logic khi có thể chia nhỏ).

Branch examples feat/G02-capture, fix/R02-guard-boundary, chore/F01-ci. Commit `feat(server): add capture validation (#12)`; `fix(client): clear input on blur`. English identifiers, Vietnamese docs/comments giải thích nghiệp vụ, TS strict, no any nếu chưa giải thích, format tự động. Tất cả units suffix rõ: `remainingMs`, `speedMps`, `jumpVelocity`.

## Definition of done

Code chạy trên máy cả hai, acceptance đúng, test pass, không warning/error mới, docs/contract cập nhật, reviewer hiểu thay đổi. Không claim test đã chạy khi chưa chạy. Các flags/debug chỉ bật dev. Asset PR ghi license/budget/ảnh demo; .blend do một người chỉnh.

## Phân xử quyết định

Gameplay/rules thay đổi cùng nhau ghi quyết định ở GAMEPLAY.md + test; architecture thay đổi ghi ADR nhỏ (context, decision, alternatives, consequences). Nếu tranh luận, timebox 30min, thử prototype tối giản, chọn phương án dễ kiểm thử và đảo ngược. Mỗi tuần thống nhất 3 việc ưu tiên và demo, ghi blocker sớm.
