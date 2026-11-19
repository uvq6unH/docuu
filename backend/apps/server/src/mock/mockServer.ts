import { Server as SocketIOServer, Socket } from 'socket.io';
import { readFileSync } from 'node:fs';
import {
  GAME_RULES,
  Snapshot,
  InputFrame,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  RoomState,
  validateMap,
  VillageMap,
  initialMovement,
  stepMovement,
  MovementState,
  MovementIntent,
  MovementRole,
} from '@folk-tag/shared';
import {
  INITIAL_MOCK_BOTS,
  MockBotState,
  updateMockBots,
  toPlayerView,
  toSelfPlayerView,
} from './mockData.js';

// Load and validate the official map JSON from packages/shared
const mapPath = new URL('../../../../../packages/shared/maps/village-v1.json', import.meta.url);
const rawMapData = JSON.parse(readFileSync(mapPath, 'utf-8'));
export const officialVillageMap: VillageMap = validateMap(rawMapData);

interface ConnectedClientSession {
  socket: Socket;
  playerId: string;
  role: MovementRole;
  movementState: MovementState;
  ackSeq: number;
  lastJumpId: number;
  lastCaptureId: number;
  lastInputTime: number;
}

export class MockServer {
  private io: SocketIOServer;
  private bots: MockBotState[];
  private clients: Map<string, ConnectedClientSession> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private tick = 0;
  private remainingMs: number = GAME_RULES.PHASE_DURATION_PLAYING_MS;
  private lastTickTime = Date.now();

  constructor(io: SocketIOServer) {
    this.io = io;
    // Clone initial mock bot identities
    this.bots = JSON.parse(JSON.stringify(INITIAL_MOCK_BOTS));
    this.registerSocketHandlers();
  }

  private registerSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[MockServer] Client connected: ${socket.id}`);

      // Assign the client to 'police-1' by default, or the next available slot
      const assignedId = this.clients.size === 0 ? 'police-1' : `robber-${Math.min(4, this.clients.size)}`;
      const role: MovementRole = assignedId.startsWith('police') ? 'POLICE' : 'ROBBER';
      const bot = this.bots.find((b) => b.id === assignedId);
      const spawnPos = bot ? bot.pos : (role === 'POLICE' ? officialVillageMap.spawns.police[0]! : officialVillageMap.spawns.robber[0]!);

      const session: ConnectedClientSession = {
        socket,
        playerId: assignedId,
        role,
        movementState: initialMovement(spawnPos),
        ackSeq: 0,
        lastJumpId: 0,
        lastCaptureId: 0,
        lastInputTime: Date.now(),
      };
      this.clients.set(socket.id, session);

      // Send initial room state expected by FE mock session
      const initialRoomState: RoomState = {
        roomCode: 'MOCK01',
        hostId: 'police-1',
        phase: 'PLAYING',
        protocolVersion: 1,
        mapHash: 'mock-map-hash',
        captainId: 'police-1',
        roster: this.bots.map((b) => ({
          id: b.id,
          name: b.id.toUpperCase(),
          ready: true,
          role: b.role,
          connected: true,
          isHost: b.id === 'police-1',
          isCaptain: b.id === 'police-1',
        })),
      };
      socket.emit(SERVER_EVENTS.ROOM_STATE, initialRoomState);

      // Handle client input frames using authoritative FE stepMovement
      socket.on(CLIENT_EVENTS.GAME_INPUT, (input: InputFrame) => {
        if (!input || typeof input.seq !== 'number') return;
        session.ackSeq = input.seq;
        session.lastInputTime = Date.now();

        const jumpPressed = Boolean(input.jumpId && input.jumpId > session.lastJumpId);
        if (input.jumpId) {
          session.lastJumpId = input.jumpId;
        }
        if (input.captureId) {
          session.lastCaptureId = input.captureId;
        }

        const moveX = (Math.sign(input.moveX) || 0) as -1 | 0 | 1;
        const moveZ = (Math.sign(input.moveZ) || 0) as -1 | 0 | 1;

        const intent: MovementIntent = {
          moveX,
          moveZ,
          yaw: input.yaw,
          jumpPressed,
          sprint: Boolean(input.sprint),
          crouch: Boolean(input.crouch),
        };

        // Advance authoritative simulation step
        session.movementState = stepMovement(
          session.movementState,
          intent,
          session.role,
          officialVillageMap
        );

        // Reflect simulated state into bot state for broadcast
        const controlledBot = this.bots.find((b) => b.id === session.playerId);
        if (controlledBot) {
          controlledBot.pos = [...session.movementState.pos];
          controlledBot.yaw = input.yaw;
          controlledBot.vel = [0, session.movementState.verticalSpeed, 0];
          controlledBot.grounded = session.movementState.grounded;
          controlledBot.crouch = session.movementState.crouched;
          controlledBot.stamina = session.movementState.stamina;
        }
      });

      socket.on('disconnect', () => {
        console.log(`[MockServer] Client disconnected: ${socket.id}`);
        this.clients.delete(socket.id);
      });
    });
  }

  public start(): void {
    if (this.timer) return;
    this.lastTickTime = Date.now();

    // 15Hz snapshot broadcast loop (interval = 1000 / 15 ≈ 66.67ms)
    this.timer = setInterval(() => {
      this.broadcastSnapshot();
    }, GAME_RULES.SNAPSHOT_BROADCAST_INTERVAL_MS);

    console.log(`[MockServer] 15Hz broadcast loop started (${GAME_RULES.SNAPSHOT_BROADCAST_RATE_HZ} snapshots/sec).`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[MockServer] Broadcast loop stopped.');
    }
  }

  private broadcastSnapshot(): void {
    const now = Date.now();
    const dt = Math.min(0.2, (now - this.lastTickTime) / 1000);
    this.lastTickTime = now;
    this.tick++;

    this.remainingMs = Math.max(0, this.remainingMs - Math.floor(dt * 1000));

    // Update patrol positions for bots not controlled by human clients
    const controlledIds = new Set(Array.from(this.clients.values()).map((c) => c.playerId));
    const uncontrolledBots = this.bots.filter((b) => !controlledIds.has(b.id));
    updateMockBots(uncontrolledBots, dt);

    // Broadcast individual per-client snapshots
    for (const [socketId, session] of this.clients.entries()) {
      const controlledBot = this.bots.find((b) => b.id === session.playerId);
      if (!controlledBot) continue;

      const selfView = toSelfPlayerView(
        controlledBot,
        session.ackSeq,
        session.lastJumpId,
        session.lastCaptureId
      );

      const otherBots = this.bots.filter((b) => b.id !== session.playerId);

      const snapshot: Snapshot = {
        protocolVersion: 1,
        matchId: 'mock-match-001',
        tick: this.tick,
        phase: 'PLAYING',
        remainingMs: this.remainingMs,
        jailId: 'J1',
        guardId: null,
        self: selfView,
        players: otherBots.map(toPlayerView),
        jailedCount: 0,
        result: null,
      };

      session.socket.emit(SERVER_EVENTS.GAME_SNAPSHOT, snapshot);
    }
  }
}

export function setupMockServer(io: SocketIOServer): MockServer {
  const server = new MockServer(io);
  server.start();
  return server;
}
