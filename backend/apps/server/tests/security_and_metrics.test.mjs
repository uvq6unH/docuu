process.env.NODE_ENV = 'test';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { sanitizePlayerName, validateInputFrame, validateRoomCode } from '../dist/security/validator.js';
import { SocketRateLimiter } from '../dist/security/rateLimiter.js';
import { DatabaseManager } from '../dist/db/database.js';
import { RoomManager, OFFICIAL_MAP_HASH } from '../dist/rooms/roomManager.js';
import { Room } from '../dist/rooms/room.js';
import { CLIENT_EVENTS } from '@folk-tag/shared';

describe('A04 & D02 Security, Rate Limiter and Validator Test Suite', () => {
  it('sanitizes player names and strips malicious HTML tags', () => {
    assert.equal(sanitizePlayerName('  Alice  '), 'Alice');
    assert.equal(sanitizePlayerName('<b>Bob</b><script>alert(1)</script>'), 'Bobalert(1)');
    assert.equal(sanitizePlayerName('   '), null);
    assert.equal(sanitizePlayerName(''), null);
    assert.equal(sanitizePlayerName(123), null);

    const veryLongName = 'A'.repeat(50);
    const sanitized = sanitizePlayerName(veryLongName);
    assert.equal(sanitized?.length, 24);
  });

  it('validates canonical 6-character room codes', () => {
    assert.equal(validateRoomCode('abcdef'), 'ABCDEF');
    assert.equal(validateRoomCode('  234567  '), '234567');
    assert.equal(validateRoomCode('short'), null);
    assert.equal(validateRoomCode('toolongcode'), null);
    assert.equal(validateRoomCode('abc@ef'), null);
  });

  it('validates client InputFrame packets strictly', () => {
    const valid = validateInputFrame({
      seq: 10,
      moveX: 1,
      moveZ: -1,
      yaw: 1.57,
      pitch: 0.5,
      sprint: true,
      crouch: false,
      rescueHeld: true,
      jumpId: 2,
      captureId: 1,
    });
    assert.ok(valid);
    assert.equal(valid.seq, 10);
    assert.equal(valid.moveX, 1);
    assert.equal(valid.moveZ, -1);
    assert.equal(valid.sprint, true);
    assert.equal(valid.rescueHeld, true);

    // Negative or non-integer seq
    assert.equal(validateInputFrame({ seq: -1, yaw: 0 }), null);
    assert.equal(validateInputFrame({ seq: 1.5, yaw: 0 }), null);

    // NaN yaw
    assert.equal(validateInputFrame({ seq: 1, yaw: NaN }), null);
    assert.equal(validateInputFrame({ seq: 1, yaw: Infinity }), null);

    // Pitch clamping
    const clampedPitch = validateInputFrame({ seq: 1, yaw: 0, pitch: 99.0 });
    assert.ok(clampedPitch);
    assert.ok(Math.abs(clampedPitch.pitch - Math.PI / 2) < 0.001);
  });

  it('enforces input and action rate limits per socket', () => {
    const limiter = new SocketRateLimiter();

    // Input limit: 45/sec
    for (let i = 0; i < 45; i++) {
      assert.equal(limiter.checkInput('sock-1', 45), true);
    }
    // 46th frame in the same second must be rejected
    assert.equal(limiter.checkInput('sock-1', 45), false);

    // Another socket is independent
    assert.equal(limiter.checkInput('sock-2', 45), true);

    // Action limit: 10/sec
    for (let i = 0; i < 10; i++) {
      assert.equal(limiter.checkAction('sock-1', 10), true);
    }
    // 11th action rejected
    assert.equal(limiter.checkAction('sock-1', 10), false);

    limiter.destroy();
  });

  it('verifies DatabaseManager health probe check', () => {
    const db = new DatabaseManager(':memory:');
    assert.equal(db.checkHealth(), true);
    db.close();
  });

  it('provides simulation tick metrics and profiler via RoomManager (A04)', async () => {
    const db = new DatabaseManager(':memory:');
    const server = createServer();
    const io = new SocketIOServer(server);
    const roomManager = new RoomManager(io, db);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const client = ClientIO(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    const createRes = await new Promise((resolve) => {
      client.emit(
        CLIENT_EVENTS.ROOM_CREATE,
        { name: 'HostMetric', protocolVersion: 1 },
        (res) => resolve(res)
      );
    });
    assert.equal(createRes.ok, true);

    const room = roomManager.getRoom(createRes.roomCode);
    assert.ok(room);

    // Simulate several ticks and record metrics
    for (let i = 0; i < 10; i++) {
      room.step();
    }

    const metrics = roomManager.getMetrics();
    assert.equal(metrics.rooms.activeCount, 1);
    assert.equal(metrics.rooms.totalPlayers, 1);
    assert.ok(metrics.uptimeSeconds >= 0);
    assert.ok(metrics.memory.heapUsedMb > 0);
    assert.ok(metrics.simulation.targetHz === 30);
    assert.ok(metrics.simulation.avgTickMs >= 0);

    client.disconnect();
    roomManager.destroy();
    io.close();
    db.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('anti-speedhack: enforces simulation step budget preventing >2 steps per 30Hz tick', () => {
    const room = new Room('SPEED1', 'p-host', OFFICIAL_MAP_HASH);
    const fakeSocket = { id: 's-host', connected: true, join: () => {}, leave: () => {}, emit: () => {} };
    const player = room.addPlayer('p-host', 'Host', fakeSocket, 'token-host', true);
    player.role = 'POLICE';
    room.phase = 'PLAYING';

    // Malicious client floods 10 input frames in a single tick
    for (let seq = 1; seq <= 10; seq++) {
      player.inputQueue.push({
        seq,
        moveX: 0,
        moveZ: 1,
        yaw: 0,
        pitch: 0,
        sprint: false,
        crouch: false,
        rescueHeld: false,
        jumpId: 0,
        captureId: 0,
      });
    }

    // Step 1 tick (33.3ms)
    room.step(33.3);

    // Only at most 2 frames should be processed in 1 tick (burst cap 2), not all 10!
    assert.ok(player.lastProcessedSeq <= 2, `Expected processed seq <= 2, got ${player.lastProcessedSeq}`);

    room.stop();
  });

  it('stale input continues stepping idle physics so airborne players land under gravity', () => {
    const db = new DatabaseManager(':memory:');
    const room = new Room('STALE1', 'p-host', OFFICIAL_MAP_HASH);
    room.setDatabase(db);
    const fakeSocket = { id: 's-host', connected: true, join: () => {}, leave: () => {}, emit: () => {} };
    const player = room.addPlayer('p-host', 'Host', fakeSocket, 'token-host', true);
    player.role = 'ROBBER';
    player.state = 'FREE';
    room.phase = 'PLAYING';

    // Place player 5m in the air
    player.movementState.pos = [0, 5.0, 0];
    player.movementState.verticalSpeed = 0;
    player.movementState.grounded = false;

    // Simulate stale input (no input sent for 1000ms > 600ms timeout)
    player.lastInputTimestamp = Date.now() - 1000;
    player.inputQueue.length = 0;

    const initialY = player.movementState.pos[1];
    room.step(33.3);

    // Gravity should have accelerated downward, decreasing verticalSpeed and Y position
    assert.ok(player.movementState.verticalSpeed < 0, `Expected verticalSpeed < 0, got ${player.movementState.verticalSpeed}`);
    assert.ok(player.movementState.pos[1] < initialY, `Expected Y < ${initialY}, got ${player.movementState.pos[1]}`);

    room.stop();
  });

  it('enforces pebble cooldown of 6s preventing distraction spam', async () => {
    const db = new DatabaseManager(':memory:');
    const server = createServer();
    const io = new SocketIOServer(server);
    const roomManager = new RoomManager(io, db);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const client = ClientIO(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    const createRes = await new Promise((resolve) => {
      client.emit(
        CLIENT_EVENTS.ROOM_CREATE,
        { name: 'RobberPebble', protocolVersion: 1 },
        (res) => resolve(res)
      );
    });
    assert.equal(createRes.ok, true);

    const room = roomManager.getRoom(createRes.roomCode);
    const player = room.players.get(createRes.playerId);
    player.role = 'ROBBER';
    player.state = 'FREE';

    // First pebble throw
    client.emit(CLIENT_EVENTS.GAME_PEBBLE, {
      landingPos: [10, 0, 10],
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(player.lastPebbleTimestamp > 0);
    const firstPebbleTime = player.lastPebbleTimestamp;

    // Second pebble throw immediately within 6s cooldown
    client.emit(CLIENT_EVENTS.GAME_PEBBLE, {
      landingPos: [12, 0, 12],
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    // Timestamp must NOT have updated because second pebble was dropped by cooldown
    assert.equal(player.lastPebbleTimestamp, firstPebbleTime);

    client.disconnect();
    roomManager.destroy();
    io.close();
    db.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('real HTTP test: verifyAdmin rejects query param admin_token and requires valid header token', async () => {
    const { app, RUNTIME_ADMIN_TOKEN, roomManager } = await import('../dist/index.js');
    const testServer = createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Without any token -> 401
      const resNoToken = await fetch(`${baseUrl}/api/metrics`);
      assert.equal(resNoToken.status, 401);
      const bodyNoToken = await resNoToken.json();
      assert.ok(bodyNoToken.error);

      // 2. With query param admin_token -> 401 (proves query param is strictly rejected by router)
      const resQueryToken = await fetch(`${baseUrl}/api/metrics?admin_token=${RUNTIME_ADMIN_TOKEN}`);
      assert.equal(resQueryToken.status, 401);

      // 3. With wrong token -> 401
      const resWrongToken = await fetch(`${baseUrl}/api/metrics`, {
        headers: { 'x-admin-token': 'wrong-secret' },
      });
      assert.equal(resWrongToken.status, 401);

      // 4. With valid X-Admin-Token -> 200
      const resXHeader = await fetch(`${baseUrl}/api/metrics`, {
        headers: { 'x-admin-token': RUNTIME_ADMIN_TOKEN },
      });
      assert.equal(resXHeader.status, 200);
      const metrics = await resXHeader.json();
      assert.ok(metrics.rooms);

      // 5. With valid Authorization: Bearer token -> 200
      const resBearer = await fetch(`${baseUrl}/api/metrics`, {
        headers: { 'authorization': `Bearer ${RUNTIME_ADMIN_TOKEN}` },
      });
      assert.equal(resBearer.status, 200);

      // 6. Test /api/rules/tune input validation:
      // 6a. Unknown key -> 400
      const resUnknown = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ UNKNOWN_MAGIC_KEY: 999 }),
      });
      assert.equal(resUnknown.status, 400);

      // 6b. Non-finite or string value -> 400
      const resNaN = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ CAPTURE_MAX_DISTANCE_M: 'invalid-string' }),
      });
      assert.equal(resNaN.status, 400);

      // 6c. Zero or negative speed -> 400
      const resNegative = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ POLICE_WALK_SPEED: -5 }),
      });
      assert.equal(resNegative.status, 400);

      // 6d. Immutable protocol rule -> 400
      const resImmutable = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ SIMULATION_TICK_RATE_HZ: 60 }),
      });
      assert.equal(resImmutable.status, 400);

      // 6e. Inconsistent cross-field: crouch height >= standing height -> 400
      const resCrouchHeight = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ CAPSULE_HEIGHT_CROUCHING: 2.5 }),
      });
      assert.equal(resCrouchHeight.status, 400);

      // 6f. Inconsistent cross-field: walk speed >= sprint speed -> 400
      const resWalkSpeed = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ POLICE_WALK_SPEED: 8.0 }),
      });
      assert.equal(resWalkSpeed.status, 400);

      // 6g. Inconsistent cross-field: police + robber != required -> 400
      const resTeamCount = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ REQUIRED_PLAYERS: 10 }),
      });
      assert.equal(resTeamCount.status, 400);

      // 6h. Valid tune -> 200
      const resValid = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ CAPTURE_NETWORK_TOLERANCE_MARGIN_M: 0.6 }),
      });
      assert.equal(resValid.status, 200);
      const tuneJson = await resValid.json();
      assert.equal(tuneJson.rules.CAPTURE_NETWORK_TOLERANCE_MARGIN_M, 0.6);

      // 6i. Cross-field validation against active running rules (not just defaults):
      // First, tune walk to 6.0 and sprint to 7.0 (valid: 6.0 < 7.0)
      const resTuneWalk = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ POLICE_WALK_SPEED: 6.0, POLICE_SPRINT_SPEED: 7.0 }),
      });
      assert.equal(resTuneWalk.status, 200);

      // Now tune sprint alone to 5.5 -> must fail (400) because running walk speed is 6.0 (6.0 >= 5.5)
      const resTuneSprintFail = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ POLICE_SPRINT_SPEED: 5.5 }),
      });
      assert.equal(resTuneSprintFail.status, 400);

      // Tune 3 police + 3 robber (sum 6) -> 200
      const resTuneRatio = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ POLICE_COUNT: 3, ROBBER_COUNT: 3 }),
      });
      assert.equal(resTuneRatio.status, 200);

      // Tuning ROBBER_COUNT: 3 alone must succeed (200) because running POLICE_COUNT is 3 (3 + 3 = 6)
      const resTuneRobberAlone = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ ROBBER_COUNT: 3 }),
      });
      assert.equal(resTuneRobberAlone.status, 200);

      // 6j. Structural rule immutability in active rooms vs hot-applied balance rules
      const activeRoom = new Room('ACTIVE', 'p-host-01', OFFICIAL_MAP_HASH, roomManager.getRules().rules);
      roomManager.rooms.set('ACTIVE', activeRoom);
      const initialVersion = activeRoom.rulesVersion;
      assert.equal(activeRoom.rules.REQUIRED_PLAYERS, 6);
      assert.equal(activeRoom.rules.POLICE_COUNT, 3);
      assert.equal(activeRoom.rules.ROBBER_COUNT, 3);
      assert.equal(activeRoom.rules.POLICE_WALK_SPEED, 6.0);
      assert.equal(activeRoom.rules.CAPSULE_RADIUS, 0.35);

      // Tune balance rule: POLICE_WALK_SPEED to 5.8
      const resTuneBalance = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ POLICE_WALK_SPEED: 5.8 }),
      });
      assert.equal(resTuneBalance.status, 200);
      assert.equal(activeRoom.rules.POLICE_WALK_SPEED, 5.8);
      assert.ok(activeRoom.rulesVersion > initialVersion);
      const versionAfterBalance = activeRoom.rulesVersion;

      // Tune structural / non-whitelist rules: REQUIRED_PLAYERS to 4 and CAPSULE_RADIUS to 0.45
      const resTuneStructural = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({
          REQUIRED_PLAYERS: 4,
          POLICE_COUNT: 2,
          ROBBER_COUNT: 2,
          CAPSULE_RADIUS: 0.45,
        }),
      });
      assert.equal(resTuneStructural.status, 200);
      const structuralJson = await resTuneStructural.json();
      assert.equal(structuralJson.rules.REQUIRED_PLAYERS, 4);
      assert.equal(structuralJson.rules.CAPSULE_RADIUS, 0.45);
      // Active room must NOT have its structural rules or physical capsule dimensions overwritten!
      assert.equal(activeRoom.rules.REQUIRED_PLAYERS, 6);
      assert.equal(activeRoom.rules.POLICE_COUNT, 3);
      assert.equal(activeRoom.rules.ROBBER_COUNT, 3);
      assert.equal(activeRoom.rules.CAPSULE_RADIUS, 0.35);
      // rulesVersion in active room must NOT increase because no whitelist key changed in that room!
      assert.equal(activeRoom.rulesVersion, versionAfterBalance);

      // 6k. Server snapshot broadcast frequency adapts dynamically to SNAPSHOT_BROADCAST_RATE_HZ
      let snapshotCount = 0;
      activeRoom.sendSnapshotToPlayer = () => { snapshotCount++; };
      activeRoom.addPlayer('p-tester', 'Tester', { connected: true, emit: () => {}, join: () => {} }, 'token', true);
      activeRoom.players.get('p-tester').role = 'POLICE';
      activeRoom.phase = 'PLAYING';

      // Default rate: 15Hz (broadcastIntervalTicks = round(30 / 15) = 2)
      // Tick 1: 1 % 2 !== 0 -> no snapshot
      activeRoom.step();
      assert.equal(snapshotCount, 0);
      // Tick 2: 2 % 2 === 0 -> snapshot broadcasted!
      activeRoom.step();
      assert.equal(snapshotCount, 1);

      // Hot-apply 30Hz: broadcastIntervalTicks = round(30 / 30) = 1 (broadcast every tick)
      activeRoom.updateRules({ ...activeRoom.rules, SNAPSHOT_BROADCAST_RATE_HZ: 30, SNAPSHOT_BROADCAST_INTERVAL_MS: 33.33 });
      // Tick 3: 3 % 1 === 0 -> broadcasted!
      activeRoom.step();
      assert.equal(snapshotCount, 2);
      // Tick 4: 4 % 1 === 0 -> broadcasted!
      activeRoom.step();
      assert.equal(snapshotCount, 3);

      // Hot-apply 10Hz: broadcastIntervalTicks = round(30 / 10) = 3 (broadcast every 3 ticks)
      activeRoom.updateRules({ ...activeRoom.rules, SNAPSHOT_BROADCAST_RATE_HZ: 10, SNAPSHOT_BROADCAST_INTERVAL_MS: 100 });
      // Tick 5: 5 % 3 !== 0 -> no snapshot
      activeRoom.step();
      assert.equal(snapshotCount, 3);
      // Tick 6: 6 % 3 === 0 -> broadcasted!
      activeRoom.step();
      assert.equal(snapshotCount, 4);

      // Hot-apply 20Hz (non-divisible of 30): quantized to 2 ticks (66.67ms)
      activeRoom.updateRules({ ...activeRoom.rules, SNAPSHOT_BROADCAST_RATE_HZ: 20 });
      // Tick 7: 7 % 2 !== 0 -> no snapshot
      activeRoom.step();
      assert.equal(snapshotCount, 4);
      // Tick 8: 8 % 2 === 0 -> broadcasted!
      activeRoom.step();
      assert.equal(snapshotCount, 5);

      // Test HTTP tuning quantization for SNAPSHOT_BROADCAST_RATE_HZ = 20
      const resTune20 = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ SNAPSHOT_BROADCAST_RATE_HZ: 20 }),
      });
      assert.equal(resTune20.status, 200);
      const tune20Json = await resTune20.json();
      assert.equal(tune20Json.rules.SNAPSHOT_BROADCAST_RATE_HZ, 15);
      // Quantized to 2 ticks: (2 / 30) * 1000 = 66.666...ms
      assert.ok(Math.abs(tune20Json.rules.SNAPSHOT_BROADCAST_INTERVAL_MS - (2 / 30) * 1000) < 0.01);

      // Conflicting snapshot settings (30Hz and 200ms) -> must reject with 400
      const resConflict = await fetch(`${baseUrl}/api/rules/tune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': RUNTIME_ADMIN_TOKEN,
        },
        body: JSON.stringify({ SNAPSHOT_BROADCAST_RATE_HZ: 30, SNAPSHOT_BROADCAST_INTERVAL_MS: 200 }),
      });
      assert.equal(resConflict.status, 400);

      // Clean up test room
      activeRoom.stop();
      roomManager.rooms.delete('ACTIVE');

      // Reset rules back to default
      const resReset = await fetch(`${baseUrl}/api/rules/reset`, {
        method: 'POST',
        headers: { 'x-admin-token': RUNTIME_ADMIN_TOKEN },
      });
      assert.equal(resReset.status, 200);
      const resetJson = await resReset.json();
      assert.equal(resetJson.rules.CAPTURE_NETWORK_TOLERANCE_MARGIN_M, 0.4);
    } finally {
      // Ensure rules are always cleanly reset
      await fetch(`${baseUrl}/api/rules/reset`, {
        method: 'POST',
        headers: { 'x-admin-token': RUNTIME_ADMIN_TOKEN },
      }).catch(() => {});
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  it('real HTTP test: GET /api/rooms/:code strictly returns only public fields { id, name, ready, isHost }', async () => {
    const { app, db, roomManager } = await import('../dist/index.js');
    const testServer = createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const uniqueCode = 'PB' + Math.floor(1000 + Math.random() * 8999);
    const playerId = 'p-' + uniqueCode;

    db.createRoom({ roomCode: uniqueCode, hostPlayerId: playerId, mapHash: OFFICIAL_MAP_HASH });
    db.upsertPlayer({
      id: playerId,
      roomCode: uniqueCode,
      name: 'SuperSecretPlayer',
      ready: true,
      isHost: true,
      resumeToken: 'do-not-leak-this-token',
    });

    try {
      const res = await fetch(`${baseUrl}/api/rooms/${uniqueCode}`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.room);
      assert.equal(json.room.room_code, uniqueCode);
      assert.ok(Array.isArray(json.players));
      assert.equal(json.players.length, 1);

      const player = json.players[0];
      const keys = Object.keys(player).sort();
      assert.deepEqual(keys, ['id', 'isHost', 'name', 'ready']);
      assert.equal(player.id, playerId);
      assert.equal(player.name, 'SuperSecretPlayer');
      assert.equal(player.ready, true);
      assert.equal(player.isHost, true);
      assert.equal(player.resumeToken, undefined);
      assert.equal(player.resume_token, undefined);
    } finally {
      db.removePlayer(playerId);
      db.closeRoom(uniqueCode);
      await new Promise((resolve) => testServer.close(resolve));
      roomManager?.destroy();
      db?.close();
    }
  });
});
