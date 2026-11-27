import { io, Socket } from 'socket.io-client';
import { Group, Vector3, type Scene } from 'three';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  PROTOCOL_VERSION,
  type InputFrame,
  type RoomState,
  type Snapshot,
  type GameEvent,
  type AckResponse,
  type Role,
  type QuickChatMessage,
  type TacticalPing,
  type PebbleEvent,
  type PublicRoomSummary,
  type CosmeticPreferences,
} from '../../../packages/shared/src/protocol';
import type { InputState } from '../input/state';
import { readMapDigest } from './room-details';
import { CharacterAvatar, createCharacterModel } from '../player/character-avatar';
import {
  DEFAULT_GAME_RULES,
  type GameRules,
  type MovementRules,
  movementRules,
  movementRulesFromGameRules,
} from '../../../packages/shared/src/rules';

export interface GameSessionCallbacks {
  onStatus: (message: string, isError?: boolean) => void;
  onRoom: (room: RoomState | null) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  onInterrupted?: () => void;
  onGameEvent?: (event: GameEvent) => void;
  onChat?: (chat: QuickChatMessage) => void;
  onPing?: (ping: TacticalPing) => void;
  onPebble?: (pebble: PebbleEvent) => void;
}

type Credentials = { roomCode: string; playerId: string; resumeToken: string };
const sessionKey = 'folk_tag_room_v1';

export interface RemotePlayerEntity {
  id: string;
  role: 'POLICE' | 'ROBBER';
  avatar: CharacterAvatar;
  mesh: Group;
  currentPos: Vector3;
  targetPos: Vector3;
  previousPos: Vector3;
  fromPos: Vector3;
  toPos: Vector3;
  currentYaw: number;
  targetYaw: number;
  fromYaw: number;
  toYaw: number;
  interpElapsed: number;
  interpDuration: number;
  targetScaleY: number;
  state?: string | undefined;
  crouch: boolean;
  visible: boolean;
}

export class GameSession {
  public interactDoor(): Promise<AckResponse> {
    return this.socket.timeout(3000).emitWithAck(CLIENT_EVENTS.DOOR_INTERACT, {
      requestId: crypto.randomUUID?.() ?? 'door-' + Date.now() + '-' + Math.random(),
    });
  }
  private credentials: Credentials | null = null;
  private resuming = false;
  private socket: Socket;
  private group: Group;
  private entities = new Map<string, RemotePlayerEntity>();
  private lastTick = -1;
  private seq = 0;
  private jumpId = 0;
  private captureId = 0;
  private roomReady = false;
  private localMapHash = '';

  public currentRoom: RoomState | null = null;
  public playerId: string | null = null;
  public isMock = false;
  public activeRules: GameRules = DEFAULT_GAME_RULES;
  public activeMovementRules: MovementRules = movementRules;

  public getRules(): GameRules {
    return this.activeRules;
  }

  public getMovementRules(): MovementRules {
    return this.activeMovementRules;
  }

  constructor(scene: Scene, private callbacks: GameSessionCallbacks) {
    this.group = new Group();
    scene.add(this.group);

    // Calculate map hash immediately
    readMapDigest().then((hash) => {
      this.localMapHash = hash;
    }).catch(() => {
      this.localMapHash = '';
    });

    this.socket = io({
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    this.socket.on('connect', () => {
      if (this.credentials && !this.isMock) {
        void this.resume(this.credentials);
      } else {
        this.callbacks.onStatus('Đã kết nối máy chủ Authoritative.', false);
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.resetMarkers();
      this.roomReady = false;
      this.resuming = Boolean(this.credentials);
      if (reason === 'io client disconnect') return;
      this.callbacks.onInterrupted?.();
      this.callbacks.onStatus(`Đã ngắt kết nối máy chủ (${reason}). Đang thử kết nối lại…`, true);
    });

    this.socket.on('connect_error', () => {
      this.callbacks.onStatus('Chưa kết nối được máy chủ backend (Port 3001). Đang thử lại…', true);
    });

    this.socket.io.on('reconnect_failed', () => {
      this.leaveRoom();
      this.callbacks.onStatus('Không thể kết nối lại máy chủ. Hãy vào lại bằng mã phòng.', true);
    });

    this.socket.on(SERVER_EVENTS.ROOM_STATE, (room: RoomState) => {
      if (!room || room.protocolVersion !== PROTOCOL_VERSION || (room.roomCode === 'MOCK01') !== this.isMock) return;
      if (this.currentRoom?.roomCode !== room.roomCode || room.phase === 'LOBBY') this.resetMarkers();

      const prevRulesVersion = this.currentRoom?.rulesVersion ?? 0;
      const newRulesVersion = room.rulesVersion ?? 1;

      if (room.rules && (newRulesVersion !== prevRulesVersion || !this.currentRoom?.rules)) {
        this.activeRules = room.rules;
        this.activeMovementRules = movementRulesFromGameRules(room.rules);
        const newInterpDuration = this.getSnapshotInterpDuration();
        for (const entity of this.entities.values()) {
          entity.interpDuration = newInterpDuration;
        }
      }

      this.currentRoom = room;
      this.roomReady = true;
      this.callbacks.onRoom(room);
    });

    this.socket.on(SERVER_EVENTS.GAME_SNAPSHOT, (snapshot: Snapshot) => {
      if (
        !this.roomReady ||
        snapshot?.protocolVersion !== PROTOCOL_VERSION ||
        (this.isMock ? snapshot.matchId !== 'mock-match-001' : snapshot.self?.id !== this.playerId) ||
        snapshot.tick <= this.lastTick ||
        !snapshot.self?.pos?.every(Number.isFinite) ||
        !Array.isArray(snapshot.players)
      ) {
        return;
      }

      if (this.lastTick < 0) {
        // The live server retains processed input IDs across a resume.
        this.seq = snapshot.self.ackSeq;
        this.jumpId = snapshot.self.ackJumpId;
        this.captureId = snapshot.self.ackCaptureId;
      }
      this.lastTick = snapshot.tick;
      if (this.currentRoom && this.currentRoom.phase !== snapshot.phase) {
        this.currentRoom = { ...this.currentRoom, phase: snapshot.phase };
        this.callbacks.onRoom(this.currentRoom);
      }
      const visible = new Set<string>();

      for (const p of snapshot.players) {
        if (
          (!p.connected && !p.id.startsWith('bot-')) ||
          !['POLICE', 'ROBBER'].includes(p.role) ||
          !p.pos?.every(Number.isFinite) ||
          (p.role !== snapshot.self.role && p.state === 'HIDDEN' && Math.hypot(p.pos[0] - snapshot.self.pos[0], p.pos[2] - snapshot.self.pos[2]) > this.activeRules.HIDDEN_VISIBILITY_PROXIMITY_M)
        ) {
          continue;
        }

        visible.add(p.id);
        const scaleY = p.crouch ? 1.1 / 1.7 : 1;
        const targetY = p.pos[1]; // feet directly at ground level

        let entity = this.entities.get(p.id);
        if (!entity) {
          const avatar = createCharacterModel(p.role);
          avatar.root.position.set(p.pos[0], targetY, p.pos[2]);
          avatar.root.rotation.y = p.yaw || 0;
          if (p.cosmetic) avatar.setCosmetics(p.cosmetic);
          this.group.add(avatar.root);

          entity = {
            id: p.id,
            role: p.role,
            avatar,
            mesh: avatar.root,
            currentPos: new Vector3(p.pos[0], targetY, p.pos[2]),
            targetPos: new Vector3(p.pos[0], targetY, p.pos[2]),
            previousPos: new Vector3(p.pos[0], targetY, p.pos[2]),
            fromPos: new Vector3(p.pos[0], targetY, p.pos[2]),
            toPos: new Vector3(p.pos[0], targetY, p.pos[2]),
            currentYaw: p.yaw || 0,
            targetYaw: p.yaw || 0,
            fromYaw: p.yaw || 0,
            toYaw: p.yaw || 0,
            interpElapsed: 0,
            interpDuration: this.getSnapshotInterpDuration(),
            targetScaleY: scaleY,
            state: p.state,
            crouch: Boolean(p.crouch),
            visible: true,
          };
          this.entities.set(p.id, entity);
        } else {
          entity.visible = true;
          if (entity.role !== p.role) {
            entity.role = p.role;
            entity.avatar.setRole(p.role);
          }
          if (p.cosmetic) {
            entity.avatar.setCosmetics(p.cosmetic);
          }
          const nextTarget = new Vector3(p.pos[0], targetY, p.pos[2]);
          if (entity.currentPos.distanceTo(nextTarget) > 3.0) {
            entity.currentPos.copy(nextTarget);
            entity.fromPos.copy(nextTarget);
            entity.toPos.copy(nextTarget);
          } else {
            entity.fromPos.copy(entity.currentPos);
            entity.toPos.copy(nextTarget);
          }
          entity.targetPos.copy(nextTarget);
          entity.fromYaw = entity.currentYaw;
          entity.toYaw = p.yaw || 0;
          entity.interpElapsed = 0;
          entity.interpDuration = this.getSnapshotInterpDuration();
          entity.targetScaleY = scaleY;
          entity.state = p.state;
          entity.crouch = Boolean(p.crouch);
        }
      }

      // Update entity visibility without re-instantiating meshes to prevent GC churn and pop-in
      for (const [id, entity] of this.entities) {
        if (!visible.has(id)) {
          const inRoster = this.currentRoom?.roster.some((m) => m.id === id);
          if (inRoster) {
            // Player is still in match (e.g. hidden robber out of sight): hide model without disposing
            entity.visible = false;
            entity.avatar.root.visible = false;
            entity.mesh.visible = false;
          } else {
            // Player left the room completely: dispose and remove
            entity.avatar.dispose();
            this.group.remove(entity.avatar.root);
            this.entities.delete(id);
          }
        } else {
          entity.visible = true;
          entity.avatar.root.visible = true;
          entity.mesh.visible = true;
        }
      }

      this.callbacks.onSnapshot(snapshot);
    });

    this.socket.on(SERVER_EVENTS.GAME_EVENT, (event: GameEvent) => {
      if (!this.roomReady || !this.currentRoom) return;
      if (event.type === 'CAPTURE') {
        const data = event.data as { policeId?: string; robberId?: string } | null;
        if (!data || ![data.policeId, data.robberId].every(id => this.currentRoom?.roster.some(p => p.id === id))) return;
      }
      this.callbacks.onGameEvent?.(event);
    });

    this.socket.on(SERVER_EVENTS.GAME_CHAT_EVENT, (chat: QuickChatMessage) => {
      this.callbacks.onChat?.(chat);
    });

    this.socket.on(SERVER_EVENTS.GAME_PING_EVENT, (ping: TacticalPing) => {
      this.callbacks.onPing?.(ping);
    });

    this.socket.on(SERVER_EVENTS.GAME_PEBBLE_EVENT, (pebble: PebbleEvent) => {
      this.callbacks.onPebble?.(pebble);
    });
  }

  /**
   * N04 Remote Player Interpolation:
   * Smoothly interpolates remote players' positions and rotations with continuous velocity at 60 FPS in render loop,
   * while driving procedural low-poly skeletal animations (walk, run, crouch, idle, jailed).
   */
  public updateRemoteInterpolation(dtSeconds: number): void {
    if (this.entities.size === 0) return;

    for (const entity of this.entities.values()) {
      if (!entity.avatar.root.visible) continue;
      entity.previousPos.copy(entity.currentPos);

      entity.interpElapsed += dtSeconds;
      const t = Math.min(1.25, entity.interpElapsed / entity.interpDuration);

      if (t <= 1.0) {
        entity.currentPos.lerpVectors(entity.fromPos, entity.toPos, t);
      } else {
        // Continuous linear velocity extrapolation between snapshots so entities never stutter
        const extraTime = (t - 1.0) * entity.interpDuration;
        const velX = (entity.toPos.x - entity.fromPos.x) / entity.interpDuration;
        const velZ = (entity.toPos.z - entity.fromPos.z) / entity.interpDuration;
        entity.currentPos.x = entity.toPos.x + velX * extraTime;
        entity.currentPos.z = entity.toPos.z + velZ * extraTime;
      }
      entity.avatar.root.position.copy(entity.currentPos);

      // Smooth yaw angle interpolation with wrapping
      let diff = (entity.toYaw - entity.fromYaw + Math.PI) % (Math.PI * 2) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      entity.currentYaw = entity.fromYaw + diff * Math.min(1.0, t);
      entity.avatar.root.rotation.y = entity.currentYaw;

      // Calculate horizontal velocity to drive locomotion animations
      const dx = entity.currentPos.x - entity.previousPos.x;
      const dz = entity.currentPos.z - entity.previousPos.z;
      const speed = Math.hypot(dx, dz) / Math.max(0.001, dtSeconds);

      // Update low-poly avatar skeletal kinematics
      entity.avatar.update(dtSeconds, {
        speed,
        crouch: entity.crouch,
        grounded: true,
        jailed: entity.state === 'JAILED',
      });
    }
  }

  public getSnapshotInterpDuration(): number {
    const tickHz = this.activeRules?.SIMULATION_TICK_RATE_HZ || 30;
    const broadcastHz = this.activeRules?.SNAPSHOT_BROADCAST_RATE_HZ || 15;
    const ticks = Math.max(1, Math.round(tickHz / broadcastHz));
    return ticks / tickHz;
  }

  public getRemoteEntities(onlyVisible = false): ReadonlyMap<string, RemotePlayerEntity> {
    if (!onlyVisible) return this.entities;
    const visibleEntities = new Map<string, RemotePlayerEntity>();
    for (const [id, entity] of this.entities) {
      if (entity.visible && entity.avatar.root.visible) {
        visibleEntities.set(id, entity);
      }
    }
    return visibleEntities;
  }

  public getVisibleRemoteEntities(): ReadonlyMap<string, RemotePlayerEntity> {
    return this.getRemoteEntities(true);
  }

  private resetMarkers(): void {
    for (const entity of this.entities.values()) {
      entity.avatar.dispose();
    }
    this.group.clear();
    this.entities.clear();
    this.lastTick = -1;
  }

  private remember(data: Credentials | null) {
    this.credentials = data;
    this.playerId = data?.playerId ?? null;
    try {
      if (data) sessionStorage.setItem(sessionKey, JSON.stringify(data));
      else sessionStorage.removeItem(sessionKey);
    } catch { /* A live socket can still reconnect when storage is unavailable. */ }
  }

  public restore(): boolean {
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null');
      if (!saved) return false;
      if (![saved.roomCode, saved.playerId, saved.resumeToken].every(v => typeof v === 'string' && v.length > 0)) {
        this.remember(null);
        return false;
      }
      this.remember(saved);
    } catch {
      this.remember(null);
      return false;
    }
    this.resuming = true;
    this.connect();
    return true;
  }

  private async resume(saved: Credentials) {
    this.resuming = true;
    const socketId = this.socket.id;
    this.callbacks.onStatus('Đang khôi phục phiên trong phòng ' + saved.roomCode + '…');
    const payload = { ...saved, protocolVersion: PROTOCOL_VERSION, requestId: crypto.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    try {
      // A lost ack may follow a successful rotation. Reuse the same requestId.
      let ack: AckResponse<Credentials>;
      try {
        ack = await this.socket.timeout(4000).emitWithAck(CLIENT_EVENTS.ROOM_RESUME, payload);
      } catch {
        if (this.socket.id !== socketId || this.credentials !== saved) return;
        ack = await this.socket.timeout(4000).emitWithAck(CLIENT_EVENTS.ROOM_RESUME, payload);
      }
      if (this.socket.id !== socketId || this.credentials !== saved) return;
      if (!ack.ok && ack.code === 'RATE_LIMIT') {
        window.setTimeout(() => {
          if (this.socket.id === socketId && this.credentials === saved) void this.resume(saved);
        }, 1000);
        return;
      }
      if (!ack.ok || !ack.data) {
        this.leaveRoom();
        this.callbacks.onStatus('Phiên phòng không còn khả dụng. Hãy vào lại bằng mã phòng.', true);
        return;
      }
      this.remember(ack.data);
      this.resuming = false;
      this.callbacks.onRoom(this.currentRoom);
      this.callbacks.onStatus('Đã trở lại phòng ' + ack.data.roomCode + '.');
    } catch {
      if (this.socket.id !== socketId || this.credentials !== saved) return;
      this.socket.disconnect().connect();
    }
  }

  public connect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  public connectReal(): void {
    if (this.isMock) {
      this.isMock = false;
      this.socket.disconnect();
      this.resetMarkers();
      this.socket = io({
        autoConnect: false,
        reconnection: true,
      });
      this.setupListeners();
    }
    this.connect();
  }

  public connectMock(spawnParam?: string): void {
    this.isMock = true;
    this.socket.disconnect();
    this.resetMarkers();
    this.socket = io('/mock', {
      forceNew: true,
      query: spawnParam ? { spawn: spawnParam } : {},
      autoConnect: false,
      reconnection: true,
    });
    this.setupListeners();
    this.socket.connect();
  }

  public async getMapHash(): Promise<string> {
    if (this.localMapHash) return this.localMapHash;
    try {
      this.localMapHash = await readMapDigest();
      return this.localMapHash;
    } catch {
      return '';
    }
  }

  public async createRoom(name: string): Promise<AckResponse<{ roomCode: string; playerId: string; resumeToken: string }>> {
    this.connectReal();
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_CREATE,
        {
          name,
          protocolVersion: PROTOCOL_VERSION,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse<{ roomCode: string; playerId: string; resumeToken: string }>) => {
          if (res?.ok && res.data) {
            this.remember(res.data);
            this.callbacks.onRoom(this.currentRoom);
          }
          resolve(res);
        }
      );
    });
  }

  public async joinRoom(roomCode: string, name: string): Promise<AckResponse<{ roomCode: string; playerId: string; resumeToken: string }>> {
    this.connectReal();
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_JOIN,
        {
          roomCode: roomCode.trim().toUpperCase(),
          name,
          protocolVersion: PROTOCOL_VERSION,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse<{ roomCode: string; playerId: string; resumeToken: string }>) => {
          if (res?.ok && res.data) {
            this.remember(res.data);
            this.callbacks.onRoom(this.currentRoom);
          }
          resolve(res);
        }
      );
    });
  }

  public async toggleReady(ready: boolean): Promise<AckResponse> {
    const mapHash = await this.getMapHash();
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_READY,
        {
          ready,
          mapHash,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public async startMatch(): Promise<AckResponse> {
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_START,
        {
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public async selectJail(jailId: string): Promise<AckResponse> {
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.JAIL_SELECT,
        {
          jailId,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public async restartMatch(): Promise<AckResponse> {
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_RESTART,
        {
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public async addBot(role?: Role | null): Promise<AckResponse> {
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_ADD_BOT,
        {
          role,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public async removeBot(botId?: string): Promise<AckResponse> {
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_REMOVE_BOT,
        {
          botId,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public async setRole(role: Role | null, targetPlayerId?: string): Promise<AckResponse> {
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_SET_ROLE,
        {
          role,
          targetPlayerId,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public async autoRoles(): Promise<AckResponse> {
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_AUTO_ROLES,
        {
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public sendChat(text: string, teamOnly = false): void {
    if (this.socket.connected) {
      this.socket.emit(CLIENT_EVENTS.GAME_CHAT, { text, teamOnly });
    }
  }

  public sendPing(pos: [number, number, number]): void {
    if (this.socket.connected) {
      this.socket.emit(CLIENT_EVENTS.GAME_PING, { pos });
    }
  }

  public sendPebble(fromPos: [number, number, number], landingPos: [number, number, number]): void {
    if (this.socket.connected) {
      this.socket.emit(CLIENT_EVENTS.GAME_PEBBLE, { fromPos, landingPos });
    }
  }

  public async setCosmetic(cosmetic: CosmeticPreferences): Promise<AckResponse> {
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_SET_COSMETIC,
        {
          cosmetic,
          requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        (res: AckResponse) => resolve(res)
      );
    });
  }

  public async listRooms(): Promise<PublicRoomSummary[]> {
    // 1. Try fast non-blocking HTTP REST endpoint first
    try {
      const resp = await fetch('/api/rooms', { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const body = (await resp.json()) as { data?: PublicRoomSummary[]; rooms?: PublicRoomSummary[] };
        const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.rooms) ? body.rooms : Array.isArray(body) ? body : null;
        if (list) return list;
      }
    } catch {
      // Fallback to socket
    }

    // 2. Ensure real socket is connected
    this.connectReal();

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (data: PublicRoomSummary[]) => {
        if (!resolved) {
          resolved = true;
          window.clearTimeout(timer);
          this.socket.off(SERVER_EVENTS.ROOM_LIST_RESPONSE, onListResponse);
          resolve(data);
        }
      };

      const timer = window.setTimeout(() => {
        finish([]);
      }, 3000);

      const onListResponse = (summaries: PublicRoomSummary[]) => {
        finish(summaries || []);
      };

      this.socket.once(SERVER_EVENTS.ROOM_LIST_RESPONSE, onListResponse);

      this.socket.emit(
        CLIENT_EVENTS.ROOM_LIST,
        { requestId: `req-${Date.now()}` },
        (res: AckResponse<PublicRoomSummary[]>) => {
          finish(res?.data || []);
        }
      );
    });
  }

  public leaveRoom(): void {
    if (this.socket.connected && !this.isMock && this.currentRoom) this.socket.emit(CLIENT_EVENTS.ROOM_LEAVE, {});
    this.remember(null);
    this.resuming = false;
    this.socket.disconnect();
    this.currentRoom = null;
    this.roomReady = false;
    this.activeRules = DEFAULT_GAME_RULES;
    this.activeMovementRules = movementRules;
    this.resetMarkers();
    this.callbacks.onRoom(null);
  }

  public send(input: ReturnType<InputState['consume']>, yaw: number, pitch: number): number {
    if (this.currentRoom?.phase === 'RESULT') return 0;
    if (this.resuming || !this.socket.connected || !this.roomReady || this.lastTick < 0) return 0;
    if (input.jumpPressed) this.jumpId++;
    if (input.capturePressed) this.captureId++;
    const { moveX, moveZ, sprint, crouch, rescueHeld } = input;

    const frame: InputFrame = {
      seq: ++this.seq,
      moveX,
      moveZ,
      sprint,
      crouch,
      jumpId: this.jumpId,
      captureId: this.captureId,
      rescueHeld,
      yaw,
      pitch,
    };

    this.socket.emit(CLIENT_EVENTS.GAME_INPUT, frame);
    return this.seq;
  }

  public dispose(): void {
    this.socket.disconnect();
    this.resetMarkers();
  }
}
