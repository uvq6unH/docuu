import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { sanitizePlayerName, validateInputFrame, validateRoomCode } from '../dist/security/validator.js';
import { SocketRateLimiter } from '../dist/security/rateLimiter.js';
import { DatabaseManager } from '../dist/db/database.js';
import { RoomManager, OFFICIAL_MAP_HASH } from '../dist/rooms/roomManager.js';
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
});
