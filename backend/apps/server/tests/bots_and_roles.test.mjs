import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../dist/rooms/room.js';
import { OFFICIAL_MAP_HASH } from '../dist/rooms/roomManager.js';
import { GAME_RULES } from '@folk-tag/shared';

test('Bot & Role Selection System', async (t) => {
  await t.test('adds bots up to max 6 players with default ready=true and isBot=true', () => {
    const room = new Room('BOT001', 'p-host', OFFICIAL_MAP_HASH);
    const mockSocket = { join: () => {}, leave: () => {}, emit: () => {}, connected: true };
    room.addPlayer('p-host', 'Host Player', mockSocket, 'token-host', true);

    assert.equal(room.players.size, 1);

    // Add 1st bot
    const bot1 = room.addBot();
    assert.ok(bot1);
    assert.equal(bot1.isBot, true);
    assert.equal(bot1.ready, true);
    assert.equal(bot1.name, 'Máy 1');
    assert.equal(room.players.size, 2);

    // Add 4 more bots -> total 6
    room.addBot();
    room.addBot();
    room.addBot();
    room.addBot();
    assert.equal(room.players.size, 6);

    // Adding 7th player / bot fails because REQUIRED_PLAYERS is 6
    const overflow = room.addBot();
    assert.equal(overflow, null);
    assert.equal(room.players.size, 6);

    const roomState = room.getRoomState();
    assert.equal(roomState.roster.length, 6);
    const botsInRoster = roomState.roster.filter((m) => m.isBot);
    assert.equal(botsInRoster.length, 5);
    for (const b of botsInRoster) {
      assert.equal(b.ready, true);
      assert.equal(b.connected, true);
    }
  });

  await t.test('removes bot correctly', () => {
    const room = new Room('BOT002', 'p-host', OFFICIAL_MAP_HASH);
    const mockSocket = { join: () => {}, leave: () => {}, emit: () => {}, connected: true };
    room.addPlayer('p-host', 'Host Player', mockSocket, 'token-host', true);
    const b1 = room.addBot();
    const b2 = room.addBot();
    assert.equal(room.players.size, 3);

    // Remove specific bot
    const removed1 = room.removeBot(b1.id);
    assert.equal(removed1, true);
    assert.equal(room.players.has(b1.id), false);
    assert.equal(room.players.size, 2);

    // Remove last bot
    const removed2 = room.removeBot();
    assert.equal(removed2, true);
    assert.equal(room.players.has(b2.id), false);
    assert.equal(room.players.size, 1);

    // Remove when no bots
    const removed3 = room.removeBot();
    assert.equal(removed3, false);
  });

  await t.test('allows role selection and auto role division', () => {
    const room = new Room('BOT003', 'p-host', OFFICIAL_MAP_HASH);
    const mockSocket = { join: () => {}, leave: () => {}, emit: () => {}, connected: true };
    room.addPlayer('p-host', 'Host Player', mockSocket, 'token-host', true);
    room.addBot();
    room.addBot();

    // Select role manually
    const success = room.setPlayerRole('p-host', 'POLICE');
    assert.equal(success, true);
    assert.equal(room.players.get('p-host')?.role, 'POLICE');

    // Auto assign roles
    const autoOk = room.autoAssignRoles();
    assert.equal(autoOk, true);

    const policeCount = Array.from(room.players.values()).filter((p) => p.role === 'POLICE').length;
    const robberCount = Array.from(room.players.values()).filter((p) => p.role === 'ROBBER').length;
    // For 3 players: 1 Police, 2 Robbers
    assert.equal(policeCount, 1);
    assert.equal(robberCount, 2);
  });

  await t.test('starts match with bots, respects 6-player role ratio and executes simulation step', () => {
    const room = new Room('BOT004', 'p-host', OFFICIAL_MAP_HASH);
    const mockSocket = { join: () => {}, leave: () => {}, emit: () => {}, connected: true };
    const host = room.addPlayer('p-host', 'Host Player', mockSocket, 'token-host', true);
    host.ready = true;

    // Add 5 bots to fill room
    for (let i = 0; i < 5; i++) {
      room.addBot();
    }

    assert.equal(room.players.size, 6);

    const started = room.startMatch(true);
    assert.equal(started, true);

    const police = Array.from(room.players.values()).filter((p) => p.role === 'POLICE');
    const robbers = Array.from(room.players.values()).filter((p) => p.role === 'ROBBER');
    assert.equal(police.length, 2);
    assert.equal(robbers.length, 4);

    // If host was assigned Police, host is captain. If bot was assigned captain, jail J1 is selected automatically.
    assert.ok(room.captainId);
    assert.ok(room.phase === 'JAIL_SELECTION' || room.phase === 'HEAD_START');

    // Fast-forward to PLAYING phase
    if (room.phase === 'JAIL_SELECTION') {
      room.selectJail(room.captainId, 'J1');
    }
    assert.equal(room.phase, 'HEAD_START');

    // Advance head start
    room.step(GAME_RULES.PHASE_DURATION_HEAD_START_MS + 100);
    assert.equal(room.phase, 'PLAYING');

    // Step simulation in PLAYING phase: bots move autonomously!
    const policeBot = police.find((p) => p.isBot);
    const robberBot = robbers.find((p) => p.isBot);

    assert.ok(policeBot);
    assert.ok(robberBot);

    const initialPolicePos = [...policeBot.movementState.pos];
    const initialRobberPos = [...robberBot.movementState.pos];

    // Run 10 ticks (333ms) of simulation
    for (let t = 0; t < 10; t++) {
      room.step(33.33);
    }

    // Bot positions must have updated due to autonomous AI steering
    const newPolicePos = policeBot.movementState.pos;
    assert.ok(
      Math.abs(newPolicePos[0] - initialPolicePos[0]) > 0.001 ||
      Math.abs(newPolicePos[2] - initialPolicePos[2]) > 0.001,
      'Police bot should move autonomously'
    );
  });
});
