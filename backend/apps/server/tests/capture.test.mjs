import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../dist/rooms/room.js';
import { DatabaseManager } from '../dist/db/database.js';
import { SERVER_EVENTS } from '@folk-tag/shared';

test('G02 Capture: Authoritative Room processes capture, teleports robber to J1, updates jailedCount and broadcasts event', () => {
  const db = new DatabaseManager(':memory:');
  db.createRoom({ roomCode: 'TEST01', hostPlayerId: 'p1', mapHash: 'mock-map-hash' });
  const room = new Room('TEST01', 'p1', 'mock-map-hash');
  db.createMatch({ matchId: room.matchId, roomCode: 'TEST01', mapHash: 'mock-map-hash', selectedJailId: 'J1', phase: 'PLAYING' });
  room.setDatabase(db);
  room.selectedJailId = 'J1';
  room.phase = 'PLAYING';

  const snapshots = [];
  const fakeSocket = {
    emit: (event, data) => {
      if (event === SERVER_EVENTS.GAME_SNAPSHOT) snapshots.push(data);
    },
    join: () => {},
    connected: true,
  };

  const police = room.addPlayer('police-1', 'Police 1', fakeSocket, 'tok-1', true);
  police.role = 'POLICE';
  police.guard = true;
  room.guardId = 'police-1';
  police.movementState.pos = [0, 0, 0]; // facing -Z (yaw = 0)

  const robber1 = room.addPlayer('robber-1', 'Robber 1', fakeSocket, 'tok-2');
  robber1.role = 'ROBBER';
  robber1.movementState.pos = [0, 0, -1.2]; // In front of police (1.2m away)
  robber1.state = 'FREE';

  const robber2 = room.addPlayer('robber-2', 'Robber 2', fakeSocket, 'tok-3');
  robber2.role = 'ROBBER';
  robber2.movementState.pos = [15, 0, 15]; // Far away
  robber2.state = 'FREE';

  const robber3 = room.addPlayer('robber-3', 'Robber 3', fakeSocket, 'tok-4');
  robber3.role = 'ROBBER';
  robber3.movementState.pos = [20, 0, 20];
  robber3.state = 'FREE';

  const robber4 = room.addPlayer('robber-4', 'Robber 4', fakeSocket, 'tok-5');
  robber4.role = 'ROBBER';
  robber4.movementState.pos = [25, 0, 25];
  robber4.state = 'FREE';

  const events = [];
  room.broadcastEvent = (event) => events.push(event);

  try {
    // 1. Police captures robber 1
    police.inputQueue.push({
      seq: 1,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      sprint: false,
      crouch: false,
      rescueHeld: false,
      captureId: 1,
    });

    room.step();

    assert.equal(robber1.state, 'JAILED');
    assert.equal(robber1.jailSlotIndex, 0);
    assert.deepEqual(robber1.movementState.pos, [-0.8, 0, -0.8]); // J1 slot 0

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'CAPTURE');
    assert.equal(events[0].data.robberId, 'robber-1');
    assert.equal(events[0].data.slotIndex, 0);

    // 2. Cooldown check: police immediately attempts another capture
    police.inputQueue.push({
      seq: 2,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      sprint: false,
      crouch: false,
      rescueHeld: false,
      captureId: 2,
    });

    robber2.movementState.pos = [0, 0, -1.0]; // Put robber2 in range during cooldown
    room.step();

    assert.equal(robber2.state, 'FREE'); // Cooldown blocks capture
    assert.equal(events.length, 1);

    // 3. Fast-forward past cooldown (33 ticks = 1100ms)
    for (let i = 0; i < 35; i++) {
      room.step();
    }

    // Police captures robber 2
    police.inputQueue.push({
      seq: 3,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      sprint: false,
      crouch: false,
      rescueHeld: false,
      captureId: 3,
    });

    room.step();

    assert.equal(robber2.state, 'JAILED');
    assert.equal(robber2.jailSlotIndex, 1);
    assert.deepEqual(robber2.movementState.pos, [0.8, 0, -0.8]); // J1 slot 1
    assert.equal(events.length, 2);
    assert.equal(events[1].data.robberId, 'robber-2');
    assert.equal(events[1].data.slotIndex, 1);

    // 4. Jailed robber input is restricted: cannot walk out of jail
    robber1.inputQueue.push({
      seq: 1,
      moveX: 1,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      sprint: true,
      crouch: false,
      rescueHeld: false,
      captureId: 0,
    });
    room.step();
    // Pos remains locked at J1 slot 0
    assert.deepEqual(robber1.movementState.pos, [-0.8, 0, -0.8]);

    // 5. Fast forward and capture remaining robbers (robber 3 & 4) to verify POLICE win
    for (let i = 0; i < 35; i++) room.step();
    robber3.movementState.pos = [0, 0, -1.0];
    police.inputQueue.push({ seq: 4, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, rescueHeld: false, captureId: 4 });
    room.step();
    assert.equal(robber3.state, 'JAILED');
    assert.equal(robber3.jailSlotIndex, 2);

    for (let i = 0; i < 35; i++) room.step();
    robber4.movementState.pos = [0, 0, -1.0];
    police.inputQueue.push({ seq: 5, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, rescueHeld: false, captureId: 5 });
    room.step();
    assert.equal(robber4.state, 'JAILED');
    assert.equal(robber4.jailSlotIndex, 3);

    // All 4 robbers are jailed -> Room transitions to RESULT with winner: 'POLICE'
    assert.equal(room.phase, 'RESULT');
    const resultEvent = events.find((e) => e.type === 'RESULT');
    assert.ok(resultEvent);
    assert.equal(resultEvent.data.winner, 'POLICE');

    // Verify DB recorded all capture events and result
    const dbEvents = db.getMatchEvents(room.matchId);
    assert.equal(dbEvents.length, 5); // 4 captures + 1 result
    assert.equal(dbEvents.filter((e) => e.event_type === 'CAPTURE').length, 4);
    assert.equal(dbEvents.find((e) => e.event_type === 'RESULT')?.actor_id, null);
  } finally {
    room.stop();
    db.close();
  }
});
