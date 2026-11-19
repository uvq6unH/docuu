import { Socket } from 'socket.io';
import {
  GAME_RULES,
  Snapshot,
  PlayerView,
  SelfPlayerView,
  InputFrame,
  RoomState,
  RosterMember,
  Role,
  Phase,
  RobberState,
  MovementState,
  MovementIntent,
  MovementRole,
  initialMovement,
  stepMovement,
  SERVER_EVENTS,
  CLIENT_EVENTS,
  checkLineOfSight,
  Vec3,
} from '@folk-tag/shared';
import { officialVillageMap } from '../mock/mockServer.js';

export interface PlayerSession {
  id: string;
  name: string;
  socket: Socket | null;
  resumeToken: string;
  role: Role | null;
  ready: boolean;
  isHost: boolean;
  isCaptain: boolean;
  movementState: MovementState;
  inputQueue: InputFrame[];
  lastProcessedSeq: number;
  lastJumpId: number;
  lastCaptureId: number;
  lastInputTimestamp: number;
  disconnectTimer: NodeJS.Timeout | null;
  state: RobberState;
  guard: boolean;
}

export class Room {
  public readonly roomCode: string;
  public hostId: string;
  public phase: Phase = 'LOBBY';
  public captainId: string | null = null;
  public selectedJailId: string | null = null;
  public guardId: string | null = null;
  public matchId: string;
  public mapHash: string;
  public readonly protocolVersion: number = 1;
  public players: Map<string, PlayerSession> = new Map();

  private simTimer: NodeJS.Timeout | null = null;
  private tick: number = 0;
  private remainingMs: number = GAME_RULES.PHASE_DURATION_PLAYING_MS;
  private monotonicLastTime: number = Date.now();

  constructor(roomCode: string, hostPlayerId: string, mapHash: string) {
    this.roomCode = roomCode;
    this.hostId = hostPlayerId;
    this.mapHash = mapHash;
    this.matchId = `match-${roomCode}-${Date.now()}`;
  }

  public addPlayer(
    id: string,
    name: string,
    socket: Socket,
    resumeToken: string,
    isHost = false
  ): PlayerSession {
    const session: PlayerSession = {
      id,
      name,
      socket,
      resumeToken,
      role: null,
      ready: false,
      isHost,
      isCaptain: false,
      movementState: initialMovement([0, 0, 0]),
      inputQueue: [],
      lastProcessedSeq: 0,
      lastJumpId: 0,
      lastCaptureId: 0,
      lastInputTimestamp: Date.now(),
      disconnectTimer: null,
      state: 'FREE',
      guard: false,
    };
    this.players.set(id, session);
    socket.join(this.roomCode);
    return session;
  }

  public removePlayer(playerId: string): void {
    const session = this.players.get(playerId);
    if (!session) return;
    if (session.disconnectTimer) {
      clearTimeout(session.disconnectTimer);
    }
    if (session.socket) {
      session.socket.leave(this.roomCode);
    }
    this.players.delete(playerId);

    // If host left, elect next player as host
    if (this.hostId === playerId && this.players.size > 0) {
      const nextHost = this.players.values().next().value;
      if (nextHost) {
        this.hostId = nextHost.id;
        nextHost.isHost = true;
      }
    }

    if (this.players.size === 0) {
      this.stop();
    }
  }

  public setReady(playerId: string, ready: boolean): boolean {
    const session = this.players.get(playerId);
    if (!session) return false;
    session.ready = ready;
    return true;
  }

  public startMatch(): boolean {
    if (this.players.size !== GAME_RULES.REQUIRED_PLAYERS) return false;
    for (const player of this.players.values()) {
      if (!player.ready) return false;
    }

    // Assign roles: 2 Police, 4 Robbers
    const list = Array.from(this.players.values());
    const policeCount = GAME_RULES.POLICE_COUNT;
    list.forEach((p, index) => {
      if (index < policeCount) {
        p.role = 'POLICE';
        p.isCaptain = index === 0;
        if (p.isCaptain) {
          this.captainId = p.id;
        }
        p.movementState = initialMovement(officialVillageMap.spawns.police[index]!);
      } else {
        p.role = 'ROBBER';
        p.isCaptain = false;
        p.state = 'FREE';
        const robberIdx = index - policeCount;
        p.movementState = initialMovement(officialVillageMap.spawns.robber[robberIdx]!);
      }
    });

    this.phase = 'JAIL_SELECTION';
    this.selectedJailId = null;
    this.remainingMs = Number(GAME_RULES.PHASE_DURATION_JAIL_SELECTION_MS);
    this.startSimulation();
    return true;
  }

  public selectJail(playerId: string, jailId: string): boolean {
    if (this.phase !== 'JAIL_SELECTION') return false;
    if (playerId !== this.captainId) return false;
    const jailExists = officialVillageMap.jails.some((j) => j.id === jailId);
    if (!jailExists) return false;

    this.selectedJailId = jailId;
    this.phase = 'HEAD_START';
    this.remainingMs = Number(GAME_RULES.PHASE_DURATION_HEAD_START_MS);
    return true;
  }

  public enqueueInput(playerId: string, frame: InputFrame): void {
    const session = this.players.get(playerId);
    if (!session) return;
    session.lastInputTimestamp = Date.now();
    // Bounded input queue: max 30 pending frames
    if (session.inputQueue.length < 30) {
      session.inputQueue.push(frame);
    }
  }

  public getRoomState(): RoomState {
    const roster: RosterMember[] = Array.from(this.players.values()).map((p) => {
      const member: RosterMember = {
        id: p.id,
        name: p.name,
        ready: p.ready,
        role: p.role,
        connected: p.socket !== null && p.socket.connected,
      };
      if (p.isHost) member.isHost = true;
      if (p.isCaptain) member.isCaptain = true;
      return member;
    });

    const roomState: RoomState = {
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      roster,
      mapHash: this.mapHash,
      protocolVersion: this.protocolVersion,
    };
    if (this.captainId) {
      roomState.captainId = this.captainId;
    }

    return roomState;
  }

  public startSimulation(): void {
    if (this.simTimer) return;
    this.tick = 0;
    this.monotonicLastTime = Date.now();

    // 30Hz simulation loop (timestep = 1000/30 ≈ 33.33ms)
    this.simTimer = setInterval(() => {
      this.step();
    }, GAME_RULES.SIMULATION_TIMESTEP_MS);
  }

  public stop(): void {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  private step(): void {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.monotonicLastTime) / 1000);
    this.monotonicLastTime = now;
    this.tick++;

    // Advance Phase timers
    this.remainingMs = Math.max(0, this.remainingMs - Math.floor(dt * 1000));
    if (this.remainingMs <= 0) {
      if (this.phase === 'JAIL_SELECTION') {
        // Auto-select default jail J1 if captain didn't choose in time
        if (!this.selectedJailId) this.selectedJailId = 'J1';
        this.phase = 'HEAD_START';
        this.remainingMs = Number(GAME_RULES.PHASE_DURATION_HEAD_START_MS);
      } else if (this.phase === 'HEAD_START') {
        this.phase = 'PLAYING';
        this.remainingMs = Number(GAME_RULES.PHASE_DURATION_PLAYING_MS);
      } else if (this.phase === 'PLAYING') {
        this.phase = 'RESULT';
        this.remainingMs = Number(GAME_RULES.PHASE_DURATION_RESULT_MS);
      }
    }

    // Process inputs and step movement for each player
    for (const session of this.players.values()) {
      if (!session.role) continue;

      // Handle stale input timeout (250ms)
      const isStale = now - session.lastInputTimestamp > GAME_RULES.INPUT_STALE_TIMEOUT_MS;

      let intent: MovementIntent = {
        moveX: 0,
        moveZ: 0,
        yaw: 0,
        jumpPressed: false,
        sprint: false,
        crouch: false,
      };

      if (!isStale && session.inputQueue.length > 0) {
        // Process up to MAX_CATCHUP_STEPS per tick
        const framesToProcess = session.inputQueue.splice(0, GAME_RULES.MAX_CATCHUP_STEPS);
        for (const frame of framesToProcess) {
          if (frame.seq <= session.lastProcessedSeq) continue;
          session.lastProcessedSeq = frame.seq;

          const jumpPressed = Boolean(frame.jumpId && frame.jumpId > session.lastJumpId);
          if (frame.jumpId) session.lastJumpId = frame.jumpId;
          if (frame.captureId) session.lastCaptureId = frame.captureId;

          intent = {
            moveX: (Math.sign(frame.moveX) || 0) as -1 | 0 | 1,
            moveZ: (Math.sign(frame.moveZ) || 0) as -1 | 0 | 1,
            yaw: frame.yaw,
            jumpPressed,
            sprint: Boolean(frame.sprint),
            crouch: Boolean(frame.crouch),
          };

          // In HEAD_START phase, police cannot move
          if (this.phase === 'HEAD_START' && session.role === 'POLICE') {
            intent.moveX = 0;
            intent.moveZ = 0;
            intent.sprint = false;
          }

          session.movementState = stepMovement(
            session.movementState,
            intent,
            session.role as MovementRole,
            officialVillageMap
          );
        }
      } else {
        // No input or stale: simulate idle deceleration/gravity
        session.movementState = stepMovement(
          session.movementState,
          intent,
          session.role as MovementRole,
          officialVillageMap
        );
      }
    }

    // Broadcast snapshot every other tick (15Hz)
    if (this.tick % 2 === 0) {
      this.broadcastSnapshots();
    }
  }

  private broadcastSnapshots(): void {
    for (const [id, session] of this.players.entries()) {
      if (!session.socket || !session.role) continue;

      // Filter other players for this recipient
      const visibleOthers: PlayerView[] = [];

      for (const other of this.players.values()) {
        if (other.id === session.id || !other.role) continue;

        // Visibility filtering: hidden robber > 2m away is omitted from police view
        if (session.role === 'POLICE' && other.role === 'ROBBER' && other.state === 'HIDDEN') {
          const dist = Math.hypot(
            session.movementState.pos[0] - other.movementState.pos[0],
            session.movementState.pos[2] - other.movementState.pos[2]
          );
          if (dist > GAME_RULES.HIDDEN_VISIBILITY_PROXIMITY_M) {
            continue; // Do not include in snapshot
          }
        }

        const otherView: PlayerView = {
          id: other.id,
          role: other.role,
          pos: [...other.movementState.pos],
          yaw: 0,
          vel: [0, other.movementState.verticalSpeed, 0],
          crouch: other.movementState.crouched,
          grounded: other.movementState.grounded,
          connected: other.socket !== null && other.socket.connected,
        };
        if (other.role === 'ROBBER') {
          otherView.state = other.state;
        }
        if (other.role === 'POLICE') {
          otherView.guard = other.guard;
        }

        visibleOthers.push(otherView);
      }

      const selfView: SelfPlayerView = {
        id: session.id,
        role: session.role,
        pos: [...session.movementState.pos],
        yaw: 0,
        vel: [0, session.movementState.verticalSpeed, 0],
        crouch: session.movementState.crouched,
        grounded: session.movementState.grounded,
        connected: true,
        stamina: session.movementState.stamina,
        ackSeq: session.lastProcessedSeq,
        ackJumpId: session.lastJumpId,
        ackCaptureId: session.lastCaptureId,
        immuneRemainingMs: 0,
        rescueProgressMs: 0,
      };
      if (session.role === 'ROBBER') {
        selfView.state = session.state;
      }
      if (session.role === 'POLICE') {
        selfView.guard = session.guard;
      }

      const jailedCount = Array.from(this.players.values()).filter(
        (p) => p.role === 'ROBBER' && p.state === 'JAILED'
      ).length;

      const snapshot: Snapshot = {
        protocolVersion: 1,
        matchId: this.matchId,
        tick: this.tick,
        phase: this.phase,
        remainingMs: this.remainingMs,
        jailId: this.phase === 'JAIL_SELECTION' && session.role === 'ROBBER' ? null : this.selectedJailId,
        guardId: this.guardId,
        self: selfView,
        players: visibleOthers,
        jailedCount,
        result: this.phase === 'RESULT' ? { winner: 'POLICE', reason: 'Time expired' } : null,
      };

      session.socket.emit(SERVER_EVENTS.GAME_SNAPSHOT, snapshot);
    }
  }
}
