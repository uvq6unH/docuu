import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { DatabaseManager } from '../dist/db/database.js';
import { RoomManager, OFFICIAL_MAP_HASH } from '../dist/rooms/roomManager.js';
import { CLIENT_EVENTS } from '@folk-tag/shared';

describe('G05 Match Lifecycle & Restart (Rematch) Test Suite', () => {
  it('resets room cleanly from RESULT to LOBBY with no stale state', async () => {
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

    // 1. Create room and join 6 players
    const hostClient = createClient();
    const createRes = await new Promise((resolve) => {
      hostClient.emit(
        CLIENT_EVENTS.ROOM_CREATE,
        { name: 'HostAlice', protocolVersion: 1 },
        (res) => resolve(res)
      );
    });
    assert.equal(createRes.ok, true);
    const roomCode = createRes.roomCode;
    const clients = [hostClient];

    for (let i = 2; i <= 6; i++) {
      const c = createClient();
      const joinRes = await new Promise((resolve) => {
        c.emit(
          CLIENT_EVENTS.ROOM_JOIN,
          { roomCode, name: `Player${i}`, protocolVersion: 1 },
          (res) => resolve(res)
        );
      });
      assert.equal(joinRes.ok, true);
      clients.push(c);
    }

    // 2. All ready up
    for (const c of clients) {
      await new Promise((resolve) => {
        c.emit(
          CLIENT_EVENTS.ROOM_READY,
          { ready: true, mapHash: OFFICIAL_MAP_HASH },
          (res) => resolve(res)
        );
      });
    }

    // 3. Host starts match
    const startRes = await new Promise((resolve) => {
      hostClient.emit(CLIENT_EVENTS.ROOM_START, {}, (res) => resolve(res));
    });
    assert.equal(startRes.ok, true);

    const room = roomManager.getRoom(roomCode);
    assert.ok(room);
    assert.equal(room.phase, 'JAIL_SELECTION');

    // 4. Non-host attempts room:restart during match -> rejected
    const nonHostRestart = await new Promise((resolve) => {
      clients[1].emit(CLIENT_EVENTS.ROOM_RESTART, {}, (res) => resolve(res));
    });
    assert.equal(nonHostRestart.ok, false);
    assert.equal(nonHostRestart.code, 'NOT_HOST');

    // 5. Host attempts room:restart before match finishes -> rejected with INVALID_PHASE
    const prematureRestart = await new Promise((resolve) => {
      hostClient.emit(CLIENT_EVENTS.ROOM_RESTART, {}, (res) => resolve(res));
    });
    assert.equal(prematureRestart.ok, false);
    assert.equal(prematureRestart.code, 'INVALID_PHASE');

    // 6. Fast-forward match to RESULT
    room.phase = 'RESULT';
    room.matchResult = { winner: 'POLICE', reason: 'ALL_ROBBERS_JAILED' };
    const initialMatchId = room.matchId;

    // Put mock dirty state on players
    for (const p of room.players.values()) {
      if (p.role === 'ROBBER') {
        p.state = 'JAILED';
        p.jailSlotIndex = 1;
        p.timeJailedMs = 5000;
        p.rescueProgressMs = 1500;
        p.rescueNeedsRelease = true;
      }
    }

    // 7. Host calls room:restart -> clean return to LOBBY
    const restartRes = await new Promise((resolve) => {
      hostClient.emit(CLIENT_EVENTS.ROOM_RESTART, {}, (res) => resolve(res));
    });
    assert.equal(restartRes.ok, true);

    // 8. Assert NO STALE STATE (G05 requirement)
    assert.equal(room.phase, 'LOBBY');
    assert.equal(room.selectedJailId, null);
    assert.equal(room.guardId, null);
    assert.equal(room.matchResult, null);
    assert.notEqual(room.matchId, initialMatchId, 'New matchId must be created');

    for (const p of room.players.values()) {
      assert.equal(p.ready, false, 'Player ready state must be reset to false');
      assert.equal(p.role, null, 'Player role must be reset to null');
      assert.equal(p.isCaptain, false);
      assert.equal(p.state, 'FREE');
      assert.equal(p.guard, false);
      assert.equal(p.jailSlotIndex, undefined);
      assert.equal(p.timeJailedMs, 0);
      assert.equal(p.immuneRemainingMs, 0);
      assert.equal(p.rescueProgressMs, 0);
      assert.equal(p.rescueHeld, false);
      assert.equal(p.rescueNeedsRelease, false);
      assert.equal(p.hideCrouchMs, 0);
      assert.equal(p.inputQueue.length, 0);
      assert.equal(p.lastProcessedSeq, 0);
    }

    // DB room record updated
    const persistedRoom = db.getRoom(roomCode);
    assert.equal(persistedRoom?.phase, 'LOBBY');

    for (const c of clients) {
      c.disconnect();
    }
    roomManager.destroy();
    io.close();
    db.close();
    await new Promise((resolve) => server.close(resolve));
  });
});
