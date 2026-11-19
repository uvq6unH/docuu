import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { RoomManager, OFFICIAL_MAP_HASH } from '../dist/rooms/roomManager.js';
import { PROTOCOL_VERSION, CLIENT_EVENTS, SERVER_EVENTS } from '@folk-tag/shared';

function createTestServer(port) {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: '*' } });
  const roomManager = new RoomManager(io);
  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, io, roomManager }));
  });
}

function connectClient(port) {
  return ClientIO(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  });
}

test('N01 Room Lifecycle & Isolation test suite', async () => {
  const port = 3098;
  const { server, io, roomManager } = await createTestServer(port);

  const client1 = connectClient(port);
  const client2 = connectClient(port);

  await new Promise((resolve) => client1.on('connect', resolve));
  await new Promise((resolve) => client2.on('connect', resolve));

  // 1. room:create
  let createAck;
  await new Promise((resolve) => {
    client1.emit(
      CLIENT_EVENTS.ROOM_CREATE,
      { requestId: 'req-1', name: 'Alice', protocolVersion: PROTOCOL_VERSION },
      (ack) => {
        createAck = ack;
        resolve();
      }
    );
  });

  assert.equal(createAck.ok, true);
  assert.equal(typeof createAck.roomCode, 'string');
  assert.equal(createAck.roomCode.length, 6);
  assert.equal(typeof createAck.playerId, 'string');
  assert.equal(typeof createAck.resumeToken, 'string');

  // 2. Request deduplication
  let dupeAck;
  await new Promise((resolve) => {
    client1.emit(
      CLIENT_EVENTS.ROOM_CREATE,
      { requestId: 'req-1', name: 'Alice_Different', protocolVersion: PROTOCOL_VERSION },
      (ack) => {
        dupeAck = ack;
        resolve();
      }
    );
  });
  assert.deepEqual(dupeAck, createAck);

  // 3. room:join version mismatch
  let joinVersionMismatchAck;
  await new Promise((resolve) => {
    client2.emit(
      CLIENT_EVENTS.ROOM_JOIN,
      { requestId: 'req-j-bad', roomCode: createAck.roomCode, name: 'Bob', protocolVersion: 999 },
      (ack) => {
        joinVersionMismatchAck = ack;
        resolve();
      }
    );
  });
  assert.equal(joinVersionMismatchAck.ok, false);
  assert.equal(joinVersionMismatchAck.code, 'VERSION_MISMATCH');

  // 4. room:join not found
  let joinNotFoundAck;
  await new Promise((resolve) => {
    client2.emit(
      CLIENT_EVENTS.ROOM_JOIN,
      { requestId: 'req-j-404', roomCode: 'ZZZZZZ', name: 'Bob', protocolVersion: PROTOCOL_VERSION },
      (ack) => {
        joinNotFoundAck = ack;
        resolve();
      }
    );
  });
  assert.equal(joinNotFoundAck.ok, false);
  assert.equal(joinNotFoundAck.code, 'ROOM_NOT_FOUND');

  // 5. room:join success
  let joinAck;
  await new Promise((resolve) => {
    client2.emit(
      CLIENT_EVENTS.ROOM_JOIN,
      { requestId: 'req-j-ok', roomCode: createAck.roomCode, name: 'Bob', protocolVersion: PROTOCOL_VERSION },
      (ack) => {
        joinAck = ack;
        resolve();
      }
    );
  });
  assert.equal(joinAck.ok, true);
  assert.equal(joinAck.roomCode, createAck.roomCode);
  assert.notEqual(joinAck.playerId, createAck.playerId);

  // 6. room:ready map mismatch
  let readyBadMapAck;
  await new Promise((resolve) => {
    client1.emit(
      CLIENT_EVENTS.ROOM_READY,
      { requestId: 'req-r-bad', ready: true, mapHash: 'wrong-hash' },
      (ack) => {
        readyBadMapAck = ack;
        resolve();
      }
    );
  });
  assert.equal(readyBadMapAck.ok, false);
  assert.equal(readyBadMapAck.code, 'MAP_MISMATCH');

  // 7. room:ready success with official map hash
  let readyOkAck;
  await new Promise((resolve) => {
    client1.emit(
      CLIENT_EVENTS.ROOM_READY,
      { requestId: 'req-r-ok', ready: true, mapHash: OFFICIAL_MAP_HASH },
      (ack) => {
        readyOkAck = ack;
        resolve();
      }
    );
  });
  assert.equal(readyOkAck.ok, true);

  // 8. room:start by non-host rejected
  let startNonHostAck;
  await new Promise((resolve) => {
    client2.emit(CLIENT_EVENTS.ROOM_START, { requestId: 'req-s-nonhost' }, (ack) => {
      startNonHostAck = ack;
      resolve();
    });
  });
  assert.equal(startNonHostAck.ok, false);
  assert.equal(startNonHostAck.code, 'NOT_HOST');

  // 9. room:start with fewer than 6 players rejected
  let startNotReadyAck;
  await new Promise((resolve) => {
    client1.emit(CLIENT_EVENTS.ROOM_START, { requestId: 'req-s-notready' }, (ack) => {
      startNotReadyAck = ack;
      resolve();
    });
  });
  assert.equal(startNotReadyAck.ok, false);
  assert.equal(startNotReadyAck.code, 'NOT_READY');

  // 10. Clean up
  client1.disconnect();
  client2.disconnect();
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
});
