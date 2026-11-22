import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { DatabaseManager } from '../dist/db/database.js';
import { RoomManager } from '../dist/rooms/roomManager.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@folk-tag/shared';

describe('Enhancements & Social/Tactical Systems Test Suite', () => {
  it('handles public room listing, cosmetics, ping, chat, pebble and MVP calculation', async () => {
    const db = new DatabaseManager(':memory:');
    const server = createServer();
    const io = new SocketIOServer(server);
    const roomManager = new RoomManager(io, db);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const connectClient = async () => {
      const client = ClientIO(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });
      await new Promise((resolve) => client.on('connect', resolve));
      return client;
    };

    // 1. Host creates room
    const hostClient = await connectClient();
    const createRes = await new Promise((resolve) => {
      hostClient.emit(
        CLIENT_EVENTS.ROOM_CREATE,
        { name: 'HostAlice', protocolVersion: 1 },
        (res) => resolve(res)
      );
    });
    assert.equal(createRes.ok, true);
    const roomCode = createRes.roomCode;

    // 2. Second player connects and tests ROOM_LIST before joining
    const client2 = await connectClient();
    const listRes = await new Promise((resolve) => {
      client2.emit(CLIENT_EVENTS.ROOM_LIST, {}, (res) => resolve(res));
    });
    assert.equal(listRes.ok, true);
    assert.ok(Array.isArray(listRes.data));
    const publicRoom = listRes.data.find((r) => r.roomCode === roomCode);
    assert.ok(publicRoom, 'Room should appear in public rooms list');
    assert.equal(publicRoom.hostName, 'HostAlice');
    assert.equal(publicRoom.playerCount, 1);
    assert.equal(publicRoom.phase, 'LOBBY');

    // Join player 2
    const joinRes = await new Promise((resolve) => {
      client2.emit(
        CLIENT_EVENTS.ROOM_JOIN,
        { roomCode, name: 'BobRobber', protocolVersion: 1 },
        (res) => resolve(res)
      );
    });
    assert.equal(joinRes.ok, true);

    // 3. Test cosmetic customization
    const cosmeticAck = await new Promise((resolve) => {
      client2.emit(
        CLIENT_EVENTS.ROOM_SET_COSMETIC,
        { cosmetic: { hat: 'non_la', shirtColor: '#8b5a2b' } },
        (res) => resolve(res)
      );
    });
    assert.equal(cosmeticAck.ok, true);

    const room = roomManager.getRoom(roomCode);
    assert.ok(room);
    const p2 = room.players.get(joinRes.playerId);
    assert.ok(p2);
    assert.equal(p2.cosmetic?.hat, 'non_la');
    assert.equal(p2.cosmetic?.shirtColor, '#8b5a2b');

    // Set roles
    const hostPlayer = room.players.get(createRes.playerId);
    assert.ok(hostPlayer);
    hostPlayer.role = 'POLICE';
    p2.role = 'ROBBER';

    // 4. Test quick chat broadcast
    const chatReceivedPromise = new Promise((resolve) => {
      client2.once(SERVER_EVENTS.GAME_CHAT_EVENT, (data) => resolve(data));
    });
    hostClient.emit(CLIENT_EVENTS.GAME_CHAT, {
      text: 'Bao vây khu vực đình làng!',
      teamOnly: false,
    });
    const chatData = await chatReceivedPromise;
    assert.equal(chatData.senderName, 'HostAlice');
    assert.equal(chatData.text, 'Bao vây khu vực đình làng!');

    // 5. Test tactical ping broadcast within team
    // Create a 3rd client (Police) to receive police ping
    const police2Client = await connectClient();
    const join3Res = await new Promise((resolve) => {
      police2Client.emit(
        CLIENT_EVENTS.ROOM_JOIN,
        { roomCode, name: 'CharlieCop', protocolVersion: 1 },
        (res) => resolve(res)
      );
    });
    assert.equal(join3Res.ok, true);
    const p3 = room.players.get(join3Res.playerId);
    assert.ok(p3);
    p3.role = 'POLICE';

    const pingReceivedPromise = new Promise((resolve) => {
      police2Client.once(SERVER_EVENTS.GAME_PING_EVENT, (data) => resolve(data));
    });
    hostClient.emit(CLIENT_EVENTS.GAME_PING, {
      pos: [12, 0.5, -8],
    });
    const pingData = await pingReceivedPromise;
    assert.equal(pingData.senderId, hostPlayer.id);
    assert.equal(pingData.pos[0], 12);

    // 6. Test pebble distraction broadcast & bot alertness
    const pebbleReceivedPromise = new Promise((resolve) => {
      hostClient.once(SERVER_EVENTS.GAME_PEBBLE_EVENT, (data) => resolve(data));
    });
    client2.emit(CLIENT_EVENTS.GAME_PEBBLE, {
      fromPos: [0, 1, 0],
      landingPos: [10, 0, 10],
    });
    const pebbleData = await pebbleReceivedPromise;
    assert.equal(pebbleData.senderId, p2.id);
    assert.equal(pebbleData.landingPos[0], 10);

    // 7. Test authoritative MVP computation
    hostPlayer.ready = true;
    p2.ready = true;
    p3.ready = true;
    const started = room.startMatch(true);
    assert.equal(started, true);

    // Simulate match gameplay stats
    room.playerStats.get(hostPlayer.id).captures = 3;
    room.playerStats.get(p2.id).rescues = 2;
    room.playerStats.get(p3.id).captures = 1;

    // Finish match
    room.finishMatch('POLICE', 'ALL_ROBBERS_JAILED');

    assert.equal(room.phase, 'RESULT');
    assert.ok(room.matchResult);
    assert.equal(room.matchResult.winner, 'POLICE');
    assert.equal(room.matchResult.mvpPolice, hostPlayer.id);
    assert.equal(room.matchResult.mvpRobber, p2.id);
    assert.ok(room.matchResult.stats);

    assert.equal(room.matchResult.stats[hostPlayer.id].captures, 3);
    assert.equal(room.matchResult.stats[p2.id].rescues, 2);

    roomManager.destroy();
    hostClient.disconnect();
    client2.disconnect();
    police2Client.disconnect();
    io.close();
    db.close();
    await new Promise((resolve) => server.close(resolve));
  });
});
