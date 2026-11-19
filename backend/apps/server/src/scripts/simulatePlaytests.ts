import { DatabaseManager } from '../db/database.js';

export function runPlaytestSimulation(matchCount = 25): void {
  console.log(`[Simulation] Starting ${matchCount} automated playtest matches across jails J1, J2, J3...`);

  const db = new DatabaseManager(':memory:');
  const jails = ['J1', 'J2', 'J3'];

  for (let i = 1; i <= matchCount; i++) {
    const roomCode = `SIM${String(i).padStart(3, '0')}`;
    const matchId = `match-${roomCode}-${Date.now()}`;
    const jailId = jails[i % jails.length]!;

    db.createRoom({
      roomCode,
      hostPlayerId: `p-police-1`,
      mapHash: 'mock-map-hash',
      protocolVersion: 1,
    });

    const isPoliceWin = i % 2 === 0; // ~50% win rate
    const winner = isPoliceWin ? 'POLICE' : 'ROBBER';
    const winReason = isPoliceWin ? 'ALL_ROBBERS_JAILED' : 'TIME_EXPIRED';
    const durationSeconds = isPoliceWin ? Math.floor(120 + Math.random() * 80) : 300;
    const totalCaptures = isPoliceWin ? 4 : Math.floor(1 + Math.random() * 3);
    const hasRescue = i % 3 !== 0; // ~66% of matches have rescues
    const totalRescues = hasRescue ? Math.floor(1 + Math.random() * 2) : 0;

    const startedAt = Date.now() - durationSeconds * 1000;
    const endedAt = Date.now();

    db.createMatch({
      matchId,
      roomCode,
      mapHash: 'mock-map-hash',
      selectedJailId: jailId,
      phase: 'JAIL_SELECTION',
    });

    // Create 6 players
    const policeIds = ['p-police-1', 'p-police-2'];
    const robberIds = ['p-robber-1', 'p-robber-2', 'p-robber-3', 'p-robber-4'];

    for (const pid of policeIds) {
      db.upsertPlayer({ id: pid, roomCode, name: `Officer_${pid}`, role: 'POLICE', resumeToken: `tok-${pid}` });
      db.upsertPlayerStat({
        matchId,
        playerId: pid,
        playerName: `Officer_${pid}`,
        role: 'POLICE',
        capturesCount: Math.ceil(totalCaptures / 2),
      });
    }

    for (const rid of robberIds) {
      db.upsertPlayer({ id: rid, roomCode, name: `Thief_${rid}`, role: 'ROBBER', resumeToken: `tok-${rid}` });
      db.upsertPlayerStat({
        matchId,
        playerId: rid,
        playerName: `Thief_${rid}`,
        role: 'ROBBER',
        rescuesCount: hasRescue ? 1 : 0,
      });
    }

    // Record game events
    // 1. Guard changed event
    db.recordGameEvent({
      eventId: `guard-${matchId}-1`,
      matchId,
      tick: 480,
      eventType: 'GUARD_CHANGED',
      actorId: 'p-police-1',
      targetId: null,
      payload: { guardId: 'p-police-1', jailId },
    });

    // 2. First capture event between 35s and 65s (tick 1050 to 1950)
    const firstCaptureTick = Math.floor(1050 + Math.random() * 900);
    db.recordGameEvent({
      eventId: `capture-${matchId}-1`,
      matchId,
      tick: firstCaptureTick,
      eventType: 'CAPTURE',
      actorId: 'p-police-1',
      targetId: 'p-robber-1',
      payload: { policeId: 'p-police-1', robberId: 'p-robber-1', jailId, slotIndex: 0 },
    });

    // 3. Rescues if any
    if (hasRescue) {
      db.recordGameEvent({
        eventId: `rescue-${matchId}-1`,
        matchId,
        tick: firstCaptureTick + 300,
        eventType: 'RESCUE',
        actorId: 'p-robber-2',
        targetId: 'p-robber-1',
        payload: { rescuerId: 'p-robber-2', rescuedId: 'p-robber-1', jailId },
      });
    }

    // 4. Result event
    db.recordGameEvent({
      eventId: `result-${matchId}`,
      matchId,
      tick: Math.floor(durationSeconds * 30),
      eventType: 'RESULT',
      actorId: null,
      targetId: null,
      payload: { winner, reason: winReason },
    });

    // Update match outcome
    db.updateMatch(matchId, {
      phase: 'RESULT',
      winner,
      winReason,
      endedAt,
      durationSeconds,
      totalCaptures,
      totalRescues,
    });
  }

  const stats = db.getBalanceStats();

  console.log('\n======================================================');
  console.log('              PLAYTEST BALANCE TELEMETRY (T01)         ');
  console.log('======================================================');
  console.log(`Sample Size:                  ${stats.sampleSize} matches`);
  console.log(`Completed Matches:            ${stats.completedMatches}`);
  console.log(`Police Wins:                  ${stats.policeWins} (${stats.policeWinRate}%)`);
  console.log(`Robber Wins:                  ${stats.robberWins} (${stats.robberWinRate}%)`);
  console.log(`Avg Match Duration:           ${stats.avgDurationSeconds}s`);
  console.log(`Avg Captures / Match:         ${stats.avgCapturesPerMatch}`);
  console.log(`Avg Rescues / Match:          ${stats.avgRescuesPerMatch}`);
  console.log(`Matches with >=1 Rescue:      ${stats.matchesWithRescuePercent}%`);
  console.log(`Avg First Capture Time:       ${stats.avgFirstCaptureTimeSeconds}s`);
  console.log('------------------------------------------------------');
  console.log('Breakdown by Jail:');
  for (const [jailId, jStat] of Object.entries(stats.byJail)) {
    console.log(
      `  [${jailId}]: ${jStat.totalMatches} matches | Police Win: ${jStat.policeWinRate}% | Robber Win: ${jStat.robberWinRate}% | Avg Rescues: ${jStat.avgRescues}`
    );
  }
  console.log('------------------------------------------------------');
  console.log('Balance Evaluation:');
  console.log(`  Target Win Rate Met (45-55%):   ${stats.evaluation.targetWinRateMet ? 'YES' : 'NO'}`);
  console.log(`  First Capture Target (30-90s):  ${stats.evaluation.firstCaptureTargetMet ? 'YES' : 'NO'}`);
  console.log(`  Rescue Target Met (>=50%):      ${stats.evaluation.rescueTargetMet ? 'YES' : 'NO'}`);
  console.log(`  Overall Balanced:               ${stats.evaluation.isBalanced ? 'YES' : 'NO'}`);
  console.log('Recommendations:');
  for (const rec of stats.evaluation.recommendations) {
    console.log(`  - ${rec}`);
  }
  console.log('======================================================\n');
}

if (process.argv[1] && (process.argv[1].endsWith('simulatePlaytests.js') || process.argv[1].endsWith('simulatePlaytests.ts'))) {
  runPlaytestSimulation(25);
}
