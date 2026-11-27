# Protocol v1 — client/server contract

This document is authoritative until packages/shared/src/protocol.ts exists; update both in the same PR. Transport Socket.IO, JSON, room-scoped; coordinates meters, radians, milliseconds, integer ticks. PlayerId stable across reconnect; SocketId not used as PlayerId. Room code uppercase 6 chars, generated server-side.

## Client → server

| Event | Payload | Ack / behavior |
|---|---|---|
| room:create | {requestId, name, protocolVersion} | {ok, roomCode, playerId, resumeToken} |
| room:join | {requestId, roomCode, name, protocolVersion} | same as create |
| room:resume | {requestId, roomCode, resumeToken, protocolVersion} | same + full current state; rotate token |
| room:leave | {requestId} | ok; active match follows disconnect grace |
| room:ready | {requestId, ready, mapHash} | ok; mismatch rejected |
| room:start | {requestId} | host only, exactly 6 ready |
| jail:select | {requestId, jailId} | captain only, selection phase |
| game:input | InputFrame | no per-frame ack; snapshot ackSeq |
| door:interact | {requestId} | reliable ack; server selects nearest door from authoritative position |

Errors returned as `{ok:false, code, message}`. Codes: BAD_PAYLOAD, RATE_LIMIT, ROOM_NOT_FOUND, ROOM_FULL, MATCH_IN_PROGRESS, NOT_HOST, NOT_CAPTAIN, INVALID_PHASE, MAP_MISMATCH, VERSION_MISMATCH, TOKEN_INVALID, NOT_READY, JAIL_INVALID. Dedupe requestId per session for 60s (bounded cache); duplicate returns same ack, no repeat side effect.

Village kit extension (27/11/2026): `Snapshot.doors?: {id:string, angle:number, target:number}[]`, angles in radians, full room state including join/resume. Maps without doors remain compatible. Server chooses the closest door within 1.5m; no client target/position/elapsed-time is accepted. Only active players in PLAYING or robbers in HEAD_START can interact, never jailed players. Rotation 0–95° over 400ms, swept against all player capsules; blocked doors stop. Shared constants live in `terrain.ts`. E/touch prioritizes a nearby door; away from doors the existing capture/rescue bindings remain. Map hash now comes from actual bytes of `vietnam-village.json`; restart both sides together after this update.

```ts
type InputFrame = {
  seq: number;             // uint32, monotonic per session; reset on resume
  moveX: -1|0|1;
  moveZ: -1|0|1;           // +1 forward relative to yaw; yaw=0 faces -Z
  yaw: number;             // radians, normalized [-PI, PI]
  pitch: number;           // radians, [-PI/2, PI/2]
  sprint: boolean;
  crouch: boolean;
  rescueHeld: boolean;
  jumpId: number;          // increment per jump press, repeat last ID until ack
  captureId: number;       // increment per mouse down, repeat until ack
};
```

Send 30Hz (volatile for movement); jump/capture id monotonic, server consumes at most one new press per tick, does not replay missing IDs as multiple actions. Initial IDs 0, ignore old seq/IDs, reject excess rate, clear stale movement after 250ms. E is held-state; release packet loss resolved by next state. `jail:select` is reliable; no direct rescue/batch capture event. Guard entry is automatic on movement; E near guard zone only affects local prompt.

## Server → client

| Event | Payload | Delivery |
|---|---|---|
| room:state | {roomCode, hostId, phase, roster, mapHash, protocolVersion} | on change, on join/resume |
| game:snapshot | Snapshot | 15Hz latest only; full state on join/resume |
| game:event | {eventId, tick, type, data} | capture, rescue, phase, guard, end; dedupe UI |
| room:error | {code,message} | UI error for non-ack violations |

```ts
type Vec3 = [number, number, number];
type Role = 'POLICE' | 'ROBBER';
type Phase = 'LOBBY'|'JAIL_SELECTION'|'HEAD_START'|'PLAYING'|'RESULT';
type RobberState = 'FREE'|'HIDDEN'|'JAILED'|'IMMUNE';
type PlayerView = {
  id: string; role: Role; pos: Vec3; yaw: number;
  vel: Vec3; crouch: boolean; grounded: boolean;
  state?: RobberState; guard?: boolean; connected: boolean;
};
type Snapshot = {
  protocolVersion: 1;
  matchId: string; tick: number; phase: Phase; remainingMs: number;
  jailId: string|null; guardId: string|null;
  self: PlayerView & { stamina: number; ackSeq: number;
    ackJumpId: number; ackCaptureId: number;
    immuneRemainingMs: number; rescueProgressMs: number };
  players: PlayerView[];   // excludes self, filtered PER recipient
  jailedCount: number;     // public, 0..4
  result: null | {winner:'POLICE'|'ROBBER'|'ABORTED'; reason:string};
};
```

Roster = id, name, ready, role|null, connected; before start roles null. Captain id in room:state after role assignment. Do not send hidden robber coordinate to police >2m, including events, audio, spectator, debug fields. Omitted players disappear immediately; no inferable hide-state marker outside 2m. JailId sent to police in selection only; robber sees null until head start. Each full snapshot replaces previous visible ID set.

Event types CAPTURE {policeId,robberId}, RESCUE {rescuerId,robberId}, PHASE {phase}, GUARD_CHANGED {guardId}, RESULT {winner,reason,stats}; stats per player captures/rescues/time jailed. No position in events. Event is presentation only; snapshot authoritative. Ignore old ticks/matchId; reset buffers on new match. Room lobby phase may omit gameplay snapshot; after result clients receive room:state LOBBY.

## Integration contracts

- A provides mock server emitting snapshots by end week 1; B provides mock input client (headless or debug page). Both import shared protocol.
- Test valid/invalid messages, reconnect same identity, duplicate requests, dropped snapshot, capture/rescue simultaneously, hidden filtering per recipient, two rooms isolated.
- Breaking change requires protocolVersion bump and both developers review; don't change field names privately.
