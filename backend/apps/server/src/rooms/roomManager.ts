import { Server as SocketIOServer, Socket } from 'socket.io';
import { randomBytes } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  GAME_RULES,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  AckResponse,
  InputFrame,
} from '@folk-tag/shared';
import { Room } from './room.js';

export const OFFICIAL_MAP_HASH = '575da3894a9c077ea9c0d2c166f5e79ea372706d52d7dd84ffc9dc93880f95ba';

interface DedupeEntry {
  response: AckResponse;
  timestamp: number;
}

export class RoomManager {
  private io: SocketIOServer;
  private rooms: Map<string, Room> = new Map();
  // Request deduplication cache: socketId + requestId -> DedupeEntry
  private dedupeCache: Map<string, DedupeEntry> = new Map();
  // Socket -> { roomCode, playerId }
  private socketBindings: Map<string, { roomCode: string; playerId: string }> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
    this.startCleanupInterval();
    this.registerSocketHandlers();
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.dedupeCache.entries()) {
        if (now - entry.timestamp > GAME_RULES.REQUEST_DEDUPLICATION_TTL_MS) {
          this.dedupeCache.delete(key);
        }
      }
    }, 30_000);
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

    const res = action();
    this.dedupeCache.set(key, { response: res, timestamp: Date.now() });
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
          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            if (!payload || typeof payload.name !== 'string' || !payload.name.trim()) {
              return { ok: false, code: 'BAD_PAYLOAD', message: 'Player name is required' };
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

            const room = new Room(roomCode, playerId, OFFICIAL_MAP_HASH);
            this.rooms.set(roomCode, room);

            room.addPlayer(playerId, payload.name.trim(), socket, resumeToken, true);
            this.socketBindings.set(socket.id, { roomCode, playerId });

            this.broadcastRoomState(room);

            // Returns both top-level and data fields to satisfy all client consumption styles
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
          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            if (!payload || !payload.roomCode || !payload.name) {
              return { ok: false, code: 'BAD_PAYLOAD', message: 'Missing join parameters' };
            }
            if (payload.protocolVersion !== PROTOCOL_VERSION) {
              return {
                ok: false,
                code: 'VERSION_MISMATCH',
                message: `Server protocol is v${PROTOCOL_VERSION}, client sent v${payload.protocolVersion}`,
              };
            }

            const code = payload.roomCode.toUpperCase().trim();
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

            room.addPlayer(playerId, payload.name.trim(), socket, resumeToken, false);
            this.socketBindings.set(socket.id, { roomCode: code, playerId });

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
            this.broadcastRoomState(room);
            return { ok: true };
          });
        }
      );

      // 4. room:start
      socket.on(
        CLIENT_EVENTS.ROOM_START,
        (payload: { requestId?: string }, ack?: (res: AckResponse) => void) => {
          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Not in room' };

            const room = this.rooms.get(binding.roomCode);
            if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };

            if (room.hostId !== binding.playerId) {
              return { ok: false, code: 'NOT_HOST', message: 'Only room host can start the game' };
            }

            const success = room.startMatch();
            if (!success) {
              return {
                ok: false,
                code: 'NOT_READY',
                message: 'Requires exactly 6 ready players to start',
              };
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

      // 6. game:input
      socket.on(CLIENT_EVENTS.GAME_INPUT, (input: InputFrame) => {
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
          this.dedupeOrExecute(socket.id, payload?.requestId, ack, () => {
            const binding = this.socketBindings.get(socket.id);
            if (!binding) return { ok: true };

            const room = this.rooms.get(binding.roomCode);
            if (room) {
              room.removePlayer(binding.playerId);
              if (room.players.size > 0) {
                this.broadcastRoomState(room);
              } else {
                this.rooms.delete(binding.roomCode);
              }
            }

            this.socketBindings.delete(socket.id);
            return { ok: true };
          });
        }
      );

      // Disconnect
      socket.on('disconnect', () => {
        const binding = this.socketBindings.get(socket.id);
        if (!binding) return;

        const room = this.rooms.get(binding.roomCode);
        if (room) {
          const player = room.players.get(binding.playerId);
          if (player) {
            player.socket = null;
            // 30s grace period for reconnect before removing
            player.disconnectTimer = setTimeout(() => {
              room.removePlayer(binding.playerId);
              if (room.players.size > 0) {
                this.broadcastRoomState(room);
              } else {
                this.rooms.delete(binding.roomCode);
              }
            }, GAME_RULES.DISCONNECT_GRACE_TIMEOUT_MS);
          }
          this.broadcastRoomState(room);
        }

        this.socketBindings.delete(socket.id);
      });
    });
  }

  public getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }
}
