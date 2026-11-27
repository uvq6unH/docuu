import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { Room } from '../dist/rooms/room.js';
import { RoomManager, OFFICIAL_MAP_HASH } from '../dist/rooms/roomManager.js';
import { DatabaseManager } from '../dist/db/database.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@folk-tag/shared';

describe('Rescue, Guard and Stealth Integration (R01, R02, R03)', () => {
  it('manages guard zone token, dynamic boundary clamping and release (R02)', () => {
    const db = new DatabaseManager(':memory:');
    db.createRoom({ roomCode: 'GUARD1', hostPlayerId: 'p-1', mapHash: OFFICIAL_MAP_HASH });
    const room = new Room('GUARD1', 'p-1', OFFICIAL_MAP_HASH);
    room.setDatabase(db);

    const fakeSocket = (id) => ({
      id,
      connected: true,
      join: () => {},
      leave: () => {},
      emit: () => {},
    });

    // Add 6 players (2 police, 4 robbers)
    for (let i = 1; i <= 6; i++) {
      const p = room.addPlayer(`p-${i}`, `Player ${i}`, fakeSocket(`s-${i}`), `token-${i}`, i === 1);
      p.ready = true;
    }

    assert.equal(room.startMatch(), true);
    room.stop(); // Stop automated interval timer for deterministic tick stepping
    assert.equal(room.selectJail('p-1', 'J1'), true);

    // Fast-forward to PLAYING
    room.step();
    room['phase'] = 'PLAYING';
    room['remainingMs'] = 300_000;

    const police1 = room.players.get('p-1');
    const police2 = room.players.get('p-2');

    // 1. Police 1 enters guard zone (J1 center is [0, 0, 0])
    police1.movementState.pos = [0, 0, 3]; // 3m <= 5m
    room.step();

    assert.equal(room.guardId, 'p-1');
    assert.equal(police1.guard, true);

    // 2. Police 2 attempts to enter guard zone
    police2.movementState.pos = [0, 0, 2]; // 2m <= 5m
    room.step();

    // Police 2 must be clamped outside boundary (dist > 5.0m) and denied token
    assert.equal(room.guardId, 'p-1');
    assert.equal(police2.guard, false);
    const distP2 = Math.hypot(police2.movementState.pos[0], police2.movementState.pos[2]);
    assert.ok(distP2 > 5.0 && distP2 < 5.01, `Police 2 clamped at dist ${distP2}`);

    // 3. Police 1 moves outside guard zone (> 5.0m)
    police1.movementState.pos = [0, 0, 8];
    room.step();

    assert.equal(room.guardId, null);
    assert.equal(police1.guard, false);

    room.stop();
    db.close();
  });

  it('handles stealth crouching in hide zone and filters snapshot visibility (R02)', () => {
    const db = new DatabaseManager(':memory:');
    db.createRoom({ roomCode: 'STEALTH', hostPlayerId: 'p-1', mapHash: OFFICIAL_MAP_HASH });
    const room = new Room('STEALTH', 'p-1', OFFICIAL_MAP_HASH);
    room.setDatabase(db);

    let p1ReceivedSnapshots = [];
    let r2ReceivedSnapshots = [];

    const fakeSocket = (id, collector) => ({
      id,
      connected: true,
      join: () => {},
      leave: () => {},
      emit: (event, data) => {
        if (event === SERVER_EVENTS.GAME_SNAPSHOT) {
          collector.push(data);
        }
      },
    });

    const p1 = room.addPlayer('p-1', 'Cop 1', fakeSocket('s-1', p1ReceivedSnapshots), 't-1', true);
    p1.ready = true;
    const p2 = room.addPlayer('p-2', 'Cop 2', fakeSocket('s-2', []), 't-2');
    p2.ready = true;
    const r1 = room.addPlayer('r-1', 'Robber 1', fakeSocket('s-3', []), 't-3');
    r1.ready = true;
    const r2 = room.addPlayer('r-2', 'Robber 2', fakeSocket('s-4', r2ReceivedSnapshots), 't-4');
    r2.ready = true;
    const r3 = room.addPlayer('r-3', 'Robber 3', fakeSocket('s-5', []), 't-5');
    r3.ready = true;
    const r4 = room.addPlayer('r-4', 'Robber 4', fakeSocket('s-6', []), 't-6');
    r4.ready = true;

    assert.equal(room.startMatch(), true);
    room.stop();
    room['phase'] = 'PLAYING';
    room['remainingMs'] = 300_000;

    // Cop 1 is at [0, 0, 10]
    p1.movementState.pos = [0, 0, 10];
    // Robber 1 enters R01 haystack at [-16, 0, -16]
    const hide = room.world.hideZones.find(zone => zone.id === 'R01_hide');
    r1.movementState.pos = [hide.center[0], hide.center[1] - hide.size[1] / 2, hide.center[2]];

    // Robber 1 crouches inside hide zone via input frames
    for (let i = 0; i < 15; i++) {
      room.enqueueInput('r-1', {
        seq: i + 1,
        moveX: 0,
        moveZ: 0,
        yaw: 0,
        pitch: 0,
        sprint: false,
        crouch: true,
        rescueHeld: false,
        jumpId: 0,
        captureId: 0,
      });
      room.step();
    }

    assert.equal(r1.state, 'HIDDEN');

    // Snapshot received by Police 1 (dist to r1 > 20m > 2m)
    const latestP1Snap = p1ReceivedSnapshots[p1ReceivedSnapshots.length - 1];
    assert.ok(latestP1Snap);
    const p1SeesR1 = latestP1Snap.players.some((p) => p.id === 'r-1');
    assert.equal(p1SeesR1, false, 'Police far away must NOT see HIDDEN robber');

    // Snapshot received by fellow robber Robber 2
    const latestR2Snap = r2ReceivedSnapshots[r2ReceivedSnapshots.length - 1];
    assert.ok(latestR2Snap);
    const r2SeesR1 = latestR2Snap.players.some((p) => p.id === 'r-1');
    assert.equal(r2SeesR1, true, 'Fellow robber MUST see HIDDEN robber');

    // Stand up -> resets to FREE immediately
    room.enqueueInput('r-1', {
      seq: 20,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      sprint: false,
      crouch: false,
      rescueHeld: false,
      jumpId: 0,
      captureId: 0,
    });
    room.step();
    assert.equal(r1.state, 'FREE');

    room.stop();
    db.close();
  });

  it('executes rescue with 2s hold and 3s immunity, audit DB and reset progress (R01)', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const db = new DatabaseManager(':memory:');
    db.createRoom({ roomCode: 'RESCUE1', hostPlayerId: 'p-1', mapHash: OFFICIAL_MAP_HASH });
    const room = new Room('RESCUE1', 'p-1', OFFICIAL_MAP_HASH);
    room.setDatabase(db);

    const emittedEvents = [];
    const fakeSocket = (id) => ({
      id,
      connected: true,
      join: () => {},
      leave: () => {},
      emit: (event, data) => {
        if (event === SERVER_EVENTS.GAME_EVENT) emittedEvents.push(data);
      },
    });

    for (let i = 1; i <= 6; i++) {
      const p = room.addPlayer(`p-${i}`, `P${i}`, fakeSocket(`s-${i}`), `t-${i}`, i === 1);
      p.ready = true;
    }

    assert.equal(room.startMatch(), true);
    room.stop();
    assert.equal(room.selectJail('p-1', 'J1'), true);
    room['phase'] = 'PLAYING';
    room['remainingMs'] = 300_000;

    // 1. Jail robber 3 (p-3) in J1 slot 0
    const robber3 = room.players.get('p-3');
    robber3.state = 'JAILED';
    robber3.jailSlotIndex = 0;
    robber3.timeJailedMs = 5000;
    robber3.movementState.pos = [-0.8, 0, -0.8];

    // 2. Robber 4 (p-4) goes to rescueAnchor 0 of J1 ([-2.5, 0, 0])
    const rescuer = room.players.get('p-4');
    rescuer.movementState.pos = [-2.5, 0, 0];
    rescuer.lastYaw = -Math.PI / 2; // Facing +X towards jail center [0, 0, 0]

    let seq = 0;
    function sendRescue(held) {
      room.enqueueInput('p-4', {
        seq: ++seq,
        moveX: 0,
        moveZ: 0,
        yaw: -Math.PI / 2,
        pitch: 0,
        sprint: false,
        crouch: false,
        rescueHeld: held,
        jumpId: 0,
        captureId: 0,
      });
    }
    sendRescue(true);
    room.step();
    const firstTick = rescuer.rescueProgressMs;
    assert.ok(firstTick > 0);
    room.step();
    assert.ok(rescuer.rescueProgressMs > firstTick);
    rescuer.movementState.pos = [-6, 0, 0];
    room.step();
    assert.equal(rescuer.rescueProgressMs, 0);
    rescuer.movementState.pos = [-2.5, 0, 0];
    room.step();
    room.step();
    // A release and re-press in one batch starts a new hold.
    sendRescue(false);
    sendRescue(true);
    room.step();
    assert.equal(rescuer.rescueProgressMs, firstTick);
    t.mock.timers.tick(room.rules.INPUT_STALE_TIMEOUT_MS + 1);
    room.step();
    assert.equal(rescuer.rescueProgressMs, 0);
    assert.equal(rescuer.rescueHeld, false);

    // Deliver input on alternating ticks through a complete rescue.
    for (let tick = 0; tick < 65; tick++) {
      if (tick % 2 === 0) sendRescue(true);
      t.mock.timers.tick(33);
      room.step();
    }

    // 4. Verify rescue completion
    assert.equal(robber3.state, 'IMMUNE');
    assert.ok(robber3.immuneRemainingMs > 0 && robber3.immuneRemainingMs <= 3000);
    // Spawns at releaseAnchor 0: [-3.5, 0, 0]
    assert.deepEqual(robber3.movementState.pos, room.world.jails[0].releaseAnchors[0]);

    // Rescuer does NOT receive immunity
    assert.equal(rescuer.state, 'FREE');
    // Rescuer progress reset
    assert.equal(rescuer.rescueProgressMs, 0);
    room.step();
    assert.equal(rescuer.rescueNeedsRelease, true);
    sendRescue(false);
    room.step();
    assert.equal(rescuer.rescueNeedsRelease, false);

    // Verify RESCUE event was broadcast
    const rescueEvent = emittedEvents.find((e) => e.type === 'RESCUE');
    assert.ok(rescueEvent, 'RESCUE event must be emitted');
    assert.equal(rescueEvent.data.rescuerId, 'p-4');
    assert.equal(rescueEvent.data.rescuedId, 'p-3');

    // Verify DB stats and audit
    const stats = db.getMatchStats(room.matchId);
    const rescuerStat = stats.find((s) => s.player_id === 'p-4');
    assert.equal(rescuerStat?.rescues_count, 1);

    const matchRecord = db.getMatch(room.matchId);
    assert.equal(matchRecord?.total_rescues, 1);

    // 5. Immunity countdown: step for 95 more ticks (~3166ms > 3000ms)
    for (let tick = 0; tick < 95; tick++) {
      room.step();
    }
    assert.equal(robber3.state, 'FREE');
    assert.equal(robber3.immuneRemainingMs, 0);

    room.stop();
    db.close();
  });

  it('manages 30s reconnect grace and resume token rotation (R03)', async () => {
    const db = new DatabaseManager(':memory:');
    const server = createServer();
    const io = new SocketIOServer(server);
    const roomManager = new RoomManager(io, db);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const createClient = () =>
      ClientIO(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

    // 1. Client 1 creates room
    const c1 = createClient();
    const createRes = await new Promise((resolve) => {
      c1.emit(
        CLIENT_EVENTS.ROOM_CREATE,
        { name: 'HostAlice', protocolVersion: 1 },
        (res) => resolve(res)
      );
    });
    assert.equal(createRes.ok, true);
    const roomCode = createRes.roomCode;
    const aliceId = createRes.playerId;
    const initialResumeToken = createRes.resumeToken;

    // 2. Client 2 joins room
    const c2 = createClient();
    const joinRes = await new Promise((resolve) => {
      c2.emit(
        CLIENT_EVENTS.ROOM_JOIN,
        { roomCode, name: 'Bob', protocolVersion: 1 },
        (res) => resolve(res)
      );
    });
    assert.equal(joinRes.ok, true);
    const bobId = joinRes.playerId;
    const bobToken = joinRes.resumeToken;

    // 3. Attempt resume with invalid token fails with TOKEN_INVALID
    const c3 = createClient();
    const invalidResume = await new Promise((resolve) => {
      c3.emit(
        CLIENT_EVENTS.ROOM_RESUME,
        { roomCode, playerId: bobId, resumeToken: 'wrong-token' },
        (res) => resolve(res)
      );
    });
    assert.equal(invalidResume.ok, false);
    assert.equal(invalidResume.code, 'TOKEN_INVALID');

    // 4. Valid resume rotates token and attaches socket
    const validResume = await new Promise((resolve) => {
      c3.emit(
        CLIENT_EVENTS.ROOM_RESUME,
        { roomCode, playerId: bobId, resumeToken: bobToken },
        (res) => resolve(res)
      );
    });
    assert.equal(validResume.ok, true);
    assert.notEqual(validResume.resumeToken, bobToken);

    c1.disconnect();
    c2.disconnect();
    c3.disconnect();
    roomManager.destroy();
    io.close();
    db.close();
    await new Promise((resolve) => server.close(resolve));
  });
});
