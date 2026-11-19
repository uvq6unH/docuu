# Test plan & balance

## Layers

Unit: shared deterministic movement/LOS/geometry, server FSM with fake clock, rule boundaries. Integration: real Socket.IO 6 clients in test room, fake transport delays/disconnects, snapshots per recipient. E2E: browser desktop 2 tabs via Playwright (use test-only input adapter for pointer lock), then manual 6 device test. No test-only authority bypass in production.

| ID | Scenario | Expected |
|---|---|---|
| L01 | 5/6 ready, nonhost start | rejected |
| L02 | 6 ready | 2 police/4 robbers, captain set |
| L03 | robber select jail or second selection | rejected |
| L04 | no selection after 20s | J1 active |
| L05 | 15s head start | police frozen, timer 300s after |
| M01 | diagonal sprint, jump repeated midair | speed cap, one jump |
| M02 | sprint till 0 | walk, recover, threshold 20 |
| M03 | sprint into wall and boundary | no clipping |
| M04 | jump fence .65m | cross with correct landing |
| M05 | stand under low ceiling | stays crouched |
| C01 | police tag at 1.59m, front, clear | captures |
| C02 | 1.61m or obstacle or behind | no capture, cooldown |
| C03 | capture ID duplicated/forged role | no duplicate capture |
| C04 | 4 robber jailed in same tick as rescue | police wins; no post-end rescue |
| R01 | hold E 1999ms vs >=2000ms on discrete ticks | no early rescue; then 1 freed |
| R02 | release E, walk out, get caught | reset progress |
| R03 | simultaneously 2 rescuers | one completes first, no duplicate |
| R04 | freed <3s / at expiry | immune / catchable |
| R05 | jailed moves/jumps/tries E | confined, no self escape |
| G01 | 2 police enter zone simultaneously | deterministic first token, second blocked |
| G02 | guard leaves/disconnects | token released |
| H01 | crouch within hay/bush 0.4s | hidden, no enemy position >2m |
| H02 | exits, stands or police within 2m | state visible as defined, no immunity |
| H03 | inspect socket payload as police | no hidden opponent pos/audio events |
| E01 | exactly 300s, one robber free | robber wins, no overtime |
| E02 | reconnect within 30s | same slot/state, full snapshot |
| E03 | absent >30s | aborted, no false win |
| E04 | finish then rematch | clear timer, role/state/input/guard reset |
| N01 | fake latency 100ms + jitter/loss | no permanent stale states |
| N02 | invalid NaN, huge packet, flood, spoof ID | reject, room unaffected |
| N03 | two rooms on one server | no cross-room snapshots |
| P01 | 5 rooms ×6 scripted clients | tick p95 <20ms goal; log actual |
| P02 | 1080p desktop, 5min play | measure FPS p50/p95 frame time, crashes |

Time-based tests use server fake monotonic clock/tick rather than sleeps; allow at most one fixed tick quantization (33.3ms) where appropriate. At deadline timeout takes priority. Check disconnect in each phase and guard disconnect. Test all 3 jail IDs.

## Playtest log

CSV columns: matchId,mapVersion,rulesVersion,jailId,teamAssignment,winner,durationSeconds,firstCaptureSec,numCaptures,numRescues,guardSeconds,avgStamina,disconnects,rttMs,notes. No IP/token logged. Collect anonymous feedback 1–5: chase fun, control, map clarity, rescue opportunity, fairness, nausea. Test 20–30 rounds split evenly across jails, swap roles; small sample directional only. Aim 45–55% after more matches, not proof of fairness. Compare median capture/rescue time per map. Watch jail camping and infinite loops; adjust only one group of rules per iteration.

## Release gate

- [ ] Pre-merge lint/typecheck/unit/integration green.
- [ ] Six humans can join, select jail, finish, rematch.
- [ ] No blocker: game freeze, wrong victory, impossible rescue, wall clip or state leak.
- [ ] Reconnect clean, all jail candidates reachable, guard limit enforced.
- [ ] Browser console clean; loading/low quality mode functional.
- [ ] Record build version, measured FPS/tick metrics, known limitations, deployment rollback tag.
