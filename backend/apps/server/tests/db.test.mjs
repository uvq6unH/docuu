import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../dist/db/database.js';

test('DatabaseManager: Full CRUD, Room, Player, Deduplication and Match Stats test suite', () => {
  const db = new DatabaseManager(':memory:');

  // 1. Room CRUD
  db.createRoom({
    roomCode: 'ABC123',
    hostPlayerId: 'p1',
    mapHash: 'mock-hash-1',
    protocolVersion: 1,
  });

  const room = db.getRoom('ABC123');
  assert.ok(room);
  assert.equal(room.room_code, 'ABC123');
  assert.equal(room.host_player_id, 'p1');
  assert.equal(room.phase, 'LOBBY');
  assert.equal(room.map_hash, 'mock-hash-1');

  // Update room phase and selected jail
  db.updateRoom('ABC123', {
    phase: 'PLAYING',
    captainId: 'p1',
    selectedJailId: 'J1',
  });

  const updatedRoom = db.getRoom('ABC123');
  assert.equal(updatedRoom.phase, 'PLAYING');
  assert.equal(updatedRoom.captain_id, 'p1');
  assert.equal(updatedRoom.selected_jail_id, 'J1');

  // 2. Players CRUD
  db.upsertPlayer({
    id: 'p1',
    roomCode: 'ABC123',
    name: 'Alice',
    role: 'POLICE',
    ready: true,
    isHost: true,
    isCaptain: true,
    resumeToken: 'token-alice-1',
  });

  db.upsertPlayer({
    id: 'p2',
    roomCode: 'ABC123',
    name: 'Bob',
    role: 'ROBBER',
    ready: true,
    isHost: false,
    isCaptain: false,
    resumeToken: 'token-bob-2',
  });

  const alice = db.getPlayer('p1');
  assert.ok(alice);
  assert.equal(alice.name, 'Alice');
  assert.equal(alice.role, 'POLICE');
  assert.equal(alice.is_host, 1);
  assert.equal(alice.is_captain, 1);

  const bobByToken = db.getPlayerByToken('token-bob-2');
  assert.ok(bobByToken);
  assert.equal(bobByToken.id, 'p2');
  assert.equal(bobByToken.name, 'Bob');

  const roomPlayers = db.getRoomPlayers('ABC123');
  assert.equal(roomPlayers.length, 2);

  // 3. Request Deduplication with TTL
  db.saveDeduplication('req-create-1', 'ABC123', JSON.stringify({ ok: true, roomCode: 'ABC123' }), 5000);
  const cachedResp = db.getDeduplication('req-create-1');
  assert.ok(cachedResp);
  assert.deepEqual(JSON.parse(cachedResp), { ok: true, roomCode: 'ABC123' });

  // Expired dedup
  db.saveDeduplication('req-expired-1', 'ABC123', JSON.stringify({ ok: false }), -100);
  const expiredResp = db.getDeduplication('req-expired-1');
  assert.equal(expiredResp, null);

  db.cleanExpiredDeduplication();

  // 4. Match Lifecycle & Player Stats
  const matchId = 'match-001';
  db.createMatch({
    matchId,
    roomCode: 'ABC123',
    mapHash: 'mock-hash-1',
    selectedJailId: 'J1',
    phase: 'PLAYING',
  });

  db.upsertPlayerStat({
    matchId,
    playerId: 'p1',
    playerName: 'Alice',
    role: 'POLICE',
  });

  db.upsertPlayerStat({
    matchId,
    playerId: 'p2',
    playerName: 'Bob',
    role: 'ROBBER',
  });

  // Police captures robber
  db.incrementPlayerCapture(matchId, 'p1');
  db.updateRobberState(matchId, 'p2', 'JAILED');

  db.recordGameEvent({
    eventId: 'event-cap-1',
    matchId,
    tick: 15,
    eventType: 'CAPTURE',
    actorId: 'p1',
    targetId: 'p2',
    payload: { jailId: 'J1', slotIndex: 0 },
  });

  // End match
  db.updateMatch(matchId, {
    phase: 'RESULT',
    winner: 'POLICE',
    winReason: 'ALL_ROBBERS_JAILED',
    endedAt: Date.now(),
    durationSeconds: 45.2,
  });

  const match = db.getMatch(matchId);
  assert.ok(match);
  assert.equal(match.winner, 'POLICE');
  assert.equal(match.win_reason, 'ALL_ROBBERS_JAILED');
  assert.equal(match.total_captures, 1);
  assert.equal(match.duration_seconds, 45.2);

  const stats = db.getMatchStats(matchId);
  assert.equal(stats.length, 2);
  const aliceStat = stats.find((s) => s.player_id === 'p1');
  assert.equal(aliceStat.captures_count, 1);
  const bobStat = stats.find((s) => s.player_id === 'p2');
  assert.equal(bobStat.state, 'JAILED');

  const events = db.getMatchEvents(matchId);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'CAPTURE');
  assert.equal(events[0].actor_id, 'p1');
  assert.equal(events[0].target_id, 'p2');
  assert.deepEqual(JSON.parse(events[0].payload_json), { jailId: 'J1', slotIndex: 0 });

  const recent = db.getRecentMatches(5);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].match_id, matchId);

  db.close();
});
