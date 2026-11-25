import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
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
  validateCapture,
  isRobberCapturable,
  CaptureActor,
  CaptureTarget,
  GameEvent,
  Vec3,
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
  lastCaptureAttemptTime: number;
  lastInputTime: number;
}

export class MockServer {
  private io: SocketIOServer | Namespace;
  private bots: MockBotState[];
  private clients: Map<string, ConnectedClientSession> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private tick = 0;
  private remainingMs: number = GAME_RULES.PHASE_DURATION_PLAYING_MS;
  private lastTickTime = Date.now();

  constructor(io: SocketIOServer | Namespace) {
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
      const isNearSpawn = socket.handshake.query.spawn === 'near';
      const defaultSpawnPos = role === 'POLICE' ? officialVillageMap.spawns.police[0]! : officialVillageMap.spawns.robber[0]!;
      const spawnPos: Vec3 = [...(bot ? bot.pos : defaultSpawnPos)];

      if (isNearSpawn && role === 'ROBBER') {
        const policeSession = Array.from(this.clients.values()).find((c) => c.role === 'POLICE');
        const policeBot = this.bots.find((b) => b.id === 'police-1');
        const basePos = policeSession ? policeSession.movementState.pos : (policeBot ? policeBot.pos : officialVillageMap.spawns.police[0]!);
        const baseYaw = policeBot ? policeBot.yaw : 0;
        if (policeBot) {
          policeBot.patrolSpeed = 0;
        }
        const fx = -Math.sin(baseYaw);
        const fz = -Math.cos(baseYaw);
        spawnPos[0] = basePos[0] + fx * 1.2;
        spawnPos[1] = basePos[1];
        spawnPos[2] = basePos[2] + fz * 1.2;
      }

      if (bot && isNearSpawn && role === 'ROBBER') {
        bot.pos = [spawnPos[0], spawnPos[1], spawnPos[2]];
        bot.baseCenter = [spawnPos[0], spawnPos[1], spawnPos[2]];
        bot.patrolSpeed = 0;
      }

      const session: ConnectedClientSession = {
        socket,
        playerId: assignedId,
        role,
        movementState: initialMovement(spawnPos),
        ackSeq: 0,
        lastJumpId: 0,
        lastCaptureId: 0,
        lastCaptureAttemptTime: 0,
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

        const captureTriggered = Boolean(input.captureId && input.captureId > session.lastCaptureId);
        if (input.captureId) {
          session.lastCaptureId = input.captureId;
        }

        const now = Date.now();
        if (captureTriggered && session.role === 'POLICE') {
          // Cooldown check (1.1s kể cả hụt)
          if (
            session.lastCaptureAttemptTime === 0 ||
            now - session.lastCaptureAttemptTime >= GAME_RULES.CAPTURE_COOLDOWN_MS
          ) {
            session.lastCaptureAttemptTime = now;

            const policeActor: CaptureActor = {
              id: session.playerId,
              role: 'POLICE',
              pos: session.movementState.pos,
              yaw: input.yaw,
              crouch: session.movementState.crouched,
            };

            const activeJail = officialVillageMap.jails.find((j) => j.id === 'J1')!;
            const robbers: CaptureTarget[] = this.bots
              .filter((b) => b.role === 'ROBBER')
              .map((b) => {
                const client = Array.from(this.clients.values()).find((c) => c.playerId === b.id);
                return {
                  id: b.id,
                  role: 'ROBBER' as const,
                  pos: client ? client.movementState.pos : b.pos,
                  crouch: client ? client.movementState.crouched : b.crouch,
                  state: b.state || 'FREE',
                };
              });

            const occupiedSlots = new Set<number>();
            for (const b of this.bots) {
              if (b.role === 'ROBBER' && b.state === 'JAILED' && b.jailSlotIndex !== undefined) {
                occupiedSlots.add(b.jailSlotIndex);
              }
            }

            const networkCaptureRules = {
              ...GAME_RULES,
              CAPTURE_MAX_DISTANCE_M: Math.max(GAME_RULES.CAPTURE_MAX_DISTANCE_M, 2.0),
              CAPTURE_MAX_ANGLE_DEG: Math.max(GAME_RULES.CAPTURE_MAX_ANGLE_DEG, 65),
            };

            const captureResult = validateCapture(
              policeActor,
              robbers,
              officialVillageMap.colliders,
              activeJail,
              occupiedSlots,
              networkCaptureRules
            );

            if (
              captureResult.valid &&
              captureResult.target &&
              captureResult.slotIndex !== undefined &&
              captureResult.jailPos
            ) {
              const targetBot = this.bots.find((b) => b.id === captureResult.target!.id);
              if (targetBot) {
                targetBot.state = 'JAILED';
                targetBot.pos = [...captureResult.jailPos];
                targetBot.vel = [0, 0, 0];
                targetBot.patrolSpeed = 0;
                targetBot.jailSlotIndex = captureResult.slotIndex;
              }

              for (const clientSession of this.clients.values()) {
                if (clientSession.playerId === captureResult.target.id) {
                  clientSession.movementState.pos = [...captureResult.jailPos];
                  clientSession.movementState.verticalSpeed = 0;
                }
              }

              const event: GameEvent = {
                eventId: `capture-${this.tick}-${captureResult.target.id}`,
                tick: this.tick,
                type: 'CAPTURE',
                data: {
                  policeId: session.playerId,
                  robberId: captureResult.target.id,
                  jailId: 'J1',
                  slotIndex: captureResult.slotIndex,
                },
              };
              this.io.emit(SERVER_EVENTS.GAME_EVENT, event);
              console.log(
                `[MockServer] Capture SUCCESS: ${session.playerId} captured ${captureResult.target.id} -> J1 slot ${captureResult.slotIndex}`
              );
            } else {
              console.log(
                `[MockServer] Capture MISSED: ${session.playerId} (reason: ${captureResult.failReason})`
              );
            }
          }
        }

        // Prevent movement if this client is a jailed robber
        const controlledBot = this.bots.find((b) => b.id === session.playerId);
        const isJailed = session.role === 'ROBBER' && controlledBot?.state === 'JAILED';

        const moveX = isJailed ? 0 : ((Math.sign(input.moveX) || 0) as -1 | 0 | 1);
        const moveZ = isJailed ? 0 : ((Math.sign(input.moveZ) || 0) as -1 | 0 | 1);

        const intent: MovementIntent = {
          moveX,
          moveZ,
          yaw: input.yaw,
          jumpPressed: isJailed ? false : jumpPressed,
          sprint: isJailed ? false : Boolean(input.sprint),
          crouch: Boolean(input.crouch),
        };

        if (isJailed && controlledBot) {
          session.movementState.pos = [...controlledBot.pos];
          session.movementState.verticalSpeed = 0;
        } else {
          // Advance authoritative simulation step
          session.movementState = stepMovement(
            session.movementState,
            intent,
            session.role,
            officialVillageMap
          );
        }

        // Reflect simulated state into bot state for broadcast
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
    if (this.clients.size === 0) return;
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
      const jailedCount = this.bots.filter(
        (b) => b.role === 'ROBBER' && b.state === 'JAILED'
      ).length;

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
        jailedCount,
        result: null,
      };

      session.socket.emit(SERVER_EVENTS.GAME_SNAPSHOT, snapshot);
    }
  }
}

export function setupMockServer(io: SocketIOServer | Namespace): MockServer {
  const server = new MockServer(io);
  server.start();
  return server;
}
