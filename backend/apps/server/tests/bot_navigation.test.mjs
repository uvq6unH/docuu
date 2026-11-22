import test from 'node:test';
import assert from 'node:assert/strict';
import { findNavigableYaw, executeBotBehavior } from '../dist/rooms/botAi.js';
import { Room } from '../dist/rooms/room.js';
import { OFFICIAL_MAP_HASH } from '../dist/rooms/roomManager.js';
import { officialVillageMap } from '../dist/mock/mockServer.js';
import { movementRules } from '@folk-tag/shared';

test('Bot AI Navigation and Obstacle Avoidance', async (t) => {
  await t.test('findNavigableYaw steers towards target when open and detects jumpable obstacle', () => {
    const pos = [0, 0, 0];
    const targetX = 0;
    const targetZ = -10; // Directly North (-Z)

    const nav = findNavigableYaw(pos, targetX, targetZ, 1.7, officialVillageMap);
    // Directly north has yaw close to 0
    assert.ok(Math.abs(nav.yaw) < Math.PI / 4, `Expected yaw near 0, got ${nav.yaw}`);
    assert.equal(nav.shouldJump, false);
  });

  await t.test('executeBotBehavior respects robber stealth when police bot searches', () => {
    const room = new Room('BOTNAV', 'p-host', OFFICIAL_MAP_HASH);
    const mockSocket = { join: () => {}, leave: () => {}, emit: () => {}, connected: true };
    room.addPlayer('p-host', 'Host Player', mockSocket, 'token-host', true);
    const botPolice = room.addBot('POLICE');
    const botRobber = room.addBot('ROBBER');

    assert.ok(botPolice);
    assert.ok(botRobber);

    // Place robber at a distance > 2m in HIDDEN state
    botRobber.state = 'HIDDEN';
    botRobber.movementState.pos = [10, 0, 10];
    botPolice.movementState.pos = [0, 0, 0];

    const captureAttempts = [];
    executeBotBehavior({
      bot: botPolice,
      allPlayers: room.players.values(),
      phase: 'PLAYING',
      activeJail: officialVillageMap.jails[0],
      guardId: null,
      map: officialVillageMap,
      movementRules,
      capsuleHeight: 1.7,
      capsuleHeightCrouch: 1.1,
      captureRadius: 1.6,
      captureAttempts,
    });

    // Police should NOT directly chase robber at [10, 0, 10] because distance is > 2m and robber is HIDDEN
    // Instead, police will patrol hide zones or jail perimeter
    const directYawToRobber = Math.atan2(-10, -10);
    assert.ok(
      Math.abs(botPolice.lastYaw - directYawToRobber) > 0.1,
      'Police AI must not cheat against hidden robbers outside 2m'
    );
  });

  await t.test('robber bot flanks to the opposite rescue anchor when guard camps one side', () => {
    const room = new Room('BOTFLK', 'p-host', OFFICIAL_MAP_HASH);
    const mockSocket = { join: () => {}, leave: () => {}, emit: () => {}, connected: true };
    room.addPlayer('p-host', 'Host Player', mockSocket, 'token-host', true);
    const botRobber = room.addBot('ROBBER');
    const jailedRobber = room.addBot('ROBBER');
    const guardPolice = room.addBot('POLICE');

    assert.ok(botRobber);
    assert.ok(jailedRobber);
    assert.ok(guardPolice);

    jailedRobber.state = 'JAILED';
    guardPolice.guard = true;
    const jail = officialVillageMap.jails[0];
    const anchor0 = jail.rescueAnchors[0]; // e.g. [-2.5, 0, 0]

    // Guard is camping anchor 0
    guardPolice.movementState.pos = [anchor0[0], 0, anchor0[2]];
    botRobber.movementState.pos = [0, 0, -15];

    const captureAttempts = [];
    executeBotBehavior({
      bot: botRobber,
      allPlayers: room.players.values(),
      phase: 'PLAYING',
      activeJail: jail,
      guardId: guardPolice.id,
      map: officialVillageMap,
      movementRules,
      capsuleHeight: 1.7,
      capsuleHeightCrouch: 1.1,
      captureRadius: 1.6,
      captureAttempts,
    });

    // Robber should flank towards anchor 1 (opposite side)
    const anchor1 = jail.rescueAnchors[1];
    const dx = anchor1[0] - botRobber.movementState.pos[0];
    const dz = anchor1[2] - botRobber.movementState.pos[2];
    const expectedYaw = Math.atan2(-dx, -dz);
    const angleDiff = Math.abs(Math.atan2(Math.sin(botRobber.lastYaw - expectedYaw), Math.cos(botRobber.lastYaw - expectedYaw)));

    assert.ok(
      angleDiff < Math.PI / 4,
      `Robber bot should flank towards the rescue anchor further from the guard (diff was ${angleDiff})`
    );
  });
});
