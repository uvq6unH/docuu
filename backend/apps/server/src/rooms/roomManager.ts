import { Server as SocketIOServer, Socket } from 'socket.io';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import {
  PROTOCOL_VERSION,
  GAME_RULES,
  GameRules,
  createGameRules,
  RULES_VERSION,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  AckResponse,
  InputFrame,
} from '@folk-tag/shared';
import { Room } from './room.js';
import type { DatabaseManager } from '../db/index.js';
import { SocketRateLimiter } from '../security/rateLimiter.js';
import {
  sanitizePlayerName,
  validateRoomCode,
  validateInputFrame,
} from '../security/validator.js';

function loadCanonicalMapHash(): string {
  try {
    const candidates = [
      new URL('../../../../../packages/shared/maps/village-v1.json', import.meta.url),
      new URL('../../../../packages/shared/maps/village-v1.json', import.meta.url),
    ];
    for (const url of candidates) {
      if (existsSync(url)) {
        const bytes = readFileSync(url);
        return createHash('sha256').update(bytes).digest('hex');
      }
    }
  } catch {}
  return '7c4d777babc02081d43db29fae94f2b31b118aec59d0ccc72ce9b3391a8d3685';
}

export const OFFICIAL_MAP_HASH = loadCanonicalMapHash();

interface DedupeEntry {
  response: AckResponse;
  timestamp: number;
}

export class RoomManager {
  private io: SocketIOServer;
  private db: DatabaseManager | null = null;
  private rooms: Map<string, Room> = new Map();
  // Request deduplication cache: socketId + requestId -> DedupeEntry
  private dedupeCache: Map<string, DedupeEntry> = new Map();
  // Socket -> { roomCode, playerId }
  private socketBindings: Map<string, { roomCode: string; playerId: string }> = new Map();
  private rateLimiter: SocketRateLimiter = new SocketRateLimiter();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private activeRules: GameRules = GAME_RULES;

  constructor(io: SocketIOServer, db: DatabaseManager | null = null) {
    this.io = io;
    this.db = db;
    this.startCleanupInterval();
    this.registerSocketHandlers();
  }

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.dedupeCache.entries()) {
        if (now - entry.timestamp > GAME_RULES.REQUEST_DEDUPLICATION_TTL_MS) {
          this.dedupeCache.delete(key);
        }
      }
      this.db?.cleanExpiredDeduplication();
    }, 30_000);
    this.cleanupTimer.unref();
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  private dedupeOrExecute<T>(
    socketId: string,
    requestId: string | undefined,
    callback: ((ack: AckResponse<T>) => void) | undefined,
    action: () => AckResponse<T>
  ): void {
    if (!requestId) {
      const res = action();
      if (callback) callback(res);
      return;
    }

    const key = `${socketId}:${requestId}`;
    const cached = this.dedupeCache.get(key);
    if (cached) {
      if (callback) callback(cached.response as AckResponse<T>);
      return;
    }

    if (this.db) {
      const persistentCached = this.db.getDeduplication(requestId);
      if (persistentCached) {
        try {
          const parsed = JSON.parse(persistentCached);
          if (callback) callback(parsed as AckResponse<T>);
          return;
        } catch {}
      }
    }

    const res = action();
    this.dedupeCache.set(key, { response: res, timestamp: Date.now() });
    if (this.db && res) {
      this.db.saveDeduplication(
        requestId,
        (res as any).roomCode || '',
        JSON.stringify(res),
        GAME_RULES.REQUEST_DEDUPLICATION_TTL_MS
      );
    }
    if (callback) callback(res);
  }

  private broadcastRoomState(room: Room): void {
    const state = room.getRoomState();
    this.io.to(room.roomCode).emit(SERVER_EVENTS.ROOM_STATE, state);
  }

  private registerSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      // 1. room:create
      socket.on(
        CLIENT_EVENTS.ROOM_CREATE,
        (
          payload: { requestId?: string; name: string; protocolVersion: number },
          ack?: (res: AckResponse) => void
        ) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const sanitizedName = sanitizePlayerName(payload?.name);
            if (!sanitizedName) {
              return { ok: false, code: 'BAD_PAYLOAD', message: 'Player name is required (1-24 chars)' };
            }
            if (payload.protocolVersion !== PROTOCOL_VERSION) {
              return {
                ok: false,
                code: 'VERSION_MISMATCH',
                message: `Server protocol is v${PROTOCOL_VERSION}, client sent v${payload.protocolVersion}`,
              };
            }

            const roomCode = this.generateRoomCode();
            const playerId = `p-${randomBytes(4).toString('hex')}`;
            const resumeToken = randomBytes(16).toString('hex');

            const room = new Room(roomCode, playerId, OFFICIAL_MAP_HASH, this.activeRules);
            if (this.db) {
              room.setDatabase(this.db);
              this.db.createRoom({
                roomCode,
                hostPlayerId: playerId,
                mapHash: OFFICIAL_MAP_HASH,
                protocolVersion: PROTOCOL_VERSION,
              });
              this.db.upsertPlayer({
                id: playerId,
                roomCode,
                name: sanitizedName,
                isHost: true,
                resumeToken,
              });
            }
            this.rooms.set(roomCode, room);

            room.addPlayer(playerId, sanitizedName, socket, resumeToken, true);
            this.socketBindings.set(socket.id, { roomCode, playerId });

            this.broadcastRoomState(room);

            return {
              ok: true,
              roomCode,
              playerId,
              resumeToken,
              data: { roomCode, playerId, resumeToken },
            } as any;
          });
        }
      );

      // 2. room:join
      socket.on(
        CLIENT_EVENTS.ROOM_JOIN,
        (
          payload: { requestId?: string; roomCode: string; name: string; protocolVersion: number },
          ack?: (res: AckResponse) => void
        ) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const code = validateRoomCode(payload?.roomCode);
            if (!code) {
              return { ok: false, code: 'BAD_PAYLOAD', message: 'Invalid 6-character room code' };
            }
            const sanitizedName = sanitizePlayerName(payload?.name);
            if (!sanitizedName) {
              return { ok: false, code: 'BAD_PAYLOAD', message: 'Player name is required (1-24 chars)' };
            }
            if (payload.protocolVersion !== PROTOCOL_VERSION) {
              return {
                ok: false,
                code: 'VERSION_MISMATCH',
                message: `Server protocol is v${PROTOCOL_VERSION}, client sent v${payload.protocolVersion}`,
              };
            }

            const room = this.rooms.get(code);
            if (!room) {
              return { ok: false, code: 'ROOM_NOT_FOUND', message: `Room ${code} not found` };
            }

            if (room.phase !== 'LOBBY') {
              return { ok: false, code: 'MATCH_IN_PROGRESS', message: 'Match already in progress' };
            }

            if (room.players.size >= GAME_RULES.REQUIRED_PLAYERS) {
              return { ok: false, code: 'ROOM_FULL', message: 'Room already reached 6 players' };
            }

            const playerId = `p-${randomBytes(4).toString('hex')}`;
            const resumeToken = randomBytes(16).toString('hex');

            room.addPlayer(playerId, sanitizedName, socket, resumeToken, false);
            this.socketBindings.set(socket.id, { roomCode: code, playerId });

            if (this.db) {
              this.db.upsertPlayer({
                id: playerId,
                roomCode: code,
                name: sanitizedName,
                isHost: false,
                resumeToken,
              });
            }

            this.broadcastRoomState(room);

            return {
              ok: true,
              roomCode: code,
              playerId,
              resumeToken,
              data: { roomCode: code, playerId, resumeToken },
            } as any;
          });
        }
      );

      // 3. room:ready
      socket.on(
        CLIENT_EVENTS.ROOM_READY,
        (
          payload: { requestId?: string; ready: boolean; mapHash: string },
          ack?: (res: AckResponse) => void
        ) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) {
              return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Not connected to a room' };
            }

            const room = this.rooms.get(binding.roomCode);
            if (!room) {
              return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
            }

            if (payload.mapHash !== OFFICIAL_MAP_HASH && payload.mapHash !== room.mapHash) {
              return {
                ok: false,
                code: 'MAP_MISMATCH',
                message: `Client map hash does not match server official map hash`,
              };
            }

            room.setReady(binding.playerId, Boolean(payload.ready));
            const p = room.players.get(binding.playerId);
            if (p && this.db) {
              this.db.upsertPlayer({
                id: p.id,
                roomCode: room.roomCode,
                name: p.name,
                ready: p.ready,
                isHost: p.isHost,
                resumeToken: p.resumeToken,
              });
            }
            this.broadcastRoomState(room);
            return { ok: true };
          });
        }
      );

      // 4. room:start
      socket.on(
        CLIENT_EVENTS.ROOM_START,
        (payload: { requestId?: string }, ack?: (res: AckResponse) => void) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Not in room' };

            const room = this.rooms.get(binding.roomCode);
            if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };

            if (room.hostId !== binding.playerId) {
              return { ok: false, code: 'NOT_HOST', message: 'Only room host can start the game' };
            }

            const success = room.startMatch(true);
            if (!success) {
              return {
                ok: false,
                code: 'NOT_READY',
                message: 'Requires at least 2 ready players (and all players ready) to start',
              };
            }

            if (this.db) {
              this.db.updateRoom(room.roomCode, { phase: room.phase, captainId: room.captainId });
            }

            this.broadcastRoomState(room);
            return { ok: true };
          });
        }
      );

      // 5. jail:select
      socket.on(
        CLIENT_EVENTS.JAIL_SELECT,
        (payload: { requestId?: string; jailId: string }, ack?: (res: AckResponse) => void) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: false, code: 'ROOM_NOT_FOUND' };
            const room = this.rooms.get(binding.roomCode);
            if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };

            const success = room.selectJail(binding.playerId, payload?.jailId);
            if (!success) {
              return { ok: false, code: 'JAIL_INVALID', message: 'Only captain can select valid jail' };
            }

            this.broadcastRoomState(room);
            return { ok: true };
          });
        }
      );

      // 6. game:input (Rate limited & Validated)
      socket.on(CLIENT_EVENTS.GAME_INPUT, (rawInput: unknown) => {
        if (!this.rateLimiter.checkInput(socket.id)) {
          return; // Drop input exceeding rate limit
        }

        const input = validateInputFrame(rawInput);
        if (!input) {
          return; // Drop malformed packet
        }

        const binding = this.socketBindings.get(socket.id);
        if (!binding) return;
        const room = this.rooms.get(binding.roomCode);
        if (!room) return;
        room.enqueueInput(binding.playerId, input);
      });

      // 7. room:leave
      socket.on(
        CLIENT_EVENTS.ROOM_LEAVE,
        (payload: { requestId?: string }, ack?: (res: AckResponse) => void) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: true };

            const room = this.rooms.get(binding.roomCode);
            if (room) {
              room.removePlayer(binding.playerId);
              this.db?.removePlayer(binding.playerId);
              if (room.players.size > 0) {
                this.broadcastRoomState(room);
              } else {
                this.rooms.delete(binding.roomCode);
                this.db?.closeRoom(binding.roomCode);
              }
            }

            this.socketBindings.delete(socket.id);
            return { ok: true };
          });
        }
      );

      // 8. room:resume (R03 Reconnect Grace 30s)
      socket.on(
        CLIENT_EVENTS.ROOM_RESUME,
        (
          payload: { requestId?: string; roomCode: string; playerId: string; resumeToken: string },
          ack?: (res: AckResponse) => void
        ) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            if (!payload || !payload.roomCode || !payload.playerId || !payload.resumeToken) {
              return { ok: false, code: 'BAD_PAYLOAD', message: 'Missing resume credentials' };
            }

            const code = validateRoomCode(payload.roomCode);
            if (!code) {
              return { ok: false, code: 'ROOM_NOT_FOUND', message: `Invalid room code` };
            }

            const room = this.rooms.get(code);
            if (!room) {
              return { ok: false, code: 'ROOM_NOT_FOUND', message: `Room ${code} not found` };
            }

            const player = room.players.get(payload.playerId);
            if (!player) {
              return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Player not found in room' };
            }

            if (player.resumeToken !== payload.resumeToken) {
              return { ok: false, code: 'TOKEN_INVALID', message: 'Invalid resume token' };
            }

            // Valid resume! Clear disconnect grace timer
            if (player.disconnectTimer) {
              clearTimeout(player.disconnectTimer);
              player.disconnectTimer = null;
            }

            // Bind new socket
            player.socket = socket;
            socket.join(room.roomCode);
            this.socketBindings.set(socket.id, { roomCode: code, playerId: player.id });

            // Rotate resume token
            const newResumeToken = randomBytes(16).toString('hex');
            player.resumeToken = newResumeToken;

            if (this.db) {
              this.db.upsertPlayer({
                id: player.id,
                roomCode: code,
                name: player.name,
                ready: player.ready,
                isHost: player.isHost,
                resumeToken: newResumeToken,
              });
            }

            this.broadcastRoomState(room);

            // Send immediate snapshot if in game
            if (room.phase !== 'LOBBY') {
              room.sendSnapshotToPlayer(player.id);
            }

            return {
              ok: true,
              roomCode: code,
              playerId: player.id,
              resumeToken: newResumeToken,
              data: {
                roomCode: code,
                playerId: player.id,
                resumeToken: newResumeToken,
              },
            } as any;
          });
        }
      );

      // 9. room:restart (G05 Full match restart & Rematch)
      socket.on(
        CLIENT_EVENTS.ROOM_RESTART,
        (payload: { requestId?: string }, ack?: (res: AckResponse) => void) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) {
              return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Not connected to a room' };
            }

            const room = this.rooms.get(binding.roomCode);
            if (!room) {
              return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
            }

            if (room.hostId !== binding.playerId) {
              return { ok: false, code: 'NOT_HOST', message: 'Only room host can restart match' };
            }

            if (room.phase !== 'RESULT') {
              return {
                ok: false,
                code: 'INVALID_PHASE',
                message: 'Match must be in RESULT phase to restart',
              };
            }

            const success = room.restartToLobby();
            if (!success) {
              return { ok: false, code: 'INVALID_PHASE', message: 'Could not restart room' };
            }

            this.broadcastRoomState(room);
            return { ok: true };
          });
        }
      );

      // 10. room:add_bot
      socket.on(
        CLIENT_EVENTS.ROOM_ADD_BOT,
        (payload: { requestId?: string; role?: any }, ack?: (res: AckResponse) => void) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Not connected to a room' };

            const room = this.rooms.get(binding.roomCode);
            if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };

            if (room.hostId !== binding.playerId) {
              return { ok: false, code: 'NOT_HOST', message: 'Only room host can add bots' };
            }

            if (room.phase !== 'LOBBY') {
              return { ok: false, code: 'INVALID_PHASE', message: 'Bots can only be added in lobby' };
            }

            if (room.players.size >= GAME_RULES.REQUIRED_PLAYERS) {
              return { ok: false, code: 'ROOM_FULL', message: 'Room is full (max 6 players)' };
            }

            const bot = room.addBot(payload?.role);
            if (!bot) {
              return { ok: false, code: 'ROOM_FULL', message: 'Could not add bot' };
            }

            this.broadcastRoomState(room);
            return { ok: true, data: { botId: bot.id, botName: bot.name } };
          });
        }
      );

      // 11. room:remove_bot
      socket.on(
        CLIENT_EVENTS.ROOM_REMOVE_BOT,
        (payload: { requestId?: string; botId?: string }, ack?: (res: AckResponse) => void) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Not connected to a room' };

            const room = this.rooms.get(binding.roomCode);
            if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };

            if (room.hostId !== binding.playerId) {
              return { ok: false, code: 'NOT_HOST', message: 'Only room host can remove bots' };
            }

            if (room.phase !== 'LOBBY') {
              return { ok: false, code: 'INVALID_PHASE', message: 'Bots can only be removed in lobby' };
            }

            const success = room.removeBot(payload?.botId);
            if (!success) {
              return { ok: false, code: 'BAD_PAYLOAD', message: 'No bot to remove' };
            }

            this.broadcastRoomState(room);
            return { ok: true };
          });
        }
      );

      // 12. room:set_role
      socket.on(
        CLIENT_EVENTS.ROOM_SET_ROLE,
        (
          payload: { requestId?: string; role: any; targetPlayerId?: string },
          ack?: (res: AckResponse) => void
        ) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Not connected to a room' };

            const room = this.rooms.get(binding.roomCode);
            if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };

            if (room.phase !== 'LOBBY') {
              return { ok: false, code: 'INVALID_PHASE', message: 'Roles can only be changed in lobby' };
            }

            const targetId = payload?.targetPlayerId || binding.playerId;
            if (targetId !== binding.playerId && room.hostId !== binding.playerId) {
              return { ok: false, code: 'NOT_HOST', message: 'Only host can change other players roles' };
            }

            const role = payload?.role === 'POLICE' || payload?.role === 'ROBBER' ? payload.role : null;
            const success = room.setPlayerRole(targetId, role);
            if (!success) {
              return { ok: false, code: 'BAD_PAYLOAD', message: 'Player not found' };
            }

            this.broadcastRoomState(room);
            return { ok: true };
          });
        }
      );

      // 13. room:auto_roles
      socket.on(
        CLIENT_EVENTS.ROOM_AUTO_ROLES,
        (payload: { requestId?: string }, ack?: (res: AckResponse) => void) => {
          if (!this.rateLimiter.checkAction(socket.id)) {
            if (ack) ack({ ok: false, code: 'RATE_LIMIT', message: 'Action rate limit exceeded' });
            return;
          }

          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Not connected to a room' };

            const room = this.rooms.get(binding.roomCode);
            if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };

            if (room.hostId !== binding.playerId) {
              return { ok: false, code: 'NOT_HOST', message: 'Only host can auto-assign roles' };
            }

            if (room.phase !== 'LOBBY') {
              return { ok: false, code: 'INVALID_PHASE', message: 'Roles can only be assigned in lobby' };
            }

            room.autoAssignRoles();
            this.broadcastRoomState(room);
            return { ok: true };
          });
        }
      );

      // Disconnect
      socket.on('disconnect', () => {
        const binding = this.socketBindings.get(socket.id);
        this.rateLimiter.removeSocket(socket.id);

        if (!binding) return;

        const room = this.rooms.get(binding.roomCode);
        if (room) {
          const player = room.players.get(binding.playerId);
          if (player) {
            player.socket = null;
            player.inputQueue = [];
            player.rescueHeld = false;

            // Immediately release guard token if held
            if (room.guardId === player.id) {
              room.guardId = null;
              player.guard = false;
              const guardEvent = {
                eventId: `guard-${room.getCurrentTick()}-disconnect`,
                tick: room.getCurrentTick(),
                type: 'GUARD_CHANGED' as const,
                data: { guardId: null, jailId: room.selectedJailId },
              };
              room.broadcastEvent(guardEvent);
            }

            if (room.phase === 'LOBBY') {
              // In lobby: drop immediately and elect next host
              room.removePlayer(binding.playerId);
              this.db?.removePlayer(binding.playerId);
              if (room.players.size > 0) {
                this.broadcastRoomState(room);
              } else {
                this.rooms.delete(binding.roomCode);
                this.db?.closeRoom(binding.roomCode);
              }
            } else {
              // In match: 30s grace period
              if (player.disconnectTimer) {
                clearTimeout(player.disconnectTimer);
              }
              player.disconnectTimer = setTimeout(() => {
                // If match hasn't finished, abort it
                if (room.phase !== 'RESULT') {
                  room.abortMatch('DISCONNECT_TIMEOUT', player.id);
                  this.broadcastRoomState(room);
                }
              }, GAME_RULES.DISCONNECT_GRACE_TIMEOUT_MS);
              this.broadcastRoomState(room);
            }
          }
        }

        this.socketBindings.delete(socket.id);
      });
    });
  }

  public getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  public getMetrics() {
    const mem = process.memoryUsage();
    const roomsList = Array.from(this.rooms.values());
    const roomMetrics = roomsList.map((r) => r.getMetrics());

    let totalAvg = 0;
    let maxTick = 0;
    let p95Tick = 0;

    if (roomMetrics.length > 0) {
      totalAvg = roomMetrics.reduce((acc, m) => acc + m.avgTickMs, 0) / roomMetrics.length;
      maxTick = Math.max(...roomMetrics.map((m) => m.maxTickMs));
      p95Tick = Math.max(...roomMetrics.map((m) => m.p95TickMs));
    }

    const totalPlayers = roomsList.reduce((acc, r) => acc + r.players.size, 0);

    return {
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      },
      rooms: {
        activeCount: this.rooms.size,
        totalPlayers,
        details: roomMetrics,
      },
      simulation: {
        targetHz: GAME_RULES.SIMULATION_TICK_RATE_HZ,
        avgTickMs: Math.round(totalAvg * 100) / 100,
        maxTickMs: Math.round(maxTick * 100) / 100,
        p95TickMs: Math.round(p95Tick * 100) / 100,
      },
    };
  }

  public getRules(): { rulesVersion: number; rules: GameRules } {
    return { rulesVersion: RULES_VERSION, rules: this.activeRules };
  }

  public setRules(rules: GameRules): void {
    this.activeRules = rules;
  }

  public tuneRules(overrides: Partial<GameRules>): GameRules {
    this.activeRules = createGameRules({ ...this.activeRules, ...overrides });
    return this.activeRules;
  }

  public resetRules(): GameRules {
    this.activeRules = GAME_RULES;
    return this.activeRules;
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.rateLimiter.destroy();
    for (const room of this.rooms.values()) {
      room.stop();
    }
    this.rooms.clear();
    this.socketBindings.clear();
    this.dedupeCache.clear();
  }
}
