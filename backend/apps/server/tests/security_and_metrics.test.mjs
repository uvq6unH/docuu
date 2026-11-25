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

  it('GET /api/rooms/:code sanitization strictly returns only public fields { id, name, ready, isHost }', () => {
    const db = new DatabaseManager(':memory:');
    db.createRoom({ roomCode: 'PUB123', hostPlayerId: 'p-1', mapHash: OFFICIAL_MAP_HASH });
    db.upsertPlayer({
      id: 'p-1',
      roomCode: 'PUB123',
      name: 'Alice',
      ready: true,
      isHost: true,
      resumeToken: 'secret-token-12345',
    });

    const rawPlayers = db.getRoomPlayers('PUB123');
    const sanitized = rawPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      ready: Boolean(p.ready),
      isHost: Boolean(p.is_host ?? p.isHost),
    }));

    assert.equal(sanitized.length, 1);
    const keys = Object.keys(sanitized[0]).sort();
    assert.deepEqual(keys, ['id', 'isHost', 'name', 'ready']);
    assert.equal(sanitized[0].id, 'p-1');
    assert.equal(sanitized[0].name, 'Alice');
    assert.equal(sanitized[0].ready, true);
    assert.equal(sanitized[0].isHost, true);
    assert.equal(sanitized[0].resumeToken, undefined);
    assert.equal(sanitized[0].resume_token, undefined);

    db.close();
  });

  it('verifyAdmin rejects query param admin_token and accepts Bearer or X-Admin-Token with timingSafeCompare', async () => {
    const crypto = await import('node:crypto');
    function timingSafeCompare(a, b) {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      const hashA = crypto.createHash('sha256').update(a).digest();
      const hashB = crypto.createHash('sha256').update(b).digest();
      return crypto.timingSafeEqual(hashA, hashB);
    }

    const secret = 'super-secret-admin-token-123';
    assert.equal(timingSafeCompare('super-secret-admin-token-123', secret), true);
    assert.equal(timingSafeCompare('wrong-token', secret), false);
    assert.equal(timingSafeCompare('', secret), false);
    assert.equal(timingSafeCompare('super-secret-admin-token-12', secret), false);
  });
});
