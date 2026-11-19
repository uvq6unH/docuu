import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_RULES,
  RULES_VERSION,
  createGameRules,
  movementRulesFromGameRules,
} from '@folk-tag/shared';
import { DatabaseManager } from '../dist/db/database.js';
import { Room } from '../dist/rooms/room.js';
import { RoomManager } from '../dist/rooms/roomManager.js';
import { Server as SocketIOServer } from 'socket.io';
import http from 'node:http';

describe('T02: Configurable Rules & Versioning', () => {
  test('RULES_VERSION is 1 and createGameRules provides immutable defaults and overrides', () => {
    assert.equal(RULES_VERSION, 1);

    const defaultRules = createGameRules();
    assert.equal(defaultRules.POLICE_WALK_SPEED, GAME_RULES.POLICE_WALK_SPEED);
    assert.equal(defaultRules.CAPTURE_MAX_DISTANCE_M, 1.6);

    const tunedRules = createGameRules({
      CAPTURE_MAX_DISTANCE_M: 1.45,
      CAPTURE_COOLDOWN_MS: 1300,
    });
    assert.equal(tunedRules.CAPTURE_MAX_DISTANCE_M, 1.45);
    assert.equal(tunedRules.CAPTURE_COOLDOWN_MS, 1300);
    // Other fields remain default
    assert.equal(tunedRules.ROBBER_WALK_SPEED, GAME_RULES.ROBBER_WALK_SPEED);
    assert.equal(tunedRules.RESCUE_REQUIRED_HOLD_MS, 2000);
  });

  test('movementRulesFromGameRules generates valid movement profile from tuned rules', () => {
    const tuned = createGameRules({
      POLICE_WALK_SPEED: 5.0,
      ROBBER_SPRINT_SPEED: 7.2,
    });
    const mov = movementRulesFromGameRules(tuned);
    assert.equal(mov.roles.POLICE.walk, 5.0);
    assert.equal(mov.roles.ROBBER.sprint, 7.2);
    assert.equal(mov.tickHz, 30);
  });

  test('Room respects custom rules passed at instantiation', () => {
    const customRules = createGameRules({
      PHASE_DURATION_JAIL_SELECTION_MS: 5000,
      REQUIRED_PLAYERS: 6,
    });

    const room = new Room('CUST01', 'p-host', 'test-map-hash', customRules);
    assert.equal(room.rules.PHASE_DURATION_JAIL_SELECTION_MS, 5000);

    // Add 6 players and verify startMatch applies the custom 5000ms
    for (let i = 0; i < 6; i++) {
      const pid = `p-${i}`;
      room.addPlayer(pid, `Player_${i}`, { emit: () => {}, join: () => {} }, `token-${i}`, i === 0);
      room.setReady(pid, true);
    }

    const started = room.startMatch();
    assert.equal(started, true);
    assert.equal(room.phase, 'JAIL_SELECTION');
    assert.equal(room.getRemainingMs(), 5000);
    room.stop();
  });

  test('RoomManager supports runtime rules querying, tuning, and resetting', () => {
    const server = http.createServer();
    const io = new SocketIOServer(server);
    const rm = new RoomManager(io);

    const initial = rm.getRules();
    assert.equal(initial.rulesVersion, 1);
    assert.equal(initial.rules.ROBBER_SPRINT_SPEED, 7.5);

    const tuned = rm.tuneRules({ ROBBER_SPRINT_SPEED: 7.2 });
    assert.equal(tuned.ROBBER_SPRINT_SPEED, 7.2);
    assert.equal(rm.getRules().rules.ROBBER_SPRINT_SPEED, 7.2);

    const reset = rm.resetRules();
    assert.equal(reset.ROBBER_SPRINT_SPEED, 7.5);
    assert.equal(rm.getRules().rules.ROBBER_SPRINT_SPEED, 7.5);

    rm.destroy();
    io.close();
  });
});

describe('T01: Balance Telemetry & Stats Aggregation', () => {
  test('DatabaseManager.getBalanceStats() accurately computes win rates, jail breakdown, and balance recommendations', () => {
    const db = new DatabaseManager(':memory:');

    // Simulate 10 matches: 6 Police wins, 4 Robber wins (60% vs 40%) across J1 and J2
    for (let i = 1; i <= 10; i++) {
      const roomCode = `TST${String(i).padStart(3, '0')}`;
      const matchId = `match-${roomCode}`;
      const jailId = i <= 6 ? 'J1' : 'J2';
      const winner = i <= 6 ? 'POLICE' : 'ROBBER';
      const durationSeconds = 150;
      const totalCaptures = i <= 6 ? 4 : 2;
      const totalRescues = i % 2 === 0 ? 1 : 0;

      db.createRoom({ roomCode, hostPlayerId: 'p-1', mapHash: 'test-hash' });
      db.createMatch({ matchId, roomCode, mapHash: 'test-hash', selectedJailId: jailId });

      // First capture event at tick 1200 (40 seconds)
      db.recordGameEvent({
        eventId: `cap-${i}`,
        matchId,
        tick: 1200,
        eventType: 'CAPTURE',
        actorId: 'p-1',
        payload: { robberId: 'p-robber' },
      });

      if (totalRescues > 0) {
        db.recordGameEvent({
          eventId: `res-${i}`,
          matchId,
          tick: 1500,
          eventType: 'RESCUE',
          actorId: 'p-2',
          payload: { rescuedId: 'p-robber' },
        });
      }

      db.updateMatch(matchId, {
        phase: 'RESULT',
        winner,
        winReason: winner === 'POLICE' ? 'ALL_ROBBERS_JAILED' : 'TIME_EXPIRED',
        endedAt: Date.now(),
        durationSeconds,
        totalCaptures,
        totalRescues,
      });
    }

    const stats = db.getBalanceStats();

    assert.equal(stats.completedMatches, 10);
    assert.equal(stats.policeWins, 6);
    assert.equal(stats.robberWins, 4);
    assert.equal(stats.policeWinRate, 60.0);
    assert.equal(stats.robberWinRate, 40.0);
    assert.equal(stats.avgDurationSeconds, 150.0);
    assert.equal(stats.avgFirstCaptureTimeSeconds, 40.0); // 1200 / 30 = 40.0s
    assert.equal(stats.matchesWithRescuePercent, 50.0); // 5 out of 10

    // Jail breakdown
    assert.equal(stats.byJail['J1'].totalMatches, 6);
    assert.equal(stats.byJail['J1'].policeWins, 6);
    assert.equal(stats.byJail['J1'].policeWinRate, 100.0);

    assert.equal(stats.byJail['J2'].totalMatches, 4);
    assert.equal(stats.byJail['J2'].robberWins, 4);
    assert.equal(stats.byJail['J2'].robberWinRate, 100.0);

    // Balance evaluation
    assert.equal(stats.evaluation.firstCaptureTargetMet, true); // 40s is in 30-90s
    assert.equal(stats.evaluation.rescueTargetMet, true); // 50% is >= 50%
    assert.equal(stats.evaluation.targetWinRateMet, false); // 60% > 55%
    assert.ok(stats.evaluation.recommendations.some((r) => r.includes('Tỷ lệ thắng Cảnh sát cao')));

    db.close();
  });
});
