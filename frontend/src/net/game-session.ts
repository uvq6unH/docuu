import { io, Socket } from 'socket.io-client';
import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Scene } from 'three';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  PROTOCOL_VERSION,
  type InputFrame,
  type RoomState,
  type Snapshot,
  type GameEvent,
  type AckResponse,
} from '../../../packages/shared/src/protocol';
import type { InputState } from '../input/state';
import { readMapDigest } from './room-details';

export interface GameSessionCallbacks {
  onStatus: (message: string, isError?: boolean) => void;
  onRoom: (room: RoomState | null) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  onInterrupted?: () => void;
  onGameEvent?: (event: GameEvent) => void;
}

type Credentials = { roomCode: string; playerId: string; resumeToken: string };
const sessionKey = 'folk_tag_room_v1';

export interface RemotePlayerEntity {
  id: string;
  role: 'POLICE' | 'ROBBER';
  mesh: Mesh;
  currentPos: Vector3;
  targetPos: Vector3;
  currentYaw: number;
  targetYaw: number;
  targetScaleY: number;
  state?: string | undefined;
  crouch: boolean;
}

export class GameSession {
  private credentials: Credentials | null = null;
  private resuming = false;
  private socket: Socket;
  private group: Group;
  private geometry: CapsuleGeometry;
  private materials: {
    POLICE: MeshStandardMaterial;
    ROBBER: MeshStandardMaterial;
  };
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

  constructor(scene: Scene, private callbacks: GameSessionCallbacks) {
    this.group = new Group();
    scene.add(this.group);

    this.geometry = new CapsuleGeometry(0.35, 1);
    this.materials = {
      POLICE: new MeshStandardMaterial({ color: '#2876c9', roughness: 0.4 }),
      ROBBER: new MeshStandardMaterial({ color: '#ec8f32', roughness: 0.4 }),
    };

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
          !p.connected ||
          !this.materials[p.role] ||
          !p.pos?.every(Number.isFinite) ||
          (p.role !== snapshot.self.role && p.state === 'HIDDEN' && Math.hypot(p.pos[0] - snapshot.self.pos[0], p.pos[2] - snapshot.self.pos[2]) > 2)
        ) {
          continue;
        }

        visible.add(p.id);
        const scaleY = p.crouch ? 1.1 / 1.7 : 1;
        const targetY = p.pos[1] + 0.85 * scaleY;

        let entity = this.entities.get(p.id);
        if (!entity) {
          const mesh = new Mesh(this.geometry, this.materials[p.role]);
          mesh.scale.y = scaleY;
          mesh.position.set(p.pos[0], targetY, p.pos[2]);
          mesh.rotation.y = p.yaw || 0;
          this.group.add(mesh);

          entity = {
            id: p.id,
            role: p.role,
            mesh,
            currentPos: new Vector3(p.pos[0], targetY, p.pos[2]),
            targetPos: new Vector3(p.pos[0], targetY, p.pos[2]),
            currentYaw: p.yaw || 0,
            targetYaw: p.yaw || 0,
            targetScaleY: scaleY,
            state: p.state,
            crouch: Boolean(p.crouch),
          };
          this.entities.set(p.id, entity);
        } else {
          entity.targetPos.set(p.pos[0], targetY, p.pos[2]);
          entity.targetYaw = p.yaw || 0;
          entity.targetScaleY = scaleY;
          entity.state = p.state;
          entity.crouch = Boolean(p.crouch);
        }
      }

      // Remove entities no longer visible
      for (const [id, entity] of this.entities) {
        if (!visible.has(id)) {
          this.group.remove(entity.mesh);
          this.entities.delete(id);
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
  }

  /**
   * N04 Remote Player Interpolation:
   * Smoothly interpolates remote players' positions and rotations at 60 FPS in render loop.
   */
  public updateRemoteInterpolation(dtSeconds: number): void {
    if (this.entities.size === 0) return;
    const lerpFactor = Math.min(1, Math.max(0.01, dtSeconds * 22));

    for (const entity of this.entities.values()) {
      // If position jumped by more than 3.0m (teleport to jail cell / respawn), snap immediately
      if (entity.currentPos.distanceTo(entity.targetPos) > 3.0) {
        entity.currentPos.copy(entity.targetPos);
      } else {
        entity.currentPos.lerp(entity.targetPos, lerpFactor);
      }
      entity.mesh.position.copy(entity.currentPos);

      // Smooth yaw angle interpolation with wrapping
      let diff = (entity.targetYaw - entity.currentYaw + Math.PI) % (Math.PI * 2) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      entity.currentYaw += diff * lerpFactor;
      entity.mesh.rotation.y = entity.currentYaw;

      // Smooth crouch scaling
      entity.mesh.scale.y += (entity.targetScaleY - entity.mesh.scale.y) * lerpFactor;
    }
  }

  public getRemoteEntities(): ReadonlyMap<string, RemotePlayerEntity> {
    return this.entities;
  }

  private resetMarkers(): void {
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

  public leaveRoom(): void {
    if (this.socket.connected && !this.isMock && this.currentRoom) this.socket.emit(CLIENT_EVENTS.ROOM_LEAVE, {});
    this.remember(null);
    this.resuming = false;
    this.socket.disconnect();
    this.currentRoom = null;
    this.roomReady = false;
    this.resetMarkers();
    this.callbacks.onRoom(null);
  }

  public send(input: ReturnType<InputState['consume']>, yaw: number, pitch: number): void {
    if (this.resuming || !this.socket.connected || !this.roomReady || this.lastTick < 0) return;
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
  }

  public dispose(): void {
    this.socket.disconnect();
    this.resetMarkers();
    this.geometry.dispose();
    this.materials.POLICE.dispose();
    this.materials.ROBBER.dispose();
  }
}
