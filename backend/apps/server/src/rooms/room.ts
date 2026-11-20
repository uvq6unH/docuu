import { Socket } from 'socket.io';
import {
  GAME_RULES,
  GameRules,
  MovementRules,
  movementRulesFromGameRules,
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
  Vec3,
  validateCapture,
  CaptureActor,
  CaptureTarget,
  GameEvent,
  MatchResult,
  checkRescueEligibility,
  RescuerActor,
  selectRobberToRescue,
  determineReleasePosition,
  JailedRobberTarget,
  getDistanceToJailCenter,
  clampPositionOutsideGuardZone,
  isCapsuleInHideZone,
  canPoliceSeeRobber,
} from '@folk-tag/shared';
import { officialVillageMap } from '../mock/mockServer.js';
import type { DatabaseManager } from '../db/index.js';

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
  lastCaptureAttemptTick: number;
  jailSlotIndex?: number | undefined;
  lastInputTimestamp: number;
  disconnectTimer: NodeJS.Timeout | null;
  state: RobberState;
  guard: boolean;
  timeJailedMs: number;
  immuneRemainingMs: number;
  rescueProgressMs: number;
  rescueHeld: boolean;
  rescueNeedsRelease: boolean;
  hideCrouchMs: number;
  lastYaw: number;
}

export interface RoomMetrics {
  roomCode: string;
  totalTicks: number;
  lastTickMs: number;
  avgTickMs: number;
  maxTickMs: number;
  p95TickMs: number;
  p99TickMs: number;
  phase: Phase;
  playerCount: number;
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
  public rules: GameRules;
  private movementRules: MovementRules;
  private matchStartedAt: number = 0;
  public players: Map<string, PlayerSession> = new Map();
  public matchResult: MatchResult | null = null;

  private simTimer: NodeJS.Timeout | null = null;
  private db: DatabaseManager | null = null;
  private tick: number = 0;
  private remainingMs: number;
  private monotonicLastTime: number = Date.now();
  private tickDurations: number[] = [];
  private totalTicksCount = 0;
  private maxTickTimeMs = 0;
  private lastTickTimeMs = 0;

  constructor(
    roomCode: string,
    hostPlayerId: string,
    mapHash: string,
    rules: GameRules = GAME_RULES
  ) {
    this.roomCode = roomCode;
    this.hostId = hostPlayerId;
    this.mapHash = mapHash;
    this.rules = rules;
    this.movementRules = movementRulesFromGameRules(rules);
    this.matchId = `match-${roomCode}-${Date.now()}`;
    this.remainingMs = rules.PHASE_DURATION_PLAYING_MS;
  }

  public setDatabase(db: DatabaseManager): void {
    this.db = db;
  }

  public getCurrentTick(): number {
    return this.tick;
  }

  public getRemainingMs(): number {
    return this.remainingMs;
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
      lastCaptureAttemptTick: 0,
      lastInputTimestamp: Date.now(),
      disconnectTimer: null,
      state: 'FREE',
      guard: false,
      timeJailedMs: 0,
      immuneRemainingMs: 0,
      rescueProgressMs: 0,
      rescueHeld: false,
      rescueNeedsRelease: false,
      hideCrouchMs: 0,
      lastYaw: 0,
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
      session.disconnectTimer = null;
    }
    if (session.socket) {
      session.socket.leave(this.roomCode);
    }
    if (this.guardId === playerId) {
      this.guardId = null;
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

  public startMatch(allowPartialRoster = true): boolean {
    const minPlayers = allowPartialRoster ? 2 : this.rules.REQUIRED_PLAYERS;
    if (this.players.size < minPlayers || this.players.size > this.rules.REQUIRED_PLAYERS) return false;
    for (const player of this.players.values()) {
      if (!player.ready) return false;
    }

    this.matchResult = null;
    this.guardId = null;
    this.matchStartedAt = Date.now();

    // Assign roles: For 6 players: 2 Police, 4 Robbers. For 2-5 players: at least 1 Police, rest Robbers.
    const list = Array.from(this.players.values());
    const policeCount =
      this.players.size === this.rules.REQUIRED_PLAYERS
        ? this.rules.POLICE_COUNT
        : Math.max(1, Math.min(this.rules.POLICE_COUNT, Math.floor(this.players.size / 3) || 1));
    list.forEach((p, index) => {
      if (index < policeCount) {
        p.role = 'POLICE';
        p.guard = false;
        p.isCaptain = index === 0;
        if (p.isCaptain) {
          this.captainId = p.id;
        }
        p.movementState = initialMovement(officialVillageMap.spawns.police[index]!, this.movementRules);
      } else {
        p.role = 'ROBBER';
        p.isCaptain = false;
        p.state = 'FREE';
        p.timeJailedMs = 0;
        p.immuneRemainingMs = 0;
        p.rescueProgressMs = 0;
        p.rescueHeld = false;
        p.rescueNeedsRelease = false;
        p.hideCrouchMs = 0;
        const robberIdx = index - policeCount;
        p.movementState = initialMovement(officialVillageMap.spawns.robber[robberIdx]!, this.movementRules);
      }
    });

    this.phase = 'JAIL_SELECTION';
    this.selectedJailId = null;
    this.remainingMs = Number(this.rules.PHASE_DURATION_JAIL_SELECTION_MS);

    if (this.db) {
      this.db.createMatch({
        matchId: this.matchId,
        roomCode: this.roomCode,
        mapHash: this.mapHash,
        selectedJailId: this.selectedJailId,
        phase: this.phase,
      });
      for (const p of this.players.values()) {
        if (p.role) {
          this.db.upsertPlayerStat({
            matchId: this.matchId,
            playerId: p.id,
            playerName: p.name,
            role: p.role,
          });
        }
      }
    }

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
    this.remainingMs = Number(this.rules.PHASE_DURATION_HEAD_START_MS);
    this.db?.updateMatch(this.matchId, { selectedJailId: jailId, phase: 'HEAD_START' });
    const phaseEvent: GameEvent = {
      eventId: `phase-${this.tick}-HEAD_START`,
      tick: this.tick,
      type: 'PHASE',
      data: { phase: 'HEAD_START', jailId },
    };
    this.broadcastEvent(phaseEvent);
    return true;
  }

  public restartToLobby(): boolean {
    if (this.phase !== 'RESULT') return false;

    this.stop();
    this.phase = 'LOBBY';
    this.selectedJailId = null;
    this.guardId = null;
    this.matchResult = null;
    this.matchStartedAt = 0;
    this.matchId = `match-${this.roomCode}-${Date.now()}`;
    this.remainingMs = Number(this.rules.PHASE_DURATION_PLAYING_MS);
    this.tick = 0;

    for (const session of this.players.values()) {
      session.ready = false;
      session.role = null;
      session.isCaptain = false;
      session.state = 'FREE';
      session.guard = false;
      session.jailSlotIndex = undefined;
      session.timeJailedMs = 0;
      session.immuneRemainingMs = 0;
      session.rescueProgressMs = 0;
      session.rescueHeld = false;
      session.rescueNeedsRelease = false;
      session.hideCrouchMs = 0;
      session.inputQueue = [];
      session.lastProcessedSeq = 0;
      session.lastJumpId = 0;
      session.lastCaptureId = 0;
      session.lastCaptureAttemptTick = 0;
      session.movementState = initialMovement([0, 0, 0]);
    }

    if (this.db) {
      this.db.updateRoom(this.roomCode, {
        phase: 'LOBBY',
        captainId: null,
        selectedJailId: null,
      });
      for (const p of this.players.values()) {
        this.db.upsertPlayer({
          id: p.id,
          roomCode: this.roomCode,
          name: p.name,
          ready: false,
          isHost: p.isHost,
          resumeToken: p.resumeToken,
        });
      }
    }

    return true;
  }

  public recordTickDuration(durationMs: number): void {
    this.totalTicksCount++;
    this.lastTickTimeMs = durationMs;
    if (durationMs > this.maxTickTimeMs) {
      this.maxTickTimeMs = durationMs;
    }
    this.tickDurations.push(durationMs);
    if (this.tickDurations.length > 300) {
      this.tickDurations.shift();
    }
  }

  public getMetrics(): RoomMetrics {
    const count = this.tickDurations.length;
    let avg = 0;
    let p95 = 0;
    let p99 = 0;

    if (count > 0) {
      const sorted = [...this.tickDurations].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, v) => acc + v, 0);
      avg = sum / count;
      const idx95 = Math.min(count - 1, Math.floor(count * 0.95));
      const idx99 = Math.min(count - 1, Math.floor(count * 0.99));
      p95 = sorted[idx95]!;
      p99 = sorted[idx99]!;
    }

    return {
      roomCode: this.roomCode,
      totalTicks: this.totalTicksCount,
      lastTickMs: Math.round(this.lastTickTimeMs * 100) / 100,
      avgTickMs: Math.round(avg * 100) / 100,
      maxTickMs: Math.round(this.maxTickTimeMs * 100) / 100,
      p95TickMs: Math.round(p95 * 100) / 100,
      p99TickMs: Math.round(p99 * 100) / 100,
      phase: this.phase,
      playerCount: this.players.size,
    };
  }

  public abortMatch(reason = 'DISCONNECT_TIMEOUT', disconnectedPlayerId?: string): void {
    if (this.phase === 'RESULT') return;
    this.phase = 'RESULT';
    this.remainingMs = Number(this.rules.PHASE_DURATION_RESULT_MS);
    this.matchResult = { winner: 'ABORTED', reason };
    const durationSeconds = this.matchStartedAt > 0
      ? Math.max(0, Math.round((Date.now() - this.matchStartedAt) / 1000))
      : 0;
    const event: GameEvent = {
      eventId: `abort-${this.tick}-${Date.now()}`,
      tick: this.tick,
      type: 'RESULT',
      data: { winner: 'ABORTED', reason, disconnectedPlayerId },
    };
    this.broadcastEvent(event);
    if (this.db) {
      this.db.updateMatch(this.matchId, {
        phase: 'RESULT',
        winner: 'ABORTED',
        winReason: reason,
        endedAt: Date.now(),
        durationSeconds,
      });
      this.db.recordGameEvent({
        eventId: event.eventId,
        matchId: this.matchId,
        tick: this.tick,
        eventType: 'RESULT',
        actorId: disconnectedPlayerId ?? null,
        targetId: null,
        payload: event.data,
      });
    }
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
    }, this.rules.SIMULATION_TIMESTEP_MS);
  }

  public stop(): void {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  /**
   * Authoritative 30Hz simulation step.
   *
   * Tick order per GAMEPLAY.md:
   * 1. Timeout if deadline reached (advance phase / end match)
   * 2. Input / movement / stealth / guard zone constraint
   * 3. Immunity countdown & expiry
   * 4. Capture evaluation & execution (ordered by police ID) -> police win if 4 jailed
   * 5. Rescue evaluation & execution (ordered by robber ID) -> only 1 rescue per tick
   * 6. Broadcast snapshots (with stealth distance filtering for police)
   */
  public step(stepDtMs?: number): void {
    const t0 = performance.now();
    const dtMs = stepDtMs ?? this.rules.SIMULATION_TIMESTEP_MS;
    const now = Date.now();
    this.tick++;

    // 1. Timeout if deadline reached
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    if (this.remainingMs <= 0) {
      if (this.phase === 'JAIL_SELECTION') {
        if (!this.selectedJailId) this.selectedJailId = 'J1';
        this.phase = 'HEAD_START';
        this.remainingMs = Number(this.rules.PHASE_DURATION_HEAD_START_MS);
        this.db?.updateMatch(this.matchId, { selectedJailId: this.selectedJailId, phase: this.phase });
        const phaseEvent: GameEvent = {
          eventId: `phase-${this.tick}-HEAD_START`,
          tick: this.tick,
          type: 'PHASE',
          data: { phase: 'HEAD_START', jailId: this.selectedJailId },
        };
        this.broadcastEvent(phaseEvent);
      } else if (this.phase === 'HEAD_START') {
        this.phase = 'PLAYING';
        this.remainingMs = Number(this.rules.PHASE_DURATION_PLAYING_MS);
        this.db?.updateMatch(this.matchId, { phase: this.phase });
        const phaseEvent: GameEvent = {
          eventId: `phase-${this.tick}-PLAYING`,
          tick: this.tick,
          type: 'PHASE',
          data: { phase: 'PLAYING' },
        };
        this.broadcastEvent(phaseEvent);
      } else if (this.phase === 'PLAYING') {
        // Time expired: Robbers win
        this.phase = 'RESULT';
        this.remainingMs = Number(this.rules.PHASE_DURATION_RESULT_MS);
        this.matchResult = { winner: 'ROBBER', reason: 'TIME_EXPIRED' };
        const durationSeconds = this.matchStartedAt > 0
          ? Math.max(0, Math.round((Date.now() - this.matchStartedAt) / 1000))
          : 0;
        const resultEvent: GameEvent = {
          eventId: `result-${this.tick}`,
          tick: this.tick,
          type: 'RESULT',
          data: this.matchResult,
        };
        this.broadcastEvent(resultEvent);
        if (this.db) {
          this.db.updateMatch(this.matchId, {
            phase: 'RESULT',
            winner: 'ROBBER',
            winReason: 'TIME_EXPIRED',
            endedAt: Date.now(),
            durationSeconds,
          });
          this.db.recordGameEvent({
            eventId: resultEvent.eventId,
            matchId: this.matchId,
            tick: this.tick,
            eventType: 'RESULT',
            actorId: null,
            targetId: null,
            payload: resultEvent.data,
          });
        }
      } else if (this.phase === 'RESULT') {
        this.stop();
        return;
      }
    }

    const activeJail = officialVillageMap.jails.find((j) => j.id === (this.selectedJailId || 'J1'))!;

    // 2. Input / movement / stealth / guard zone update
    const captureAttempts: { policeId: string; yaw: number }[] = [];

    for (const session of this.players.values()) {
      if (!session.role) continue;

      const isStale =
        session.socket === null || now - session.lastInputTimestamp > this.rules.INPUT_STALE_TIMEOUT_MS;

      let intent: MovementIntent = {
        moveX: 0,
        moveZ: 0,
        yaw: session.lastYaw,
        jumpPressed: false,
        sprint: false,
        crouch: false,
      };

      if (!isStale && session.inputQueue.length > 0) {
        const framesToProcess = session.inputQueue.splice(0, this.rules.MAX_CATCHUP_STEPS);
        for (const frame of framesToProcess) {
          if (frame.seq <= session.lastProcessedSeq) continue;
          session.lastProcessedSeq = frame.seq;
          session.lastYaw = frame.yaw;

          const jumpPressed = Boolean(frame.jumpId && frame.jumpId > session.lastJumpId);
          if (frame.jumpId) session.lastJumpId = frame.jumpId;

          const captureTriggered = Boolean(frame.captureId && frame.captureId > session.lastCaptureId);
          if (frame.captureId) session.lastCaptureId = frame.captureId;

          if (captureTriggered && session.role === 'POLICE' && this.phase === 'PLAYING') {
            captureAttempts.push({ policeId: session.id, yaw: frame.yaw });
          }

          // Track rescue held intent
          session.rescueHeld = Boolean(frame.rescueHeld);
          if (!session.rescueHeld) {
            session.rescueProgressMs = 0;
            session.rescueNeedsRelease = false;
          }

          const isJailed = session.role === 'ROBBER' && session.state === 'JAILED';

          const frameIntent: MovementIntent = {
            moveX: isJailed ? 0 : ((Math.sign(frame.moveX) || 0) as -1 | 0 | 1),
            moveZ: isJailed ? 0 : ((Math.sign(frame.moveZ) || 0) as -1 | 0 | 1),
            yaw: frame.yaw,
            jumpPressed: isJailed ? false : jumpPressed,
            sprint: isJailed ? false : Boolean(frame.sprint),
            crouch: Boolean(frame.crouch),
          };

          if (this.phase === 'HEAD_START' && session.role === 'POLICE') {
            frameIntent.moveX = 0;
            frameIntent.moveZ = 0;
            frameIntent.sprint = false;
          }

          if (isJailed && session.jailSlotIndex !== undefined) {
            if (activeJail.slots[session.jailSlotIndex]) {
              session.movementState.pos = [...activeJail.slots[session.jailSlotIndex]!];
              session.movementState.verticalSpeed = 0;
              session.movementState.crouched = false;
              session.movementState.sprinting = false;
            }
          } else {
            session.movementState = stepMovement(
              session.movementState,
              frameIntent,
              session.role as MovementRole,
              officialVillageMap,
              this.movementRules
            );
          }
        }
      } else if (!isStale && !session.movementState.grounded && !(session.role === 'ROBBER' && session.state === 'JAILED')) {
        // Continue physics in mid-air (gravity) even if packet timing is jittered
        session.movementState = stepMovement(
          session.movementState,
          { moveX: 0, moveZ: 0, yaw: session.lastYaw, jumpPressed: false, sprint: false, crouch: session.movementState.crouched },
          session.role as MovementRole,
          officialVillageMap,
          this.movementRules
        );
      } else if (isStale) {
        // A fresh held input remains valid between packets. Only a release
        // frame clears the latch after a completed rescue.
        session.rescueHeld = false;
        session.inputQueue.length = 0;
      }

      // Stealth update (robber crouching in hide zone)
      if (session.role === 'ROBBER' && (session.state === 'FREE' || session.state === 'HIDDEN')) {
        const inZone =
          session.movementState.crouched &&
          !session.movementState.sprinting &&
          isCapsuleInHideZone(
            session.movementState.pos,
            this.rules.CAPSULE_HEIGHT_CROUCHING,
            officialVillageMap.hideZones
          );

        if (inZone) {
          session.hideCrouchMs += dtMs;
          if (session.hideCrouchMs >= this.rules.HIDE_CROUCH_TRIGGER_MS) {
            session.state = 'HIDDEN';
          }
        } else {
          session.hideCrouchMs = 0;
          if (session.state === 'HIDDEN') {
            session.state = 'FREE';
          }
        }
      }

      // Guard zone constraint & token (Police in PLAYING phase)
      if (session.role === 'POLICE') {
        if (this.phase === 'PLAYING') {
          const dist = getDistanceToJailCenter(session.movementState.pos, activeJail.center);
          if (dist <= this.rules.GUARD_ZONE_RADIUS_M) {
            if (this.guardId === session.id) {
              session.guard = true;
            } else if (this.guardId === null) {
              this.guardId = session.id;
              session.guard = true;
              const guardEvent: GameEvent = {
                eventId: `guard-${this.tick}-${session.id}`,
                tick: this.tick,
                type: 'GUARD_CHANGED',
                data: { guardId: session.id, jailId: activeJail.id },
              };
              this.broadcastEvent(guardEvent);
              if (this.db) {
                this.db.recordGameEvent({
                  eventId: guardEvent.eventId,
                  matchId: this.matchId,
                  tick: this.tick,
                  eventType: 'GUARD_CHANGED',
                  actorId: session.id,
                  targetId: null,
                  payload: guardEvent.data,
                });
              }
            } else {
              // Another police is guard: push out to 5m boundary
              session.movementState.pos = clampPositionOutsideGuardZone(
                session.movementState.pos,
                activeJail.center,
                this.rules.GUARD_ZONE_RADIUS_M
              );
              session.guard = false;
            }
          } else {
            // Outside guard zone (> 5m)
            if (this.guardId === session.id) {
              this.guardId = null;
              session.guard = false;
              const guardEvent: GameEvent = {
                eventId: `guard-${this.tick}-null`,
                tick: this.tick,
                type: 'GUARD_CHANGED',
                data: { guardId: null, jailId: activeJail.id },
              };
              this.broadcastEvent(guardEvent);
              if (this.db) {
                this.db.recordGameEvent({
                  eventId: guardEvent.eventId,
                  matchId: this.matchId,
                  tick: this.tick,
                  eventType: 'GUARD_CHANGED',
                  actorId: null,
                  targetId: null,
                  payload: guardEvent.data,
                });
              }
            } else {
              session.guard = false;
            }
          }
        } else {
          session.guard = false;
        }
      }
    }

    // 3. Immunity countdown & expiry
    for (const session of this.players.values()) {
      if (session.role === 'ROBBER') {
        if (session.state === 'IMMUNE') {
          session.immuneRemainingMs = Math.max(0, session.immuneRemainingMs - dtMs);
          if (session.immuneRemainingMs <= 0) {
            session.state = 'FREE';
            session.immuneRemainingMs = 0;
            this.db?.updateRobberState(this.matchId, session.id, 'FREE');
          }
        } else if (session.state === 'JAILED') {
          session.timeJailedMs += dtMs;
        }
      }
    }

    // 4. Capture evaluation & execution (ordered by police ID)
    if (this.phase === 'PLAYING') {
      captureAttempts.sort((a, b) => a.policeId.localeCompare(b.policeId));
      const captureCooldownTicks = Math.ceil(
        this.rules.CAPTURE_COOLDOWN_MS / this.rules.SIMULATION_TIMESTEP_MS
      );

      for (const attempt of captureAttempts) {
        const session = this.players.get(attempt.policeId);
        if (!session || session.role !== 'POLICE') continue;

        if (
          session.lastCaptureAttemptTick === 0 ||
          this.tick - session.lastCaptureAttemptTick >= captureCooldownTicks
        ) {
          session.lastCaptureAttemptTick = this.tick;

          const policeActor: CaptureActor = {
            id: session.id,
            role: 'POLICE',
            pos: session.movementState.pos,
            yaw: attempt.yaw,
            crouch: session.movementState.crouched,
          };

          const robbers: CaptureTarget[] = Array.from(this.players.values())
            .filter((p) => p.role === 'ROBBER')
            .map((p) => ({
              id: p.id,
              role: 'ROBBER' as const,
              pos: p.movementState.pos,
              crouch: p.movementState.crouched,
              state: p.state,
            }));

          const occupiedSlots = new Set<number>();
          for (const p of this.players.values()) {
            if (p.role === 'ROBBER' && p.state === 'JAILED' && p.jailSlotIndex !== undefined) {
              occupiedSlots.add(p.jailSlotIndex);
            }
          }

          const networkCaptureRules = {
            ...this.rules,
            CAPTURE_MAX_DISTANCE_M: Math.max(this.rules.CAPTURE_MAX_DISTANCE_M, 2.0),
            CAPTURE_MAX_ANGLE_DEG: Math.max(this.rules.CAPTURE_MAX_ANGLE_DEG, 65),
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
            const targetSession = this.players.get(captureResult.target.id);
            if (targetSession) {
              targetSession.state = 'JAILED';
              targetSession.jailSlotIndex = captureResult.slotIndex;
              targetSession.movementState.pos = [...captureResult.jailPos];
              targetSession.movementState.verticalSpeed = 0;
              targetSession.timeJailedMs = 0;
              targetSession.immuneRemainingMs = 0;
              targetSession.rescueProgressMs = 0;
              targetSession.rescueHeld = false;
            }

            const captureEvent: GameEvent = {
              eventId: `capture-${this.tick}-${captureResult.target.id}`,
              tick: this.tick,
              type: 'CAPTURE',
              data: {
                policeId: session.id,
                robberId: captureResult.target.id,
                jailId: activeJail.id,
                slotIndex: captureResult.slotIndex,
              },
            };
            this.broadcastEvent(captureEvent);

            if (this.db) {
              this.db.incrementPlayerCapture(this.matchId, session.id);
              this.db.updateRobberState(this.matchId, captureResult.target.id, 'JAILED');
              this.db.recordGameEvent({
                eventId: captureEvent.eventId,
                matchId: this.matchId,
                tick: this.tick,
                eventType: 'CAPTURE',
                actorId: session.id,
                targetId: captureResult.target.id,
                payload: captureEvent.data,
              });
            }

            // Win check: all 4 robbers jailed
            const unjailedRobbers = Array.from(this.players.values()).filter(
              (p) => p.role === 'ROBBER' && p.state !== 'JAILED'
            );
            if (unjailedRobbers.length === 0) {
              this.phase = 'RESULT';
              this.remainingMs = Number(this.rules.PHASE_DURATION_RESULT_MS);
              this.matchResult = { winner: 'POLICE', reason: 'ALL_ROBBERS_JAILED' };
              const durationSeconds = this.matchStartedAt > 0
                ? Math.max(0, Math.round((Date.now() - this.matchStartedAt) / 1000))
                : 0;
              const resultEvent: GameEvent = {
                eventId: `result-${this.tick}`,
                tick: this.tick,
                type: 'RESULT',
                data: this.matchResult,
              };
              this.broadcastEvent(resultEvent);

              if (this.db) {
                this.db.updateMatch(this.matchId, {
                  phase: 'RESULT',
                  winner: 'POLICE',
                  winReason: 'ALL_ROBBERS_JAILED',
                  endedAt: Date.now(),
                  durationSeconds,
                });
                this.db.recordGameEvent({
                  eventId: resultEvent.eventId,
                  matchId: this.matchId,
                  tick: this.tick,
                  eventType: 'RESULT',
                  actorId: null,
                  targetId: null,
                  payload: resultEvent.data,
                });
              }
              break; // End capture loop, skip rescue
            }
          } else {
            if (session.socket) {
              session.socket.emit(SERVER_EVENTS.GAME_EVENT, {
                eventId: `miss-${this.tick}-${session.id}`,
                tick: this.tick,
                type: 'CAPTURE_MISS',
                data: {
                  policeId: session.id,
                  failReason: captureResult.failReason,
                },
              });
            }
          }
        }
      }
    }

    // 5. Rescue evaluation & execution (ordered by robber ID)
    if (this.phase === 'PLAYING') {
      const jailedRobbers = Array.from(this.players.values()).filter(
        (p) => p.role === 'ROBBER' && p.state === 'JAILED'
      );

      if (jailedRobbers.length === 0) {
        // No jailed robbers -> cancel any rescue progress
        for (const p of this.players.values()) {
          if (p.role === 'ROBBER') {
            p.rescueProgressMs = 0;
          }
        }
      } else {
        const freeRobbers = Array.from(this.players.values())
          .filter((p) => p.role === 'ROBBER' && (p.state === 'FREE' || p.state === 'HIDDEN'))
          .sort((a, b) => a.id.localeCompare(b.id));

        const completedRescuers: { session: PlayerSession; anchorIndex: number }[] = [];

        for (const robber of freeRobbers) {
          if (robber.rescueNeedsRelease || !robber.rescueHeld) {
            robber.rescueProgressMs = 0;
            continue;
          }

          const rescuerActor: RescuerActor = {
            id: robber.id,
            role: 'ROBBER',
            pos: robber.movementState.pos,
            yaw: robber.lastYaw,
            crouch: robber.movementState.crouched,
            state: robber.state,
          };

          const networkRescueRules = {
            ...this.rules,
            RESCUE_RADIUS_M: Math.max(this.rules.RESCUE_RADIUS_M, 1.75),
          };

          const eligibility = checkRescueEligibility(
            rescuerActor,
            activeJail,
            officialVillageMap.colliders,
            networkRescueRules
          );

          if (eligibility.eligible && eligibility.anchorIndex !== undefined) {
            robber.rescueProgressMs += dtMs;
            if (robber.rescueProgressMs >= this.rules.RESCUE_REQUIRED_HOLD_MS) {
              completedRescuers.push({ session: robber, anchorIndex: eligibility.anchorIndex });
            }
          } else {
            robber.rescueProgressMs = 0;
          }
        }

        // Complete at most 1 rescue per tick
        if (completedRescuers.length > 0) {
          const winner = completedRescuers[0]!;

          const jailedTargets: JailedRobberTarget[] = jailedRobbers.map((j) => ({
            id: j.id,
            role: 'ROBBER',
            pos: j.movementState.pos,
            state: j.state,
            timeJailedMs: j.timeJailedMs,
            jailSlotIndex: j.jailSlotIndex,
          }));

          const robberToRescue = selectRobberToRescue(jailedTargets);
          if (robberToRescue) {
            const releasedSession = this.players.get(robberToRescue.id);
            const releasePos = determineReleasePosition(
              winner.anchorIndex,
              activeJail,
              officialVillageMap
            );

            if (releasedSession) {
              releasedSession.state = 'IMMUNE';
              releasedSession.immuneRemainingMs = Number(this.rules.RESCUE_IMMUNITY_DURATION_MS);
              releasedSession.timeJailedMs = 0;
              releasedSession.jailSlotIndex = undefined;
              releasedSession.movementState.pos = [...releasePos];
              releasedSession.movementState.verticalSpeed = 0;
            }

            // Reset all robbers' rescue progress and require key release
            for (const p of this.players.values()) {
              if (p.role === 'ROBBER') {
                p.rescueProgressMs = 0;
                p.rescueNeedsRelease = true;
              }
            }

            const rescueEvent: GameEvent = {
              eventId: `rescue-${this.tick}-${robberToRescue.id}`,
              tick: this.tick,
              type: 'RESCUE',
              data: {
                rescuerId: winner.session.id,
                rescuedId: robberToRescue.id,
                jailId: activeJail.id,
                anchorIndex: winner.anchorIndex,
                releasePos,
              },
            };
            this.broadcastEvent(rescueEvent);

            if (this.db) {
              this.db.incrementPlayerRescue(this.matchId, winner.session.id);
              this.db.updateRobberState(this.matchId, robberToRescue.id, 'IMMUNE');
              this.db.recordGameEvent({
                eventId: rescueEvent.eventId,
                matchId: this.matchId,
                tick: this.tick,
                eventType: 'RESCUE',
                actorId: winner.session.id,
                targetId: robberToRescue.id,
                payload: rescueEvent.data,
              });
            }
          }
        }
      }
    }

    // 6. Broadcast snapshot every other tick (15Hz)
    if (this.tick % 2 === 0) {
      this.broadcastSnapshots();
    }

    const tDuration = performance.now() - t0;
    this.recordTickDuration(tDuration);
  }

  private broadcastSnapshots(): void {
    for (const [id, session] of this.players.entries()) {
      if (!session.socket || !session.role) continue;
      this.sendSnapshotToPlayer(session.id);
    }
  }

  public sendSnapshotToPlayer(playerId: string): void {
    const session = this.players.get(playerId);
    if (!session || !session.socket || !session.role) return;

    const visibleOthers: PlayerView[] = [];

    for (const other of this.players.values()) {
      if (other.id === session.id || !other.role) continue;

      // Visibility filtering: hidden robber > 2m away is omitted from police view
      if (session.role === 'POLICE' && other.role === 'ROBBER') {
        const canSee = canPoliceSeeRobber(
          session.movementState.pos,
          other.movementState.pos,
          other.state,
          this.rules.HIDDEN_VISIBILITY_PROXIMITY_M
        );
        if (!canSee) {
          continue; // Hidden beyond 2m -> omit completely from police snapshot
        }
      }

      const otherView: PlayerView = {
        id: other.id,
        role: other.role,
        pos: [...other.movementState.pos],
        yaw: other.lastYaw,
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
      yaw: session.lastYaw,
      vel: [0, session.movementState.verticalSpeed, 0],
      crouch: session.movementState.crouched,
      grounded: session.movementState.grounded,
      connected: true,
      stamina: session.movementState.stamina,
      ackSeq: session.lastProcessedSeq,
      ackJumpId: session.lastJumpId,
      ackCaptureId: session.lastCaptureId,
      immuneRemainingMs: session.immuneRemainingMs,
      rescueProgressMs: session.rescueProgressMs,
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
      result: this.phase === 'RESULT' ? this.matchResult : null,
    };

    session.socket.emit(SERVER_EVENTS.GAME_SNAPSHOT, snapshot);
  }

  public broadcastEvent(event: GameEvent): void {
    for (const player of this.players.values()) {
      if (player.socket && player.socket.connected) {
        player.socket.emit(SERVER_EVENTS.GAME_EVENT, event);
      }
    }
  }
}
