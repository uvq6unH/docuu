import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  GAME_RULES,
  Snapshot,
  InputFrame,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  RoomState,
} from '@folk-tag/shared';
import {
  INITIAL_MOCK_BOTS,
  MockBotState,
  updateMockBots,
  toPlayerView,
  toSelfPlayerView,
} from './mockData.js';

interface ConnectedClientSession {
  socket: Socket;
  playerId: string;
  ackSeq: number;
  ackJumpId: number;
  ackCaptureId: number;
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
      const session: ConnectedClientSession = {
        socket,
        playerId: assignedId,
        ackSeq: 0,
        ackJumpId: 0,
        ackCaptureId: 0,
        lastInputTime: Date.now(),
      };
      this.clients.set(socket.id, session);

      // Send initial room state
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

      // Handle client input frames
      socket.on(CLIENT_EVENTS.GAME_INPUT, (input: InputFrame) => {
        if (!input || typeof input.seq !== 'number') return;
        session.ackSeq = input.seq;
        session.ackJumpId = input.jumpId;
        session.ackCaptureId = input.captureId;
        session.lastInputTime = Date.now();

        // Update controlled bot position with simple responsive translation
        const controlledBot = this.bots.find((b) => b.id === session.playerId);
        if (controlledBot) {
          controlledBot.yaw = input.yaw;
          controlledBot.crouch = input.crouch;

          // Simple responsive displacement
          const speed = input.crouch
            ? GAME_RULES.POLICE_CROUCH_SPEED
            : input.sprint
            ? GAME_RULES.POLICE_SPRINT_SPEED
            : GAME_RULES.POLICE_WALK_SPEED;

          if (input.moveX !== 0 || input.moveZ !== 0) {
            const length = Math.hypot(input.moveX, input.moveZ);
            const normX = input.moveX / length;
            const normZ = input.moveZ / length;

            // Move relative to yaw: yaw=0 faces -Z
            const sinY = Math.sin(input.yaw);
            const cosY = Math.cos(input.yaw);

            const worldX = (normX * cosY + normZ * -sinY) * speed * GAME_RULES.SIMULATION_TIMESTEP_SEC;
            const worldZ = (normX * sinY + normZ * -cosY) * speed * GAME_RULES.SIMULATION_TIMESTEP_SEC;

            controlledBot.pos[0] += worldX;
            controlledBot.pos[2] += worldZ;
            controlledBot.vel = [worldX / GAME_RULES.SIMULATION_TIMESTEP_SEC, 0, worldZ / GAME_RULES.SIMULATION_TIMESTEP_SEC];
          } else {
            controlledBot.vel = [0, 0, 0];
          }
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
    const dt = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    this.tick++;
    this.remainingMs = Math.max(0, this.remainingMs - dt * 1000);

    // Update autonomous mock bots (exclude currently player-controlled bots)
    const controlledIds = new Set(Array.from(this.clients.values()).map((c) => c.playerId));
    const autonomousBots = this.bots.filter((b) => !controlledIds.has(b.id));
    updateMockBots(autonomousBots, dt);

    // Broadcast snapshot customized for each connected client
    for (const session of this.clients.values()) {
      const selfBot = this.bots.find((b) => b.id === session.playerId) || this.bots[0]!;
      const otherBots = this.bots.filter((b) => b.id !== session.playerId);

      const snapshot: Snapshot = {
        protocolVersion: 1,
        matchId: 'mock-match-001',
        tick: this.tick,
        phase: 'PLAYING',
        remainingMs: Math.round(this.remainingMs),
        jailId: 'J1',
        guardId: null,
        self: toSelfPlayerView(selfBot, session.ackSeq, session.ackJumpId, session.ackCaptureId),
        players: otherBots.map(toPlayerView),
        jailedCount: 0,
        result: null,
      };

      session.socket.emit(SERVER_EVENTS.GAME_SNAPSHOT, snapshot);
    }
  }
}

export function setupMockServer(io: SocketIOServer): MockServer {
  const mockServer = new MockServer(io);
  mockServer.start();
  return mockServer;
}
