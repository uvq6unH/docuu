import { io, Socket } from 'socket.io-client';
import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
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
  onGameEvent?: (event: GameEvent) => void;
}

export class GameSession {
  private socket: Socket;
  private group: Group;
  private geometry: CapsuleGeometry;
  private materials: {
    POLICE: MeshStandardMaterial;
    ROBBER: MeshStandardMaterial;
  };
  private markers = new Map<string, Mesh>();
  private lastTick = -1;
  private seq = 0;
  private jumpId = 0;
  private captureId = 0;
  private roomReady = false;
  private localMapHash = '';

  public currentRoom: RoomState | null = null;
  public playerId: string | null = null;
  public resumeToken: string | null = null;
  public isMock = false;

  constructor(scene: Scene, private callbacks: GameSessionCallbacks) {
    this.group = new Group();
    scene.add(this.group);

    this.geometry = new CapsuleGeometry(0.35, 1);
    this.materials = {
      POLICE: new MeshStandardMaterial({ color: '#2876c9' }),
      ROBBER: new MeshStandardMaterial({ color: '#ec8f32' }),
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
      this.callbacks.onStatus('Đã kết nối máy chủ Authoritative.', false);
    });

    this.socket.on('disconnect', (reason) => {
      this.resetMarkers();
      this.callbacks.onStatus(`Đã ngắt kết nối máy chủ (${reason}). Đang thử kết nối lại…`, true);
    });

    this.socket.on('connect_error', () => {
      this.callbacks.onStatus('Chưa kết nối được máy chủ backend (Port 3001). Đang thử lại…', true);
    });

    this.socket.on(SERVER_EVENTS.ROOM_STATE, (room: RoomState) => {
      if (!room) return;
      this.currentRoom = room;
      this.roomReady = true;
      this.callbacks.onRoom(room);
    });

    this.socket.on(SERVER_EVENTS.GAME_SNAPSHOT, (snapshot: Snapshot) => {
      if (
        !this.roomReady ||
        snapshot?.protocolVersion !== PROTOCOL_VERSION ||
        snapshot.tick <= this.lastTick ||
        !snapshot.self?.pos?.every(Number.isFinite) ||
        !Array.isArray(snapshot.players)
      ) {
        return;
      }

      this.lastTick = snapshot.tick;
      const visible = new Set<string>();

      for (const p of snapshot.players) {
        if (
          !p.connected ||
          !this.materials[p.role] ||
          !p.pos?.every(Number.isFinite) ||
          (p.role !== snapshot.self.role && p.state === 'HIDDEN')
        ) {
          continue;
        }

        visible.add(p.id);
        let mesh = this.markers.get(p.id);
        if (!mesh) {
          mesh = new Mesh(this.geometry, this.materials[p.role]);
          this.group.add(mesh);
          this.markers.set(p.id, mesh);
        }

        mesh.scale.y = p.crouch ? 1.1 / 1.7 : 1;
        mesh.position.set(p.pos[0], p.pos[1] + 0.85 * mesh.scale.y, p.pos[2]);
      }

      for (const [id, mesh] of this.markers) {
        if (!visible.has(id)) {
          this.group.remove(mesh);
          this.markers.delete(id);
        }
      }

      this.callbacks.onSnapshot(snapshot);
    });

    this.socket.on(SERVER_EVENTS.GAME_EVENT, (event: GameEvent) => {
      this.callbacks.onGameEvent?.(event);
    });
  }

  private resetMarkers(): void {
    this.group.clear();
    this.markers.clear();
    this.lastTick = -1;
  }

  public connect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
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
    this.connect();
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
            this.playerId = res.data.playerId;
            this.resumeToken = res.data.resumeToken;
          }
          resolve(res);
        }
      );
    });
  }

  public async joinRoom(roomCode: string, name: string): Promise<AckResponse<{ roomCode: string; playerId: string; resumeToken: string }>> {
    this.connect();
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
            this.playerId = res.data.playerId;
            this.resumeToken = res.data.resumeToken;
          }
          resolve(res);
        }
      );
    });
  }

  public async toggleReady(ready: boolean): Promise<AckResponse> {
    const hash = await this.getMapHash();
    return new Promise((resolve) => {
      this.socket.emit(
        CLIENT_EVENTS.ROOM_READY,
        {
          ready,
          mapHash: hash,
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
    this.socket.emit(CLIENT_EVENTS.ROOM_LEAVE, {});
    this.currentRoom = null;
    this.roomReady = false;
    this.resetMarkers();
    this.callbacks.onRoom(null);
  }

  public connectMock(spawnParam?: string): void {
    this.isMock = true;
    if (spawnParam) {
      this.socket.io.opts.query = { spawn: spawnParam };
    }
    this.socket.connect();
  }

  public send(input: ReturnType<InputState['consume']>, yaw: number, pitch: number): void {
    if (!this.socket.connected || !this.roomReady || this.lastTick < 0) return;
    if (input.jumpPressed) this.jumpId++;
    if (input.capturePressed) this.captureId++;
    const { moveX, moveZ, sprint, crouch, rescueHeld } = input;
    const frame: InputFrame = {
      seq: ++this.seq,
      moveX,
      moveZ,
      sprint,
      crouch,
      rescueHeld,
      yaw,
      pitch,
      jumpId: this.jumpId,
      captureId: this.captureId,
    };
    this.socket.volatile.emit(CLIENT_EVENTS.GAME_INPUT, frame);
  }

  public dispose(): void {
    this.socket.off().disconnect();
    this.group.removeFromParent();
    this.resetMarkers();
    this.geometry.dispose();
    this.materials.POLICE.dispose();
    this.materials.ROBBER.dispose();
  }
}
