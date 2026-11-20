import { io } from 'socket.io-client';
import { Group, type Scene } from 'three';
import {
  CLIENT_EVENTS, SERVER_EVENTS, PROTOCOL_VERSION,
  type InputFrame, type RoomState, type Snapshot,
} from '../../../packages/shared/src/protocol';
import type { InputState } from '../input/state';
import { CharacterAvatar, createCharacterModel } from '../player/character-avatar';

export function connectMock(
  scene: Scene, onSnapshot: (snapshot: Snapshot) => void,
  onStatus: (message: string) => void, onRoom: (room: RoomState | null) => void,
) {
  const spawnParam = new URLSearchParams(window.location.search).get('spawn');
  const socket = io({
    autoConnect: false,
    ...(spawnParam ? { query: { spawn: spawnParam } } : {}),
  });
  const group = new Group();
  scene.add(group);
  const markers = new Map<string, CharacterAvatar>();
  let roomReady = false;
  let lastTick = -1;
  let seq = 0, jumpId = 0, captureId = 0;

  function reset(message: string) {
    roomReady = false;
    lastTick = -1;
    seq = jumpId = captureId = 0;
    for (const avatar of markers.values()) {
      avatar.dispose();
    }
    group.clear();
    markers.clear();
    onRoom(null);
    onStatus(message);
  }
  socket.on('disconnect', () => reset('Đã mất kết nối backend thử nghiệm.'));
  socket.on('connect_error', () => reset('Chưa kết nối được backend thử nghiệm. Đang thử lại…'));
  socket.on(SERVER_EVENTS.ROOM_STATE, (room: RoomState) => {
    if (room?.protocolVersion !== PROTOCOL_VERSION || room.roomCode !== 'MOCK01' || !Array.isArray(room.roster) ||
        room.mapHash !== 'mock-map-hash') {
      socket.disconnect();
      reset('Backend này không phải phòng thử MOCK01 phiên bản 1.');
      return;
    }
    onRoom(room);
    roomReady = true;
  });
  socket.on(SERVER_EVENTS.GAME_SNAPSHOT, (snapshot: Snapshot) => {
    if (!roomReady || snapshot?.protocolVersion !== PROTOCOL_VERSION || snapshot.tick <= lastTick ||
        !snapshot.self?.pos?.every(Number.isFinite) || !Array.isArray(snapshot.players)) return;
    lastTick = snapshot.tick;
    const visible = new Set<string>();
    for (const p of snapshot.players) {
      if (!p.connected || !['POLICE', 'ROBBER'].includes(p.role) || !p.pos?.every(Number.isFinite) ||
          (p.role !== snapshot.self.role && p.state === 'HIDDEN')) continue;
      visible.add(p.id);
      let avatar = markers.get(p.id);
      if (!avatar) {
        avatar = createCharacterModel(p.role);
        group.add(avatar.root);
        markers.set(p.id, avatar);
      } else if (avatar.role !== p.role) {
        avatar.setRole(p.role);
      }
      avatar.root.position.set(p.pos[0], p.pos[1], p.pos[2]);
      avatar.root.rotation.y = p.yaw || 0;
      avatar.update(1 / 30, {
        speed: (p as { speed?: number }).speed ?? 0,
        crouch: Boolean(p.crouch),
        grounded: true,
        jailed: p.state === 'JAILED',
      });
    }
    for (const [id, avatar] of markers) {
      if (!visible.has(id)) {
        avatar.dispose();
        group.remove(avatar.root);
        markers.delete(id);
      }
    }
    onSnapshot(snapshot);
  });
  socket.connect();
  return {
    send(input: ReturnType<InputState['consume']>, yaw: number, pitch: number) {
      if (!socket.connected || !roomReady || lastTick < 0) return;
      if (input.jumpPressed) jumpId++;
      if (input.capturePressed) captureId++;
      const { moveX, moveZ, sprint, crouch, rescueHeld } = input;
      const frame: InputFrame = { seq: ++seq, moveX, moveZ, sprint, crouch, rescueHeld, yaw, pitch, jumpId, captureId };
      socket.volatile.emit(CLIENT_EVENTS.GAME_INPUT, frame);
    },
    dispose() {
      socket.off().disconnect();
      group.removeFromParent();
      for (const avatar of markers.values()) {
        avatar.dispose();
      }
      group.clear();
      markers.clear();
    },
  };
}
