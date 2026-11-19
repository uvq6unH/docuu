# Backlog có thể copy vào GitHub Issues

P0 = chặn MVP; P1 = alpha cần; P2 = tùy thời gian. Estimate giờ làm tập trung (không tính học). A=Đức; B=bạn; AB=cả hai. Mỗi PR đóng issue, ghi test evidence. Chưa có code, tất cả TODO.

| ID | Tuần | Owner | P | Giờ | Task | Phụ thuộc | Acceptance |
|---|---:|---|---|---:|---|---|---|
| F01 | 1 | A | P0 | 3 | npm workspace, TS, lint, CI | — | npm ci/test/build pass |
| F02 | 1 | A | P0 | 4 | Protocol, rules constants | F01 | types + schema tests |
| F03 | 1 | AB | P0 | 4 | Map schema/JSON initial | F01 | exact 10 houses/15 trees/3 jails |
| F04 | 1 | B | P0 | 4 | Three scene, lights, camera | F01 | canvas resize; no errors |
| F05 | 1 | B | P0 | 3 | PointerLockControls/input | F04 | mouse, WASD, clear on blur |
| F06 | 1 | A | P0 | 2 | Mock snapshot server | F02 | sample 6 identities |
| M01 | 2 | A | P0 | 6 | Shared capsule/box collision | F03 | wall/fence/boundary tests |
| M02 | 2 | A | P0 | 4 | Fixed-step movement/stamina | M01 | deterministic replay |
| M03 | 2 | B | P0 | 5 | FPS controller + camera | F05,M02 | jump/sprint/crouch correct |
| M04 | 2 | B | P0 | 5 | Graybox map + collider overlay | F03,F04 | layout walkable; 80m |
| N01 | 3 | A | P0 | 5 | Rooms, host, ready, auth | F02 | 6 max, room isolation |
| N02 | 3 | A | P0 | 5 | Server tick/input/snapshots | M02,N01 | seq ack, stale input cleared |
| N03 | 3 | B | P0 | 4 | Lobby + socket transport | N01 | create/join/ready messages |
| N04 | 3 | B | P0 | 7 | Prediction & remote interpolation | N02,M03 | 2 clients smooth enough |
| G01 | 4 | A | P0 | 4 | Phase FSM + jail selection | N01 | 20s max, only captain |
| G02 | 4 | A | P0 | 5 | Capture/teleport/end | N02,G01 | valid target/LOS/cooldown |
| G03 | 4 | B | P0 | 5 | Game HUD and phase UI | G01,N03 | timer, role, selection, count |
| G04 | 4 | B | P0 | 4 | capture action and jail render | G02 | authoritative teleport shown |
| G05 | 4 | AB | P0 | 2 | Full match and restart | G02,G03,G04 | no stale state |
| R01 | 5 | A | P0 | 4 | Rescue/immune state | G02 | exactly 2s and 3s |
| R02 | 5 | A | P0 | 4 | Guard constraint, hide visibility | G02 | max one guard; no leak |
| R03 | 5 | A | P0 | 4 | Reconnect/grace | N01,G01 | same ID, 30s expiry |
| R04 | 5 | B | P0 | 5 | Rescue UI, hide/crouch, guard | R01,R02 | prompts reset correctly |
| R05 | 5 | B | P1 | 3 | Spatial footsteps | N04 | volume by motion; hidden no leak |
| A01 | 6 | B | P1 | 5 | Blender houses, trees | M04 | GLB scale + budget |
| A02 | 6 | B | P1 | 5 | Jail, bushes, rơm, fence | M04 | no art/collider mismatch |
| A03 | 6 | B | P1 | 5 | Avatar and basic animations | N04 | team colors, separate rigs |
| A04 | 6 | A | P0 | 4 | Map validator + hash, profiling | F03 | mismatch denied, tick metrics |
| D01 | 7 | A | P0 | 5 | Deploy and health checks | G05,R03 | WSS + HTTPS smoke |
| D02 | 7 | A | P0 | 5 | Security + load scripts | R02,R03 | malformed/rate limits/5 rooms |
| D03 | 7 | B | P1 | 6 | Asset/render optimize, settings | A01,A02,A03 | FPS + load measurements |
| D04 | 7 | AB | P0 | 3 | Internet alpha 6 humans | D01 | match completed, reconnect |
| T01 | 8 | AB | P0 | 6 | 20–30 playtests + stats | D04 | outcome by jail/side logged |
| T02 | 8 | A | P0 | 5 | tune balance and blockers | T01 | tests pass, rules versioned |
| T03 | 8 | B | P0 | 5 | polish/map/UX blockers | T01 | feedback resolved |
| T04 | 8 | AB | P0 | 2 | release docs/tag | T02,T03 | v0.1.0 deploy reproducible |

## Issue template

Title: `[M01] Shared collision`. Description: why; scope; owner; dependencies; files expected; acceptance tests (Given/When/Then); out of scope. Attach CLI/test output or screenshot in PR. If contract changes, add joint review before implementation.

## Later backlog

P2: tutorial, sound ambience, mobile controls, many maps, bot fill, public matchmaking, voice, persistence, cosmetics. Do not schedule before private alpha.
