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
  PlayerStats,
  CosmeticPreferences,
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
import { executeBotBehavior } from './botAi.js';

export interface PlayerSession {
  id: string;
  name: string;
  socket: Socket | null;
  resumeToken: string;
  role: Role | null;
  rolePreference?: Role | 'AUTO';
  ready: boolean;
  isHost: boolean;
  isCaptain: boolean;
  isBot?: boolean;
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
  cosmetic?: CosmeticPreferences | undefined;
  distractionTarget?: [number, number] | undefined;
  distractionRemainingMs?: number | undefined;
  simulationStepBudget?: number | undefined;
  lastPebbleTimestamp?: number | undefined;
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
  private playerStats: Map<string, { captures: number; rescues: number; timeJailedMs: number }> = new Map();

  private simTimer: NodeJS.Timeout | null = null;
  private db: DatabaseManager | null = null;
  private tick: number = 0;
  private remainingMs: number;
  private monotonicLastTime: number = Date.now();
  private tickDurations: number[] = [];
  private totalTicksCount = 0;
  private maxTickTimeMs = 0;
  private lastTickTimeMs = 0;
  private botCounter: number = 0;

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
      simulationStepBudget: 2,
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

  public addBot(rolePreference?: Role | null): PlayerSession | null {
    if (this.phase !== 'LOBBY') return null;
    if (this.players.size >= this.rules.REQUIRED_PLAYERS) return null;

    const botCount = Array.from(this.players.values()).filter((p) => p.isBot).length;
    this.botCounter++;
    const botId = `bot-${this.botCounter}`;
    const botName = `Máy ${botCount + 1}`;
    const resumeToken = `bot-token-${botId}`;

    const session: PlayerSession = {
      id: botId,
      name: botName,
      socket: null,
      resumeToken,
      role: rolePreference ?? null,
      rolePreference: rolePreference ?? 'AUTO',
      ready: true,
      isHost: false,
      isCaptain: false,
      isBot: true,
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
      simulationStepBudget: 2,
    };

    this.players.set(botId, session);

    if (this.db) {
      this.db.upsertPlayer({
        id: botId,
        roomCode: this.roomCode,
        name: botName,
        ready: true,
        isHost: false,
        resumeToken,
      });
    }

    return session;
  }

  public removeBot(botId?: string): boolean {
    if (this.phase !== 'LOBBY') return false;

    let targetId = botId;
    if (!targetId) {
      const bots = Array.from(this.players.values()).filter((p) => p.isBot);
      if (bots.length === 0) return false;
      targetId = bots[bots.length - 1]!.id;
    }

    const session = this.players.get(targetId);
    if (!session || !session.isBot) return false;

    this.players.delete(targetId);
    return true;
  }

  public setPlayerRole(playerId: string, role: Role | null): boolean {
    if (this.phase !== 'LOBBY') return false;
    const session = this.players.get(playerId);
    if (!session) return false;

    session.role = role;
    session.rolePreference = role ?? 'AUTO';
    return true;
  }

  public setPlayerCosmetic(playerId: string, cosmetic?: CosmeticPreferences): boolean {
    const session = this.players.get(playerId);
    if (!session) return false;
    session.cosmetic = cosmetic;
    return true;
  }

  public handlePebble(landingPos: Vec3): void {
    for (const session of this.players.values()) {
      if (session.isBot && session.role === 'POLICE') {
        const dx = session.movementState.pos[0] - landingPos[0];
        const dz = session.movementState.pos[2] - landingPos[2];
        const dist = Math.hypot(dx, dz);
        if (dist <= 12) {
          session.distractionTarget = [landingPos[0], landingPos[2]];
          session.distractionRemainingMs = 4000;
        }
      }
    }
  }

  public autoAssignRoles(): boolean {
    if (this.phase !== 'LOBBY') return false;
    const list = Array.from(this.players.values());
    if (list.length === 0) return false;

    const policeCount =
      list.length === this.rules.REQUIRED_PLAYERS
        ? this.rules.POLICE_COUNT
        : Math.max(1, Math.min(this.rules.POLICE_COUNT, Math.floor(list.length / 3) || 1));

    const shuffled = [...list].sort(() => Math.random() - 0.5);

    shuffled.forEach((p, index) => {
      const assignedRole: Role = index < policeCount ? 'POLICE' : 'ROBBER';
      p.role = assignedRole;
      p.rolePreference = assignedRole;
    });

    return true;
  }

  public finishMatch(winner: 'POLICE' | 'ROBBER', reason: string): void {
    if (this.phase === 'RESULT') return;
    this.phase = 'RESULT';
    this.remainingMs = Number(this.rules.PHASE_DURATION_RESULT_MS);

    // Compute MVP Police (most captures) and MVP Robber (most rescues, or least time jailed)
    let bestPolice: PlayerSession | null = null;
    let maxCaptures = -1;
    let bestRobber: PlayerSession | null = null;
    let maxRescues = -1;
    let minJailedTime = Infinity;

    const statsObj: Record<string, PlayerStats> = {};

    for (const [id, stats] of this.playerStats.entries()) {
      statsObj[id] = { ...stats };
      const p = this.players.get(id);
      if (!p) continue;

      if (p.role === 'POLICE') {
        if (stats.captures > maxCaptures) {
          maxCaptures = stats.captures;
          bestPolice = p;
        }
      } else if (p.role === 'ROBBER') {
        if (
          stats.rescues > maxRescues ||
          (stats.rescues === maxRescues && stats.timeJailedMs < minJailedTime)
        ) {
          maxRescues = stats.rescues;
          minJailedTime = stats.timeJailedMs;
          bestRobber = p;
        }
      }
    }

    this.matchResult = {
      winner,
      reason,
      stats: statsObj,
      ...(bestPolice ? { mvpPolice: bestPolice.id } : {}),
      ...(bestRobber ? { mvpRobber: bestRobber.id } : {}),
    };

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
        winner,
        winReason: reason,
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
    this.playerStats.clear();
    for (const p of this.players.values()) {
      this.playerStats.set(p.id, { captures: 0, rescues: 0, timeJailedMs: 0 });
    }

    // Assign roles: For 6 players: 2 Police, 4 Robbers. For 2-5 players: at least 1 Police, rest Robbers.
    const list = Array.from(this.players.values());
    const policeCount =
      this.players.size === this.rules.REQUIRED_PLAYERS
        ? this.rules.POLICE_COUNT
        : Math.max(1, Math.min(this.rules.POLICE_COUNT, Math.floor(this.players.size / 3) || 1));
    const robberCount = this.players.size - policeCount;

    // Check if roles are already balanced per preferences
    const currentPolice = list.filter((p) => p.role === 'POLICE');
    const currentRobbers = list.filter((p) => p.role === 'ROBBER');

    if (currentPolice.length === policeCount && currentRobbers.length === robberCount) {
      // Retain already balanced roles
    } else {
      const policeAssigned: PlayerSession[] = [];
      const robberAssigned: PlayerSession[] = [];
      const remaining: PlayerSession[] = [];

      for (const p of list) {
        if (p.role === 'POLICE' && policeAssigned.length < policeCount) {
          policeAssigned.push(p);
        } else if (p.role === 'ROBBER' && robberAssigned.length < robberCount) {
          robberAssigned.push(p);
        } else {
          remaining.push(p);
        }
      }

      for (const p of remaining) {
        if (policeAssigned.length < policeCount) {
          policeAssigned.push(p);
        } else {
          robberAssigned.push(p);
        }
      }

      for (const p of policeAssigned) p.role = 'POLICE';
      for (const p of robberAssigned) p.role = 'ROBBER';
    }

    // Elect captain: Prefer a human Police player; if none, the first bot Police
    const policeList = list.filter((p) => p.role === 'POLICE');
    const humanPolice = policeList.find((p) => !p.isBot);
    const chosenCaptain = humanPolice || policeList[0] || list[0]!;

    policeList.forEach((p, index) => {
      p.guard = false;
      p.isCaptain = p.id === chosenCaptain.id;
      p.jailSlotIndex = undefined;
      if (p.isCaptain) {
        this.captainId = p.id;
      }
      p.movementState = initialMovement(
        officialVillageMap.spawns.police[index] || officialVillageMap.spawns.police[0]!,
        this.movementRules
      );
    });

    const robbersList = list.filter((p) => p.role === 'ROBBER');
    robbersList.forEach((p, index) => {
      p.isCaptain = false;
      p.state = 'FREE';
      p.timeJailedMs = 0;
      p.immuneRemainingMs = 0;
      p.rescueProgressMs = 0;
      p.rescueHeld = false;
      p.rescueNeedsRelease = false;
      p.hideCrouchMs = 0;
      p.jailSlotIndex = undefined;
      p.movementState = initialMovement(
        officialVillageMap.spawns.robber[index] || officialVillageMap.spawns.robber[0]!,
        this.movementRules
      );
    });

    this.phase = 'JAIL_SELECTION';
    this.selectedJailId = null;
    this.remainingMs = Number(this.rules.PHASE_DURATION_JAIL_SELECTION_MS);

    // If captain is a bot, immediately auto-select jail so match proceeds to HEAD_START
    const captain = this.players.get(this.captainId || '');
    if (captain?.isBot) {
      this.selectJail(captain.id, 'J1');
    }

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
      session.ready = session.isBot ? true : false;
      session.role = session.rolePreference && session.rolePreference !== 'AUTO' ? session.rolePreference : null;
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
      session.simulationStepBudget = 2;
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
        connected: p.isBot ? true : (p.socket !== null && p.socket.connected),
      };
      if (p.isHost) member.isHost = true;
      if (p.isCaptain) member.isCaptain = true;
      if (p.isBot) member.isBot = true;
      if (p.cosmetic) member.cosmetic = p.cosmetic;
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
    // Synchronize step dt with real wall-clock elapsed time to prevent match clock drift
    this.simTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(250, Math.max(1, now - this.monotonicLastTime));
      this.monotonicLastTime = now;
      this.step(elapsed);
    }, this.rules.SIMULATION_TIMESTEP_MS);
  }

  public stop(): void {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  private runBotAi(
    bot: PlayerSession,
    dtMs: number,
    captureAttempts: { policeId: string; yaw: number }[],
    activeJail: typeof officialVillageMap.jails[0]
  ): void {
    executeBotBehavior({
      bot,
      allPlayers: this.players.values(),
      phase: this.phase,
      activeJail,
      guardId: this.guardId,
      map: officialVillageMap,
      movementRules: this.movementRules,
      capsuleHeight: this.movementRules.standingHeight,
      capsuleHeightCrouch: this.movementRules.crouchHeight,
      captureRadius: this.rules.CAPTURE_MAX_DISTANCE_M,
      captureAttempts,
    });
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
        this.finishMatch('ROBBER', 'TIME_EXPIRED');
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

      if (session.isBot) {
        this.runBotAi(session, dtMs, captureAttempts, activeJail);
      } else {
        const isStale =
          session.socket === null || now - session.lastInputTimestamp > this.rules.INPUT_STALE_TIMEOUT_MS;

        // Anti-Speedhack (Issue 3): Replenish 1 simulation step per 30Hz tick, max burst 2 to absorb network jitter
        session.simulationStepBudget = Math.min(2, (session.simulationStepBudget ?? 0) + 1);

        let stepsTaken = 0;
        if (!isStale && session.inputQueue.length > 0) {
          const maxStepsAllowed = Math.min(session.inputQueue.length, session.simulationStepBudget);
          const framesToProcess = session.inputQueue.splice(0, maxStepsAllowed);

          for (const frame of framesToProcess) {
            if (frame.seq <= session.lastProcessedSeq) continue;
            session.lastProcessedSeq = frame.seq;
            session.lastYaw = frame.yaw;
            stepsTaken++;

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

          session.simulationStepBudget = Math.max(0, session.simulationStepBudget - stepsTaken);

          // Prevent malicious input flood / memory exhaustion
          if (session.inputQueue.length > 5) {
            session.inputQueue.splice(0, session.inputQueue.length - 5);
          }
        }

        // Stale & Idle Physics (Issue 6): ONLY run idle step when player is genuinely stale (>600ms/disconnected)
        // Normal jittering clients buffer frames without extra gravity steps being artificially injected
        if (stepsTaken === 0 && isStale) {
          session.rescueHeld = false;
          session.inputQueue.length = 0;
          session.simulationStepBudget = 1;

          const isJailed = session.role === 'ROBBER' && session.state === 'JAILED';
          if (isJailed && session.jailSlotIndex !== undefined && activeJail.slots[session.jailSlotIndex]) {
            session.movementState.pos = [...activeJail.slots[session.jailSlotIndex]!];
            session.movementState.verticalSpeed = 0;
          } else if (!isJailed) {
            const idleIntent: MovementIntent = {
              moveX: 0,
              moveZ: 0,
              yaw: session.lastYaw,
              jumpPressed: false,
              sprint: false,
              crouch: session.movementState.crouched,
            };
            session.movementState = stepMovement(
              session.movementState,
              idleIntent,
              session.role as MovementRole,
              officialVillageMap,
              this.movementRules
            );
          }
        }
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
          const stats = this.playerStats.get(session.id);
          if (stats) stats.timeJailedMs += dtMs;
        }
      }
      if (session.isBot && session.distractionRemainingMs && session.distractionRemainingMs > 0) {
        session.distractionRemainingMs = Math.max(0, session.distractionRemainingMs - dtMs);
        if (session.distractionRemainingMs <= 0) {
          session.distractionTarget = undefined;
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

          // Dynamic Network Capture Tolerance:
          // Extends base CAPTURE_MAX_DISTANCE_M and CAPTURE_MAX_ANGLE_DEG with tolerance margin (+0.4m, +10.0 deg default)
          const distToleranceMargin = Math.max(0, (this.rules.CAPTURE_NETWORK_TOLERANCE_DISTANCE_M ?? 2.0) - 1.6);
          const angleToleranceMargin = Math.max(0, (this.rules.CAPTURE_NETWORK_TOLERANCE_ANGLE_DEG ?? 65.0) - 55.0);

          const networkCaptureRules = {
            ...this.rules,
            CAPTURE_MAX_DISTANCE_M: this.rules.CAPTURE_MAX_DISTANCE_M + distToleranceMargin,
            CAPTURE_MAX_ANGLE_DEG: this.rules.CAPTURE_MAX_ANGLE_DEG + angleToleranceMargin,
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

            const copStats = this.playerStats.get(session.id);
            if (copStats) copStats.captures++;

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
              this.finishMatch('POLICE', 'ALL_ROBBERS_JAILED');
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

          const rescueToleranceMargin = 0.25;
          const networkRescueRules = {
            ...this.rules,
            RESCUE_RADIUS_M: this.rules.RESCUE_RADIUS_M + rescueToleranceMargin,
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

            const robberStats = this.playerStats.get(winner.session.id);
            if (robberStats) robberStats.rescues++;

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
        connected: other.isBot ? true : (other.socket !== null && other.socket.connected),
      };
      if (other.cosmetic) {
        otherView.cosmetic = other.cosmetic;
      }
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
    if (session.cosmetic) {
      selfView.cosmetic = session.cosmetic;
    }
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
