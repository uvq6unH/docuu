import { DatabaseSync, StatementSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_SQL } from './schema.js';

export interface RoomRecord {
  room_code: string;
  host_player_id: string;
  phase: string;
  map_hash: string;
  protocol_version: number;
  captain_id: string | null;
  selected_jail_id: string | null;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
}

export interface PlayerRecord {
  id: string;
  room_code: string;
  name: string;
  role: string | null;
  ready: number;
  is_host: number;
  is_captain: number;
  resume_token: string;
  connected: number;
  created_at: number;
  last_active_at: number;
}

export interface MatchRecord {
  match_id: string;
  room_code: string;
  map_hash: string;
  selected_jail_id: string | null;
  phase: string;
  winner: string | null;
  win_reason: string | null;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number;
  total_captures: number;
  total_rescues: number;
}

export interface MatchPlayerStatRecord {
  id?: number;
  match_id: string;
  player_id: string;
  player_name: string;
  role: string;
  captures_count: number;
  rescues_count: number;
  time_jailed_ms: number;
  state: string;
  created_at: number;
  updated_at: number;
}

export interface GameEventRecord {
  id?: number;
  event_id: string;
  match_id: string;
  tick: number;
  event_type: string;
  actor_id: string | null;
  target_id: string | null;
  payload_json: string;
  created_at: number;
}

export interface JailBalanceStat {
  jailId: string;
  totalMatches: number;
  policeWins: number;
  robberWins: number;
  policeWinRate: number;
  robberWinRate: number;
  avgDurationSeconds: number;
  avgCaptures: number;
  avgRescues: number;
}

export interface BalanceTelemetry {
  sampleSize: number;
  completedMatches: number;
  abortedMatches: number;
  policeWins: number;
  robberWins: number;
  policeWinRate: number;
  robberWinRate: number;
  avgDurationSeconds: number;
  avgCapturesPerMatch: number;
  avgRescuesPerMatch: number;
  matchesWithRescuePercent: number;
  avgFirstCaptureTimeSeconds: number | null;
  byJail: Record<string, JailBalanceStat>;
  evaluation: {
    targetWinRateMet: boolean;
    firstCaptureTargetMet: boolean;
    rescueTargetMet: boolean;
    isBalanced: boolean;
    recommendations: string[];
  };
}

export class DatabaseManager {
  private db: DatabaseSync;
  public readonly path: string;

  constructor(dbPath = ':memory:') {
    this.path = dbPath;
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(SCHEMA_SQL);
  }

  // --- Rooms ---

  public createRoom(room: {
    roomCode: string;
    hostPlayerId: string;
    mapHash: string;
    protocolVersion?: number;
    phase?: string;
  }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO rooms (room_code, host_player_id, phase, map_hash, protocol_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      room.roomCode,
      room.hostPlayerId,
      room.phase || 'LOBBY',
      room.mapHash,
      room.protocolVersion ?? 1,
      now,
      now
    );
  }

  public getRoom(roomCode: string): RoomRecord | null {
    const stmt = this.db.prepare('SELECT * FROM rooms WHERE room_code = ?');
    const result = stmt.get(roomCode) as unknown as RoomRecord | undefined;
    return result || null;
  }

  public updateRoom(
    roomCode: string,
    updates: Partial<{
      phase: string;
      captainId: string | null;
      selectedJailId: string | null;
      hostPlayerId: string;
    }>
  ): void {
    const fields: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [Date.now()];

    if (updates.phase !== undefined) {
      fields.push('phase = ?');
      values.push(updates.phase);
    }
    if (updates.captainId !== undefined) {
      fields.push('captain_id = ?');
      values.push(updates.captainId);
    }
    if (updates.selectedJailId !== undefined) {
      fields.push('selected_jail_id = ?');
      values.push(updates.selectedJailId);
    }
    if (updates.hostPlayerId !== undefined) {
      fields.push('host_player_id = ?');
      values.push(updates.hostPlayerId);
    }

    values.push(roomCode);
    const sql = `UPDATE rooms SET ${fields.join(', ')} WHERE room_code = ?`;
    this.db.prepare(sql).run(...values);
  }

  public closeRoom(roomCode: string): void {
    this.db
      .prepare('UPDATE rooms SET closed_at = ?, updated_at = ? WHERE room_code = ?')
      .run(Date.now(), Date.now(), roomCode);
  }

  // --- Players ---

  public upsertPlayer(player: {
    id: string;
    roomCode: string;
    name: string;
    role?: string | null;
    ready?: boolean;
    isHost?: boolean;
    isCaptain?: boolean;
    resumeToken: string;
    connected?: boolean;
  }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO players (id, room_code, name, role, ready, is_host, is_captain, resume_token, connected, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        ready = excluded.ready,
        is_host = excluded.is_host,
        is_captain = excluded.is_captain,
        resume_token = excluded.resume_token,
        connected = excluded.connected,
        last_active_at = excluded.last_active_at
    `);
    stmt.run(
      player.id,
      player.roomCode,
      player.name,
      player.role ?? null,
      player.ready ? 1 : 0,
      player.isHost ? 1 : 0,
      player.isCaptain ? 1 : 0,
      player.resumeToken,
      player.connected !== false ? 1 : 0,
      now,
      now
    );
  }

  public getPlayer(playerId: string): PlayerRecord | null {
    const stmt = this.db.prepare('SELECT * FROM players WHERE id = ?');
    const result = stmt.get(playerId) as unknown as PlayerRecord | undefined;
    return result || null;
  }

  public getPlayerByToken(resumeToken: string): PlayerRecord | null {
    const stmt = this.db.prepare('SELECT * FROM players WHERE resume_token = ?');
    const result = stmt.get(resumeToken) as unknown as PlayerRecord | undefined;
    return result || null;
  }

  public getRoomPlayers(roomCode: string): PlayerRecord[] {
    const stmt = this.db.prepare('SELECT * FROM players WHERE room_code = ? ORDER BY created_at ASC');
    return stmt.all(roomCode) as unknown as PlayerRecord[];
  }

  public removePlayer(playerId: string): void {
    this.db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
  }

  // --- Request Deduplication (60s TTL) ---

  public saveDeduplication(requestId: string, roomCode: string, responseJson: string, ttlMs = 60_000): void {
    const expiresAt = Date.now() + ttlMs;
    const stmt = this.db.prepare(`
      INSERT INTO request_dedup (request_id, room_code, response_json, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET
        response_json = excluded.response_json,
        expires_at = excluded.expires_at
    `);
    stmt.run(requestId, roomCode, responseJson, expiresAt);
  }

  public getDeduplication(requestId: string): string | null {
    const now = Date.now();
    const stmt = this.db.prepare('SELECT response_json FROM request_dedup WHERE request_id = ? AND expires_at > ?');
    const res = stmt.get(requestId, now) as { response_json: string } | undefined;
    return res ? res.response_json : null;
  }

  public cleanExpiredDeduplication(): void {
    this.db.prepare('DELETE FROM request_dedup WHERE expires_at <= ?').run(Date.now());
  }

  // --- Matches ---

  public createMatch(match: {
    matchId: string;
    roomCode: string;
    mapHash: string;
    selectedJailId?: string | null;
    phase?: string;
  }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO matches (match_id, room_code, map_hash, selected_jail_id, phase, started_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      match.matchId,
      match.roomCode,
      match.mapHash,
      match.selectedJailId ?? null,
      match.phase || 'JAIL_SELECTION',
      now
    );
  }

  public updateMatch(
    matchId: string,
    updates: Partial<{
      phase: string;
      selectedJailId: string | null;
      winner: 'POLICE' | 'ROBBER' | 'ABORTED' | null;
      winReason: string | null;
      endedAt: number;
      durationSeconds: number;
      totalCaptures: number;
      totalRescues: number;
    }>
  ): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.phase !== undefined) {
      fields.push('phase = ?');
      values.push(updates.phase);
    }
    if (updates.selectedJailId !== undefined) {
      fields.push('selected_jail_id = ?');
      values.push(updates.selectedJailId);
    }
    if (updates.winner !== undefined) {
      fields.push('winner = ?');
      values.push(updates.winner);
    }
    if (updates.winReason !== undefined) {
      fields.push('win_reason = ?');
      values.push(updates.winReason);
    }
    if (updates.endedAt !== undefined) {
      fields.push('ended_at = ?');
      values.push(updates.endedAt);
    }
    if (updates.durationSeconds !== undefined) {
      fields.push('duration_seconds = ?');
      values.push(updates.durationSeconds);
    }
    if (updates.totalCaptures !== undefined) {
      fields.push('total_captures = ?');
      values.push(updates.totalCaptures);
    }
    if (updates.totalRescues !== undefined) {
      fields.push('total_rescues = ?');
      values.push(updates.totalRescues);
    }

    if (fields.length === 0) return;
    values.push(matchId);
    const sql = `UPDATE matches SET ${fields.join(', ')} WHERE match_id = ?`;
    this.db.prepare(sql).run(...values);
  }

  public getMatch(matchId: string): MatchRecord | null {
    const stmt = this.db.prepare('SELECT * FROM matches WHERE match_id = ?');
    const result = stmt.get(matchId) as unknown as MatchRecord | undefined;
    return result || null;
  }

  public getRecentMatches(limit = 10): MatchRecord[] {
    const stmt = this.db.prepare('SELECT * FROM matches ORDER BY started_at DESC LIMIT ?');
    return stmt.all(limit) as unknown as MatchRecord[];
  }

  // --- Match Player Stats ---

  public upsertPlayerStat(stat: {
    matchId: string;
    playerId: string;
    playerName: string;
    role: string;
    capturesCount?: number;
    rescuesCount?: number;
    timeJailedMs?: number;
    state?: string;
  }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO match_player_stats (
        match_id, player_id, player_name, role, captures_count, rescues_count, time_jailed_ms, state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id, player_id) DO UPDATE SET
        captures_count = excluded.captures_count,
        rescues_count = excluded.rescues_count,
        time_jailed_ms = excluded.time_jailed_ms,
        state = excluded.state,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      stat.matchId,
      stat.playerId,
      stat.playerName,
      stat.role,
      stat.capturesCount ?? 0,
      stat.rescuesCount ?? 0,
      stat.timeJailedMs ?? 0,
      stat.state || 'FREE',
      now,
      now
    );
  }

  public incrementPlayerCapture(matchId: string, policeId: string): void {
    const now = Date.now();
    this.db
      .prepare(`
        UPDATE match_player_stats
        SET captures_count = captures_count + 1, updated_at = ?
        WHERE match_id = ? AND player_id = ?
      `)
      .run(now, matchId, policeId);

    this.db
      .prepare(`
        UPDATE matches
        SET total_captures = total_captures + 1
        WHERE match_id = ?
      `)
      .run(matchId);
  }

  public incrementPlayerRescue(matchId: string, rescuerId: string): void {
    const now = Date.now();
    this.db
      .prepare(`
        UPDATE match_player_stats
        SET rescues_count = rescues_count + 1, updated_at = ?
        WHERE match_id = ? AND player_id = ?
      `)
      .run(now, matchId, rescuerId);

    this.db
      .prepare(`
        UPDATE matches
        SET total_rescues = total_rescues + 1
        WHERE match_id = ?
      `)
      .run(matchId);
  }

  public updateRobberState(matchId: string, robberId: string, state: string): void {
    const now = Date.now();
    this.db
      .prepare(`
        UPDATE match_player_stats
        SET state = ?, updated_at = ?
        WHERE match_id = ? AND player_id = ?
      `)
      .run(state, now, matchId, robberId);
  }

  public getMatchStats(matchId: string): MatchPlayerStatRecord[] {
    const stmt = this.db.prepare('SELECT * FROM match_player_stats WHERE match_id = ? ORDER BY role DESC, player_name ASC');
    return stmt.all(matchId) as unknown as MatchPlayerStatRecord[];
  }

  // --- Game Events ---

  public recordGameEvent(event: {
    eventId: string;
    matchId: string;
    tick: number;
    eventType: string;
    actorId?: string | null;
    targetId?: string | null;
    payload: unknown;
  }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO game_events (event_id, match_id, tick, event_type, actor_id, target_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.eventId,
      event.matchId,
      event.tick,
      event.eventType,
      event.actorId ?? null,
      event.targetId ?? null,
      JSON.stringify(event.payload),
      now
    );
  }

  public getMatchEvents(matchId: string): GameEventRecord[] {
    const stmt = this.db.prepare('SELECT * FROM game_events WHERE match_id = ? ORDER BY tick ASC, id ASC');
    return stmt.all(matchId) as unknown as GameEventRecord[];
  }

  // --- Balance Telemetry & Analytics (T01) ---

  public getBalanceStats(): BalanceTelemetry {
    const allMatches = this.db.prepare('SELECT * FROM matches').all() as unknown as MatchRecord[];
    const completedMatches = allMatches.filter(
      (m) => m.phase === 'RESULT' && (m.winner === 'POLICE' || m.winner === 'ROBBER')
    );
    const abortedMatches = allMatches.filter((m) => m.winner === 'ABORTED').length;

    const policeWins = completedMatches.filter((m) => m.winner === 'POLICE').length;
    const robberWins = completedMatches.filter((m) => m.winner === 'ROBBER').length;
    const completedCount = completedMatches.length;

    const policeWinRate = completedCount > 0 ? Math.round((policeWins / completedCount) * 1000) / 10 : 0;
    const robberWinRate = completedCount > 0 ? Math.round((robberWins / completedCount) * 1000) / 10 : 0;

    const totalDuration = completedMatches.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
    const avgDurationSeconds = completedCount > 0 ? Math.round((totalDuration / completedCount) * 10) / 10 : 0;

    const totalCaptures = completedMatches.reduce((acc, m) => acc + (m.total_captures || 0), 0);
    const avgCapturesPerMatch = completedCount > 0 ? Math.round((totalCaptures / completedCount) * 10) / 10 : 0;

    const totalRescues = completedMatches.reduce((acc, m) => acc + (m.total_rescues || 0), 0);
    const avgRescuesPerMatch = completedCount > 0 ? Math.round((totalRescues / completedCount) * 10) / 10 : 0;

    const matchesWithRescue = completedMatches.filter((m) => m.total_rescues > 0).length;
    const matchesWithRescuePercent = completedCount > 0 ? Math.round((matchesWithRescue / completedCount) * 1000) / 10 : 0;

    // First capture time analysis
    const firstCapturesStmt = this.db.prepare(`
      SELECT ge.match_id, MIN(ge.tick) as first_tick, MIN(ge.created_at) as first_capture_time, m.started_at
      FROM game_events ge
      JOIN matches m ON ge.match_id = m.match_id
      WHERE ge.event_type = 'CAPTURE' AND m.phase = 'RESULT' AND m.winner IN ('POLICE', 'ROBBER')
      GROUP BY ge.match_id
    `);
    const firstCaptures = firstCapturesStmt.all() as {
      match_id: string;
      first_tick: number;
      first_capture_time: number;
      started_at: number;
    }[];

    let avgFirstCaptureTimeSeconds: number | null = null;
    if (firstCaptures.length > 0) {
      const sumTimes = firstCaptures.reduce((acc, fc) => {
        const timeSec = fc.first_tick > 0 ? fc.first_tick / 30 : Math.max(0, (fc.first_capture_time - fc.started_at) / 1000);
        return acc + timeSec;
      }, 0);
      avgFirstCaptureTimeSeconds = Math.round((sumTimes / firstCaptures.length) * 10) / 10;
    }

    // Stats by Jail candidate
    const byJail: Record<string, JailBalanceStat> = {};
    const jailIds = ['J1', 'J2', 'J3'];
    for (const jailId of jailIds) {
      const jailMatches = completedMatches.filter((m) => m.selected_jail_id === jailId);
      const count = jailMatches.length;
      const pWins = jailMatches.filter((m) => m.winner === 'POLICE').length;
      const rWins = jailMatches.filter((m) => m.winner === 'ROBBER').length;
      const jDuration = jailMatches.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
      const jCaptures = jailMatches.reduce((acc, m) => acc + (m.total_captures || 0), 0);
      const jRescues = jailMatches.reduce((acc, m) => acc + (m.total_rescues || 0), 0);

      byJail[jailId] = {
        jailId,
        totalMatches: count,
        policeWins: pWins,
        robberWins: rWins,
        policeWinRate: count > 0 ? Math.round((pWins / count) * 1000) / 10 : 0,
        robberWinRate: count > 0 ? Math.round((rWins / count) * 1000) / 10 : 0,
        avgDurationSeconds: count > 0 ? Math.round((jDuration / count) * 10) / 10 : 0,
        avgCaptures: count > 0 ? Math.round((jCaptures / count) * 10) / 10 : 0,
        avgRescues: count > 0 ? Math.round((jRescues / count) * 10) / 10 : 0,
      };
    }

    // Balance evaluation per GAMEPLAY.md:78
    const recommendations: string[] = [];
    let targetWinRateMet = false;
    let firstCaptureTargetMet = false;
    let rescueTargetMet = false;

    if (completedCount >= 5) {
      targetWinRateMet = policeWinRate >= 45 && policeWinRate <= 55;
      if (policeWinRate > 55) {
        recommendations.push(
          'Tỷ lệ thắng Cảnh sát cao (>55%): Giảm tầm bắt 0.15m (CAPTURE_MAX_DISTANCE_M = 1.45) hoặc tăng hồi chiêu bắt (CAPTURE_COOLDOWN_MS = 1300).'
        );
      } else if (robberWinRate > 55) {
        recommendations.push(
          'Tỷ lệ thắng Cướp cao (>55%): Giảm tốc độ chạy nước rút của cướp 0.3m/s (ROBBER_SPRINT_SPEED = 7.2) hoặc giảm thời gian head start 5s.'
        );
      } else {
        recommendations.push('Tỷ lệ thắng cân bằng trong mục tiêu 45–55%.');
      }

      if (avgFirstCaptureTimeSeconds !== null) {
        firstCaptureTargetMet = avgFirstCaptureTimeSeconds >= 30 && avgFirstCaptureTimeSeconds <= 90;
        if (avgFirstCaptureTimeSeconds < 30) {
          recommendations.push('Thời gian bắt đầu tiên quá nhanh (<30s): Cân nhắc tăng thời gian trốn hoặc thêm vật cản.');
        } else if (avgFirstCaptureTimeSeconds > 90) {
          recommendations.push('Thời gian bắt đầu tiên quá chậm (>90s): Cân nhắc tăng tốc độ đi bộ của cảnh sát.');
        } else {
          recommendations.push('Thời gian bắt đầu tiên đạt chuẩn 30–90s.');
        }
      }

      rescueTargetMet = matchesWithRescuePercent >= 50;
      if (!rescueTargetMet) {
        recommendations.push('Tỷ lệ trận có giải cứu thấp (<50%): Cân nhắc giảm thời gian giữ phím cứu (RESCUE_REQUIRED_HOLD_MS = 1500).');
      } else {
        recommendations.push('Tỷ lệ trận có giải cứu đạt chuẩn (≥50%).');
      }

      // Check jail bias
      for (const [jId, jStat] of Object.entries(byJail)) {
        if (jStat.totalMatches >= 3) {
          if (Math.abs(jStat.policeWinRate - policeWinRate) >= 25) {
            recommendations.push(
              `Vị trí nhà giam ${jId} có độ lệch tỷ lệ thắng đáng kể so với trung bình (${jStat.policeWinRate}% vs ${policeWinRate}%).`
            );
          }
        }
      }
    } else {
      recommendations.push(`Cần thêm mẫu chơi thử nghiệm (hiện có ${completedCount} trận completed, khuyến nghị 20–30 trận).`);
    }

    const isBalanced = targetWinRateMet && (firstCaptureTargetMet || avgFirstCaptureTimeSeconds === null) && rescueTargetMet;

    return {
      sampleSize: allMatches.length,
      completedMatches: completedCount,
      abortedMatches,
      policeWins,
      robberWins,
      policeWinRate,
      robberWinRate,
      avgDurationSeconds,
      avgCapturesPerMatch,
      avgRescuesPerMatch,
      matchesWithRescuePercent,
      avgFirstCaptureTimeSeconds,
      byJail,
      evaluation: {
        targetWinRateMet,
        firstCaptureTargetMet,
        rescueTargetMet,
        isBalanced,
        recommendations,
      },
    };
  }

  // --- Teardown / Close / Health ---

  public checkHealth(): boolean {
    try {
      const res = this.db.prepare('SELECT 1 as alive').get() as { alive: number } | undefined;
      return res?.alive === 1;
    } catch {
      return false;
    }
  }

  public close(): void {
    this.db.close();
  }
}
